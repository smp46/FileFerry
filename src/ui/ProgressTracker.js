export class ProgressTracker {
  constructor() {
    this.startTime = null;
    this.lastUpdateTime = 0;
    this.lastBytes = 0;
    this.updateInterval = 250; // ms
  }

  // Progress calculation
  calculateProgress(current, total) {
    return total > 0 ? (current / total) * 100 : 0;
  }

  calculateTransferRate(bytes, timeElapsed) {
    if (timeElapsed <= 0) return 0;

    const timeDiffSeconds = timeElapsed / 1000;
    const bytesDiff = bytes - this.lastBytes;

    if (bytesDiff <= 0) return 0;

    const bytesPerSecond = bytesDiff / timeDiffSeconds;
    return (bytesPerSecond * 8) / (1024 * 1024); // Convert to Mbps
  }

  formatBytes(bytes) {
    return (bytes / (1024 * 1024)).toFixed(2);
  }

  formatRate(bytesPerSecond) {
    const mbps = (bytesPerSecond * 8) / (1024 * 1024);
    return mbps.toFixed(2);
  }

  // Progress display
  updateProgress(current, total, direction) {
    const currentTime = Date.now();

    if (!this.shouldUpdateDisplay(currentTime)) {
      return;
    }

    const percentage = this.calculateProgress(current, total);
    const timeElapsed = currentTime - this.lastUpdateTime;
    const rate = this.calculateTransferRate(current, timeElapsed);

    const progress = {
      percentage,
      current: this.formatBytes(current),
      total: this.formatBytes(total),
      rate: rate.toFixed(2),
    };

    this.onProgressUpdate(progress, direction);

    this.lastUpdateTime = currentTime;
    this.lastBytes = current;
  }

  updateProgressBar(percentage) {
    // Implementation depends on UI framework
  }

  updateProgressText(current, total) {
    return `${current} MB / ${total} MB`;
  }

  updateTransferRate(rate) {
    return `${rate} Mbps`;
  }

  // Timing
  startTimer() {
    this.startTime = Date.now();
    this.lastUpdateTime = this.startTime;
    this.lastBytes = 0;
  }

  stopTimer() {
    this.startTime = null;
  }

  getElapsedTime() {
    return this.startTime ? Date.now() - this.startTime : 0;
  }

  // Rate limiting
  shouldUpdateDisplay(currentTime = Date.now()) {
    return currentTime - this.lastUpdateTime >= this.updateInterval;
  }

  throttleUpdates(callback, interval) {
    let lastCall = 0;
    return function (...args) {
      const now = Date.now();
      if (now - lastCall >= interval) {
        lastCall = now;
        return callback.apply(this, args);
      }
    };
  }

  // Callback method (to be overridden)
  onProgressUpdate(progress, direction) {}
}
