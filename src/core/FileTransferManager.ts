// core/FileTransferManager.ts
import { Uint8ArrayList } from 'uint8arraylist';
import { pipe } from 'it-pipe';
import {
  WritableStream as PolyfillWritableStream,
  WritableStreamDefaultWriter as PolyfillWritableStreamDefaultWriter,
} from 'web-streams-polyfill';
import streamSaver from 'streamsaver';
import type { Libp2p } from 'libp2p';
import type { Stream, StreamHandler } from '@libp2p/interface';
import type { AppState } from '@/core/AppState';
import type { ProgressTracker } from '@ui/ProgressTracker';
import type { UIManager } from '@ui/UIManager';

/**
 * Interface for the file header object.
 * @internal
 */
interface FileHeader {
  name: string;
  size: number;
  type: string;
  hash: string;
}

/**
 * Interface for the parsed header result.
 * @internal
 */
interface ParsedHeaderResult {
  header: FileHeader | null;
  bodyData: Uint8Array | null;
}

/**
 * Handles the logic for sending and receiving files over libp2p streams,
 * including header parsing, chunking, and progress reporting.
 */
export class FileTransferManager {
  private node: Libp2p;
  private appState: AppState;
  private progressTracker: ProgressTracker;
  private uiManager: UIManager;
  private readonly protocol: string;
  private wakeLock: WakeLockSentinel | null = null;
  private hash: number;

  // Sender paramters
  private transferProgressBytes: number;

  // Receiver parameters
  private receivedFileStream: PolyfillWritableStream<Uint8Array> | null = null;
  private receivedFileWriter: PolyfillWritableStreamDefaultWriter<Uint8Array> | null =
    null;
  private fileNameFromHeader: string;
  private fileSizeFromHeader: number;
  private fileTypeFromHeader: string;
  private fileHashFromHeader: number;
  private headerReceived: boolean;
  private receivedBytesTotal: number;

  /**
   * Initializes the FileTransferManager.
   * @param node - The libp2p node instance.
   * @param appState - The application state.
   * @param progressTracker - The progress tracker instance.
   * @param uiManager - The UI manager instance.
   * @param errorHandler - The error handler instance.
   */
  public constructor(
    node: Libp2p,
    appState: AppState,
    progressTracker: ProgressTracker,
    uiManager: UIManager,
  ) {
    this.node = node;
    this.appState = appState;
    this.progressTracker = progressTracker;
    this.uiManager = uiManager;
    this.protocol = '/fileferry/filetransfer/1.0.0';
    this.wakeLock = null;
    this.hash = 0x811c9dc5; // FNV-1a hash initial value

    // Sender paramters
    this.transferProgressBytes = 0;

    // Receiver parameters
    this.receivedFileStream = null;
    this.receivedFileWriter = null;
    this.fileNameFromHeader = 'downloaded_file';
    this.fileSizeFromHeader = 0;
    this.fileTypeFromHeader = 'application/octet-stream';
    this.fileHashFromHeader = 0;
    this.headerReceived = false;
    this.receivedBytesTotal = 0;

    streamSaver.WritableStream = PolyfillWritableStream;
    streamSaver.mitm = 'https://fileferry.xyz/streamsaver/mitm.html';
    window.WritableStream = PolyfillWritableStream;
  }

  /**
   * Sets up the handler for the file transfer protocol.
   */
  public setupFileTransferProtocol(): void {
    const handler: StreamHandler = async ({ stream, connection }) => {
      if (this.appState.isTransferActive() && !this.appState.hasReconnected()) {
        return;
      }
      this.getWakelock();
      this.appState.setActivePeer(connection.remotePeer.toString());
      this.appState.setTransferConnectionId(connection.id);

      if (this.appState.isTransferActive() && this.appState.hasReconnected()) {
        console.log('Resuming file transfer after reconnection.');
      }

      this.appState.setActiveStream(stream);
      this.appState.setActiveTransfer();
      await this.handleFileTransfer();

      if (this.appState.isFinished()) {
        await this.transferComplete();
      }
    };
    this.node.handle(this.protocol, handler);
  }

