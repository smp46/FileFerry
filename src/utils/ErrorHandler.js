export class ErrorHandler {
  constructor(uiManager) {
    this.uiManager = uiManager;
    this.retryAttempts = new Map();
    this.maxRetries = 3;
  }

  handleConnectionError(error, context) {
    const errorMessage = `Connection error: ${error.message}`;
    this.logError(error, context);

    if (this.isRecoverableError(error)) {
      this.attemptConnectionRecovery(context.peerId);
    } else {
      this.uiManager.showErrorPopup(errorMessage);
    }
  }

  handleTransferError(error, context) {
    const errorMessage = `Transfer error: ${error.message}`;
    this.logError(error, context);
    this.uiManager.showErrorPopup(errorMessage);
  }

  handleApiError(error, context) {
    const errorMessage = `API error: ${error.message}`;
    this.logError(error, context);
    this.uiManager.showErrorPopup(errorMessage);
  }

  async attemptConnectionRecovery(peerId) {
    if (!peerId) return false;

    const attempts = this.retryAttempts.get(peerId) || 0;
    if (attempts >= this.maxRetries) {
      this.logWarning(`Max retry attempts reached for peer: ${peerId}`);
      return false;
    }

    this.retryAttempts.set(peerId, attempts + 1);

    try {
      await this.retryWithBackoff(async () => {
        // recovery logic
        return true;
      }, attempts);

      this.retryAttempts.delete(peerId);
      return true;
    } catch (error) {
      this.logError(error, {
        operation: 'recovery',
        peerId,
        attempt: attempts,
      });
      return false;
    }
  }

  async retryWithBackoff(operation, attempt) {
    const delay = Math.min(1000 * Math.pow(2, attempt), 10000); // Max 10s delay
    await new Promise((resolve) => setTimeout(resolve, delay));
    return await operation();
  }

  logError(error, context) {
    console.error('Error:', error.message, 'Context:', context);
  }

  logWarning(message, context) {
    console.warn('Warning:', message, 'Context:', context);
  }

  isNetworkError(error) {
    return (
      error.message.includes('network') ||
      error.message.includes('connection') ||
      error.code === 'NETWORK_ERROR'
    );
  }

  isTimeoutError(error) {
    return (
      error.message.includes('timeout') ||
      error.message.includes('timed out') ||
      error.code === 'TIMEOUT'
    );
  }

  isRecoverableError(error) {
    return this.isNetworkError(error) || this.isTimeoutError(error);
  }
}
