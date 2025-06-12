import { Uint8ArrayList } from 'uint8arraylist';
import { pipe } from 'it-pipe';

export class FileTransferManager {
  constructor(node, appState, progressTracker, uiManager, errorHandler) {
    this.node = node;
    this.appState = appState;
    this.progressTracker = progressTracker;
    this.uiManager = uiManager;
    this.errorHandler = errorHandler;
    this.protocol = '/fileferry/filetransfer/1.0.0';

    // Sender paramters
    this.transferProgressBytes = 0;

    // Receiver parameters
    this.receivedFileBuffer = [];
    this.fileNameFromHeader = 'downloaded_file';
    this.fileSizeFromHeader = 0;
    this.fileTypeFromHeader = 'application/octet-stream';
    this.headerReceived = false;
    this.receivedBytesTotal = 0;

    this.retryAttempts = 0;
  }

  setupFileTransferProtocol() {
    this.node.handle(this.protocol, async ({ stream, connection }) => {
      if (this.appState.isTransferActive()) {
        this.appState.setActiveStream(stream);
        this.appState.setActivePeer(connection.remotePeer);
      } else {
        this.appState.setActiveStream(stream);
        this.appState.setActiveTransfer(true);
      }

      await this.handleFileTransfer();
    });
  }

  async startFileTransfer() {
    try {
      if (this.appState.isTransferActive()) {
        console.log('Resuming file transfer after reconnection.');
        this.sendFileToStream(
          this.appState.getActiveStream(),
          this.appState.getSelectedFile(),
        );
      } else {
        this.appState.setActiveTransfer(true);
        this.sendFileToStream(
          this.appState.getActiveStream(),
          this.appState.getSelectedFile(),
        );
      }
      this.appState.clearActiveTransfer();
    } catch (error) {
      if (this.retryAttempts > 10) {
        this.errorHandler.handleTransferError(error, { direction: 'send' });
      }
    }
  }

  async handleFileTransfer() {
    try {
      await this.receiveFileFromStream(this.appState.getActiveStream());
    } catch (error) {
      if (this.retryAttempts > 10) {
        this._resetReceiverState();
        this.errorHandler.handleTransferError(error, { direction: 'receive' });
      }
    }
  }

  async sendFileToStream(stream, file, chunkSize = 1024 * 64) {
    try {
      const header = this.createFileHeader(file);
      const encodedHeader = new TextEncoder().encode(header + '\n');

      let bytesSent = 0;
      const channel = stream.channel;
      const threshold = channel.bufferedAmountLowThreshold || 1024 * 64;

      const fileChunks = async function* () {
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
            await new Promise((resolve) => {
              channel.addEventListener('bufferedamountlow', resolve, {
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
    } catch (error) {
      throw error;
    }
  }

  createFileHeader(file) {
    return JSON.stringify({
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
    });
  }

  async receiveFileFromStream(stream) {
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
          }

          if (headerResult.bodyData && headerResult.bodyData.length > 0) {
            this.receivedFileBuffer.push(headerResult.bodyData);
            this.receivedBytesTotal += headerResult.bodyData.length;
            this.progressTracker.updateProgress(
              this.receivedBytesTotal,
              this.fileSizeFromHeader,
              'receive',
            );
          }
        } else {
          this.receivedFileBuffer.push(dataChunk);
          this.receivedBytesTotal += dataChunk.length;
          this.progressTracker.updateProgress(
            this.receivedBytesTotal,
            this.fileSizeFromHeader,
            'receive',
          );
        }

        if (
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

          await this.saveReceivedFile(
            this.receivedFileBuffer,
            this.fileNameFromHeader,
            this.fileTypeFromHeader,
          );
          this.appState.clearActiveTransfer();
          await this.closeActiveStream();
          break;
        }
      }
    } catch (error) {
      throw error;
    }
  }

  parseFileHeader(dataChunk) {
    try {
      const potentialHeaderText = new TextDecoder('utf-8', {
        fatal: false,
      }).decode(dataChunk);
      const newlineIndex = potentialHeaderText.indexOf('\n');

      if (newlineIndex !== -1) {
        const headerJsonString = potentialHeaderText.substring(0, newlineIndex);
        const encodedHeaderWithLength = new TextEncoder().encode(
          headerJsonString + '\n',
        ).byteLength;
        const bodyStartIndex = encodedHeaderWithLength;

        try {
          const parsedHeaderObject = JSON.parse(headerJsonString);
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

  async saveReceivedFile(buffer, filename, type) {
    const completeFileBlob = new Blob(buffer, { type });
    const downloadLink = URL.createObjectURL(completeFileBlob);

    const a = document.createElement('a');
    a.href = downloadLink;
    a.download = filename;
    a.style.display = 'none';

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => {
      URL.revokeObjectURL(downloadLink);
    }, 100);
  }

  _resetReceiverState() {
    this.receivedFileBuffer = [];
    this.fileNameFromHeader = 'downloaded_file';
    this.fileSizeFromHeader = 0;
    this.fileTypeFromHeader = 'application/octet-stream';
    this.headerReceived = false;
    this.receivedBytesTotal = 0;
  }
}