  /**
   * Starts sending the selected file.
   */
  public async startFileTransfer(): Promise<void> {
    try {
      if (this.appState.isTransferActive() && !this.appState.hasReconnected()) {
        return;
      }
      const activeStream = this.appState.getActiveStream();
      const selectedFile = this.appState.getSelectedFile();

      if (!activeStream || !selectedFile) {
        throw new Error('No active stream or file to start transfer.');
      }

      if (this.appState.isTransferActive() && this.appState.hasReconnected()) {
        console.log('Resuming file transfer after reconnection.');
      } else {
        this.appState.setActiveTransfer();
      }

      await this.sendFileToStream(activeStream, selectedFile);

      if (this.appState.isFinished()) {
        await this.transferComplete();
      }
    } catch (error) {
      // Let connection management handle the error
      throw error;
    }
  }

  /**
   * Handles an incoming file transfer request.
   */
  public async handleFileTransfer(): Promise<void> {
    try {
      const activeStream = this.appState.getActiveStream();
      if (!activeStream) {
        throw new Error('No active stream to handle transfer.');
      }
      await this.receiveFileFromStream(activeStream);

      if (this.appState.isFinished()) {
        await this.transferComplete();
      }
    } catch (_) {
      // Let connection management handle the error
    }
  }

  /**
   * Sends a file to a stream, chunk by chunk.
   * @param stream - The stream to write to.
   * @param file - The file to send.
   * @param chunkSize - The size of each chunk in bytes.
   * @internal
   */
  private async sendFileToStream(
    stream: Stream,
    file: File,
    chunkSize: number = 16_384, // the WebRTC default message size
  ): Promise<void> {
    try {
      const header = await this.createFileHeader(file);
      const encodedHeader = new TextEncoder().encode(header + '\n');

      let bytesSent = 0;
      const channel = (stream as any).channel as RTCDataChannel;
      const threshold = channel.bufferedAmountLowThreshold || 1024 * 64;

      const fileChunks = async function* (this: FileTransferManager) {
        yield new Uint8ArrayList(encodedHeader);
        await new Promise((resolve) => setTimeout(resolve, 1));

        for (let offset = 0; offset < file.size; offset += chunkSize) {
          if (channel.readyState !== 'open') {
            console.log(
              `Stream is no longer open. Current state: ${channel.readyState}`,
            );
          }
          const slice = file.slice(
            offset,
            Math.min(offset + chunkSize, file.size),
          );
          const chunk = new Uint8Array(await slice.arrayBuffer());

          // Skip already sent bytes
          if (bytesSent < this.transferProgressBytes) {
            bytesSent += chunk.length;
            continue;
          }

          yield new Uint8ArrayList(chunk);

          if (channel.bufferedAmount > threshold) {
            await new Promise<void>((resolve, reject) => {
              const onBufferedAmountLow = () => {
                cleanup();
                resolve();
              };
              const onClose = () => {
                cleanup();
                this.closeActiveStream(stream);
                console.log('Closing active stream due to channel close.');
                reject();
              };

              const cleanup = () => {
                channel.removeEventListener(
                  'bufferedamountlow',
                  onBufferedAmountLow,
                );
                channel.removeEventListener('close', onClose);
              };

              channel.addEventListener(
                'bufferedamountlow',
                onBufferedAmountLow,
                { once: true },
              );
              channel.addEventListener('close', onClose, { once: true });
            });
          }

          bytesSent += chunk.length;
          this.transferProgressBytes += chunk.length;
          this.progressTracker.updateProgress(
            this.transferProgressBytes,
            file.size,
            'send',
          );
        }
      }.bind(this);

      await pipe(fileChunks(), stream.sink);

      this.progressTracker.updateProgress(
        this.transferProgressBytes,
        file.size,
        'send',
        true,
      );

      // Wait for the receiver to close the stream
      while (stream.status === 'open' || stream.status === 'closing') {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      this.appState.declareFinished();
    } catch (error) {
      throw error;
    }
  }

  /**
   * Creates the JSON string for the file header.
   * @param file - The file to create a header for.
   * @returns The JSON stringified header.
   * @internal
   */
  private async createFileHeader(file: File): Promise<string> {
    return JSON.stringify({
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      hash: await this.senderHash(),
    });
  }

  /**
   * Receives a file from a stream using StreamSaver.
   * @param stream - The stream to read from.
   * @internal
   */
  private async receiveFileFromStream(stream: Stream): Promise<void> {
    try {
      for await (const ualistChunk of stream.source) {
        if (!ualistChunk || ualistChunk.length === 0) {
          continue;
        }

        const dataChunk = ualistChunk.subarray();

        if (!this.headerReceived) {
          const headerResult = this.parseFileHeader(dataChunk);
          if (headerResult.header) {
            this.fileNameFromHeader =
              headerResult.header.name || this.fileNameFromHeader;
            this.fileSizeFromHeader =
              headerResult.header.size || this.fileSizeFromHeader;
            this.fileTypeFromHeader =
              headerResult.header.type || this.fileTypeFromHeader;
            this.fileHashFromHeader =
              Number(headerResult.header.hash) || this.fileHashFromHeader;
            this.headerReceived = true;

            console.log(
              `Receiving file: ${this.fileNameFromHeader} (${this.fileSizeFromHeader} bytes)`,
            );

            if (this.receivedFileStream === null) {
              this.receivedFileStream = streamSaver.createWriteStream(
                this.fileNameFromHeader,
                {
                  size: this.fileSizeFromHeader,
                },
              ) as PolyfillWritableStream<Uint8Array>;
            }
            if (this.receivedFileWriter === null) {
              this.receivedFileWriter = this.receivedFileStream.getWriter();
            }
          }

          if (
            headerResult.bodyData &&
            headerResult.bodyData.length > 0 &&
            this.receivedFileWriter != null
          ) {
            await this.receivedFileWriter.write(headerResult.bodyData);
            this.receivedBytesTotal += headerResult.bodyData.length;
            this.progressTracker.updateProgress(
              this.receivedBytesTotal,
              this.fileSizeFromHeader,
              'receive',
            );
          }
        } else if (this.receivedFileWriter != null) {
          await this.receivedFileWriter.write(dataChunk);
          this.hash = this.fnv1aHash(dataChunk, this.hash);
          this.receivedBytesTotal += dataChunk.length;
          this.progressTracker.updateProgress(
            this.receivedBytesTotal,
            this.fileSizeFromHeader,
            'receive',
          );
        }

        if (
          this.headerReceived &&
          this.receivedBytesTotal >= this.fileSizeFromHeader &&
          this.fileSizeFromHeader > 0
        ) {
          this.progressTracker.updateProgress(
            this.receivedBytesTotal,
            this.fileSizeFromHeader,
            'receive',
            true,
          );

          this.uiManager.showReceivedFileDetails(
            this.fileNameFromHeader,
            this.fileSizeFromHeader,
          );

          if (this.hash != this.fileHashFromHeader) {
            this.uiManager.showErrorPopup(
              "Sorry mate, the file's hash does not match. The file may be corrupted.\nHash received: " +
                this.fileHashFromHeader +
                '\n Computed Hash from Transfer: ' +
                this.hash,
            );
          }

          this.receivedFileWriter?.close();
          this.receivedFileWriter = null;
          await this.closeActiveStream(stream);
          this.appState.declareFinished();

          break;
        }
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Closes the active file transfer stream.
   * @returns A promise that resolves when the stream is closed.
   */
  private async closeActiveStream(stream: Stream): Promise<void> {
    if (stream) {
      await stream.close();
      if (stream.id === this.appState.getActiveStream()?.id) {
        this.appState.setActiveStream(null!);
      }
    }
  }

  /**
   * Parses the file header from an incoming data chunk.
   * @param dataChunk - The data chunk to parse.
   * @returns An object containing the parsed header and any remaining body data.
   * @internal
   */
  private parseFileHeader(dataChunk: Uint8Array): ParsedHeaderResult {
    try {
      const potentialHeaderText = new TextDecoder('utf-8', {
        fatal: false,
      }).decode(dataChunk);
      const newlineIndex = potentialHeaderText.indexOf('\n');

      if (newlineIndex !== -1) {
        const headerJsonString = potentialHeaderText.substring(0, newlineIndex);
        const encodedHeader = new TextEncoder().encode(headerJsonString + '\n');
        const bodyStartIndex = encodedHeader.length;

        try {
          const parsedHeaderObject: FileHeader = JSON.parse(headerJsonString);
          const bodyData =
            bodyStartIndex < dataChunk.byteLength
              ? dataChunk.subarray(bodyStartIndex)
              : null;

          return { header: parsedHeaderObject, bodyData };
        } catch (e) {
          return { header: null, bodyData: dataChunk };
        }
      }

      return { header: null, bodyData: dataChunk };
    } catch (error) {
      return { header: null, bodyData: dataChunk };
    }
  }

  /**
   * Tries to acquire a wake lock to prevent the device from sleeping during file transfer.
   * Stores the wake lock sentinel in the `wakeLock` property.
   */
  private async getWakelock() {
    if ('wakeLock' in navigator) {
      async function requestWakeLock() {
        let wakelock: WakeLockSentinel | null = null;
        try {
          wakelock = await navigator.wakeLock.request('screen');
          return wakelock;
        } catch (_) {
          return null;
        }
      }

      this.wakeLock = (await requestWakeLock()) || null;
    }
  }

  /**
   * Releases the held wake lock if it exists.
   */
  private async releaseWakelock() {
    this.wakeLock?.release().catch((_) => {});
  }

  /**
   * Computes the FNV-1a hash for a given Uint8Array.
   *
   * @param data - The input data to hash.
   * @param initialHash - The initial hash value (optional).
   * @returns The updated hash value after processing the data.
   */
  private fnv1aHash(data: Uint8Array, initialHash: number): number {
    let hash = initialHash;
    for (let byte of data) {
      hash = ((byte ^ hash) * 0x01000193) & 0xffffffff;
    }
    return hash;
  }

  /**
   * Computes the FNV-1a hash for a file by processing it in chunks.
   *
   * @returns The final FNV-1a hash value of the file, or 0 if no file is selected.
   */
  private async senderHash(): Promise<number> {
    const file = this.appState.getSelectedFile();
    const chunkSize = 16_384;

    if (file === null) {
      return 0;
    }

    // Generator function to yield chunks of the file
    const fileChunks = async function* (): AsyncGenerator<Uint8Array> {
      for (let offset = 0; offset < file.size; offset += chunkSize) {
        const slice = file.slice(
          offset,
          Math.min(offset + chunkSize, file.size),
        );
        const arrayBuffer = await slice.arrayBuffer();
        yield new Uint8Array(arrayBuffer);
      }
    }.bind(this);

    let finalHash = this.hash;

    // Process each chunk and update the hash
    for await (const chunk of fileChunks()) {
      finalHash = this.fnv1aHash(chunk, finalHash);
    }

    return finalHash;
  }

  /**
   * Safely cleanups and exits js-libp2p on transfer completion.
   * If streamSaver still has an active stream, it will close it.
   */
  public async transferComplete() {
    if (
      this.appState.isTransferActive() &&
      this.appState.getMode() === 'receiver'
    ) {
      try {
        this.receivedFileWriter?.close();
        this.closeActiveStream(this.appState.getActiveStream()!);
      } catch (_) {}
    }

    await this.node.stop();
    this.releaseWakelock();
  }
}
