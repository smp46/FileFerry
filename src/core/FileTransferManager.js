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
  }

  setupFileTransferProtocol() {
    this.node.handle(this.protocol, async ({ stream, connection }) => {
      await this.handleFileTransfer(stream, connection);
    });
  }

  async startFileTransfer() {
    try {
      this.appState.setActiveTransfer(true);
      this.sendFileToStream(
        this.appState.getActiveStream(),
        this.appState.getSelectedFile(),
      );
      this.appState.clearActiveTransfer();
    } catch (error) {
      this.errorHandler.handleTransferError(error, { direction: 'send' });
    }
  }

  async handleFileTransfer(stream, connection) {
    try {
      console.log(
        'Incoming file transfer from:',
        connection.remotePeer.toString(),
      );
      this.appState.setActiveStream(stream);
      this.appState.setActivePeer(connection.remotePeer);

      await this.receiveFileFromStream(stream);
    } catch (error) {
      this.errorHandler.handleTransferError(error, { direction: 'receive' });
    } finally {
      this.appState.setActiveStream(null);
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

          yield new Uint8ArrayList(chunk);

          if (channel.bufferedAmount > threshold) {
            await new Promise((resolve) => {
              channel.addEventListener('bufferedamountlow', resolve, {
                once: true,
              });
            });
          }

          bytesSent += chunk.length;
          this.progressTracker.updateProgress(bytesSent, file.size, 'send');
        }
      }.bind(this);

      await pipe(fileChunks(), stream.sink);
      this.progressTracker.updateProgress(bytesSent, file.size, 'send', true);
    } catch (error) {
      await this.abortTransfer(error);
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
    let receivedFileBuffer = [];
    let fileNameFromHeader = 'downloaded_file';
    let fileSizeFromHeader = 0;
    let fileTypeFromHeader = 'application/octet-stream';
    let headerReceived = false;
    let receivedBytesTotal = 0;

    try {
      for await (const ualistChunk of stream.source) {
        if (!ualistChunk || ualistChunk.length === 0) {
          continue;
        }

        const dataChunk = ualistChunk.subarray();

        if (!headerReceived) {
          const headerResult = this.parseFileHeader(dataChunk);
          if (headerResult.header) {
            fileNameFromHeader = headerResult.header.name || fileNameFromHeader;
            fileSizeFromHeader = headerResult.header.size || fileSizeFromHeader;
            fileTypeFromHeader = headerResult.header.type || fileTypeFromHeader;
            headerReceived = true;
            console.log(
              `Receiving file: ${fileNameFromHeader} (${fileSizeFromHeader} bytes)`,
            );
          }

          if (headerResult.bodyData && headerResult.bodyData.length > 0) {
            receivedFileBuffer.push(headerResult.bodyData);
            receivedBytesTotal += headerResult.bodyData.length;
            this.progressTracker.updateProgress(
              receivedBytesTotal,
              fileSizeFromHeader,
              'receive',
            );
          }
        } else {
          receivedFileBuffer.push(dataChunk);
          receivedBytesTotal += dataChunk.length;
          this.progressTracker.updateProgress(
            receivedBytesTotal,
            fileSizeFromHeader,
            'receive',
          );
        }

        if (
          receivedBytesTotal >= fileSizeFromHeader &&
          fileSizeFromHeader > 0
        ) {
          this.progressTracker.updateProgress(
            receivedBytesTotal,
            fileSizeFromHeader,
            'receive',
            true,
          );

          this.uiManager.showReceivedFileDetails(
            fileNameFromHeader,
            fileSizeFromHeader,
          );

          await this.saveReceivedFile(
            receivedFileBuffer,
            fileNameFromHeader,
            fileTypeFromHeader,
          );
          break;
        }
      }
    } catch (error) {
      console.error('Error receiving file:', error);
      this.errorHandler.handleTransferError(error, { direction: 'receive' });
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

  async closeActiveStream() {
    const activeStream = this.appState.getActiveStream();
    if (stream) {
      await activeStream.close();
      this.appState.setActiveStream(null);
    }
  }

  async abortTransfer(reason) {
    const activeStream = this.appState.getActiveStream();
    if (activeStream) {
      try {
        await activeStream.abort(reason);
      } catch (abortError) {
        console.error('Failed to abort stream:', abortError);
      }
      this.appState.setActiveStream(null);
    }
  }
}
