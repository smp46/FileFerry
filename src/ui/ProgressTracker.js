export class ProgressTracker {
  constructor(uiManager) {
    this.uiManager = uiManager;
    this.lastUpdateTime = 0;
    this.lastBytes = 0;
    this.updateInterval = 250; // ms
  }

  updateProgress(bytes, totalBytes, mode, forceUpdate = false) {
    const currentTime = Date.now();
    const timeSinceLastUpdate = currentTime - this.lastUpdateTime;

    if (!forceUpdate && timeSinceLastUpdate < this.updateInterval) {
      return;
    }

    const timeDiffSeconds = timeSinceLastUpdate / 1000;
    const bytesDiff = bytes - this.lastBytes;

    let mbitsPerSecond = 0;
    if (timeDiffSeconds > 0 && bytesDiff > 0) {
      const bytesPerSecond = bytesDiff / timeDiffSeconds;
      mbitsPerSecond = (bytesPerSecond * 8) / (1024 * 1024);
    }

    const progressPercent = totalBytes > 0 ? (bytes / totalBytes) * 100 : 0;
    const receivedMB = (bytes / (1024 * 1024)).toFixed(2);
    const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);

    console.log(
      'Receive progress: ' +
        progressPercent.toFixed(2) +
        '% (' +
        receivedMB +
        ' MB / ' +
        totalMB +
        ' MB)',
    );

    this.uiManager.showSendingInProgress();

    if (progressPercent >= 100) {
      this.uiManager.showTransferComplete(mode);
    } else {
      const progress = {
        percentage: progressPercent,
        current: receivedMB,
        total: totalMB,
        rate: mbitsPerSecond.toFixed(2),
      };
      this.uiManager.showFileProgress(progress, mode);
    }

    this.lastUpdateTime = currentTime;
    this.lastBytes = bytes;
  }
}
