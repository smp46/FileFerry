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
import type { ErrorHandler } from '@utils/ErrorHandler';

/**
 * Interface for the file header object.
 * @internal
 */
interface FileHeader {
  name: string;
  size: number;
  type: string;
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
  private errorHandler: ErrorHandler;
  private readonly protocol: string;

  // Sender paramters
  private transferProgressBytes: number;

  // Receiver parameters
  private receivedFileStream: PolyfillWritableStream<Uint8Array> | null = null;
  private receivedFileWriter: PolyfillWritableStreamDefaultWriter<Uint8Array> | null =
    null;
  private fileNameFromHeader: string;
  private fileSizeFromHeader: number;
  private fileTypeFromHeader: string;
  private headerReceived: boolean;
  private receivedBytesTotal: number;
  private retryAttempts: number;

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
    errorHandler: ErrorHandler,
  ) {
    this.node = node;
    this.appState = appState;
    this.progressTracker = progressTracker;
    this.uiManager = uiManager;
    this.errorHandler = errorHandler;
    this.protocol = '/fileferry/filetransfer/1.0.0';
    this.retryAttempts = 0;

    // Sender paramters
    this.transferProgressBytes = 0;

    // Receiver parameters
    this.receivedFileStream = null;
    this.receivedFileWriter = null;
    this.fileNameFromHeader = 'downloaded_file';
    this.fileSizeFromHeader = 0;
    this.fileTypeFromHeader = 'application/octet-stream';
    this.headerReceived = false;
    this.receivedBytesTotal = 0;

    streamSaver.WritableStream = PolyfillWritableStream;
    window.WritableStream = PolyfillWritableStream;
  }

  /**
   * Sets up the handler for the file transfer protocol.
   */
  public setupFileTransferProtocol(): void {
    const handler: StreamHandler = async ({ stream, connection }) => {
      this.appState.setActivePeer(connection.remotePeer.toString());
      this.appState.setTransferConnectionId(connection.id);

      if (this.appState.isTransferActive()) {
        console.log('Resuming file transfer after reconnection.');
        this.appState.setActiveStream(stream);
      } else {
        this.appState.setActiveStream(stream);
        this.appState.setActiveTransfer();
      }

      await this.handleFileTransfer();
    };
    this.node.handle(this.protocol, handler);
  }

  /**
   * Starts sending the selected file.
   */
  public async startFileTransfer(): Promise<void> {
    try {
      const activeStream = this.appState.getActiveStream();
      const selectedFile = this.appState.getSelectedFile();

      if (!activeStream || !selectedFile) {
        throw new Error('No active stream or file to start transfer.');
      }

      if (this.appState.isTransferActive()) {
        console.log('Resuming file transfer after reconnection.');
        await this.sendFileToStream(activeStream, selectedFile);
      } else {
        this.appState.setActiveTransfer();
        await this.sendFileToStream(activeStream, selectedFile);
      }
      this.appState.declareFinished();
      await this.node.stop();
      return;
    } catch (error) {
      if (this.retryAttempts > 10) {
        this.errorHandler.handleTransferError(error as Error, {
          direction: 'send',
        });
      }
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

      this.appState.declareFinished();
      await this.node.stop();
      return;
    } catch (error) {
      if (this.retryAttempts > 10) {
        this._resetReceiverState();
        this.errorHandler.handleTransferError(error as Error, {
          direction: 'receive',
        });
      }
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
    chunkSize: number = 1024 * 32,
  ): Promise<void> {
    try {
      const header = this.createFileHeader(file);
      const encodedHeader = new TextEncoder().encode(header + '\n');

      let bytesSent = 0;
      const channel = (stream as any).channel as RTCDataChannel;
      const threshold = channel.bufferedAmountLowThreshold || 1024 * 64;

      const fileChunks = async function* (this: FileTransferManager) {
        yield new Uint8ArrayList(encodedHeader);
        await new Promise((resolve) => setTimeout(resolve, 1));

        for (let offset = 0; offset < file.size; offset += chunkSize) {
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
            await new Promise<void>((resolve) => {
              channel.addEventListener('bufferedamountlow', () => resolve(), {
                once: true,
              });
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
      this.transferProgressBytes = 0;

      await stream.close();
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
  private createFileHeader(file: File): string {
    return JSON.stringify({
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
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
            this.headerReceived = true;

            console.log(
              `Receiving file: ${this.fileNameFromHeader} (${this.fileSizeFromHeader} bytes)`,
            );

            if (this.receivedFileStream === null) {
              this.receivedFileStream = streamSaver.createWriteStream(
                this.fileNameFromHeader,
                {
                  size: fileSizeFromHeader,
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

          if (this.receivedFileWriter != null) {
            await this.receivedFileWriter.close();
            this.receivedFileWriter = null;
          }

          this.appState.clearActiveTransfer();
          await this.closeActiveStream();
          this._resetReceiverState();
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
  private async closeActiveStream(): Promise<void> {
    const stream = this.appState.getActiveStream();
    if (stream) {
      await stream.close();
      this.appState.setActiveStream(null!);
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
   * Resets the state of the receiver.
   * @internal
   */
  private _resetReceiverState(): void {
    this.receivedFileStream = null;
    this.fileNameFromHeader = 'downloaded_file';
    this.fileSizeFromHeader = 0;
    this.fileTypeFromHeader = 'application/octet-stream';
    this.headerReceived = false;
    this.receivedBytesTotal = 0;
  }
}
