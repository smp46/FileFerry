// utils/ErrorHandler.ts
import type { UIManager } from '../ui/UIManager.ts';

/**
 * Context for a connection error.
 * @internal
 */
interface ConnectionErrorContext {
  peerId?: string;
  relay?: string;
  operation?: string;
}

/**
 * Context for a file transfer error.
 * @internal
 */
interface TransferErrorContext {
  direction: 'send' | 'receive';
  operation?: string;
}

/**
 * Context for an API error.
 * @internal
 */
interface ApiErrorContext {
  operation: string;
}

/**
 * Provides centralized error handling, logging, and recovery mechanisms.
 */
export class ErrorHandler {
  private uiManager: UIManager;
  private retryAttempts: Map<string, number>;
  private readonly maxRetries: number;

  /**
   * Initializes the ErrorHandler.
   * @param uiManager - An instance of UIManager to display error messages.
   */
  public constructor(uiManager: UIManager) {
    this.uiManager = uiManager;
    this.retryAttempts = new Map();
    this.maxRetries = 3;
  }

  /**
   * Handles errors related to peer connections.
   * @param error - The error object.
   * @param context - Contextual information about the error.
   */
  public handleConnectionError(
    error: Error,
    context: ConnectionErrorContext,
  ): void {
    const errorMessage = `Connection error: ${error.message}`;
    this.logError(error, context);

    if (this.isRecoverableError(error) && context.peerId) {
      this.attemptConnectionRecovery(context.peerId);
    } else {
      this.uiManager.showErrorPopup(errorMessage);
    }
  }

  /**
   * Handles errors during file transfers.
   * @param error - The error object.
   * @param context - Contextual information about the error.
   */
  public handleTransferError(
    error: Error,
    context: TransferErrorContext,
  ): void {
    const errorMessage = `Transfer error: ${error.message}`;
    this.logError(error, context);
    this.uiManager.showErrorPopup(errorMessage);
  }

  /**
   * Handles errors from the API service.
   * @param error - The error object.
   * @param context - Contextual information about the error.
   */
  public handleApiError(error: Error, context: ApiErrorContext): void {
    const errorMessage = `API error: ${error.message}`;
    this.logError(error, context);
    this.uiManager.showErrorPopup(errorMessage);
  }

  /**
   * Attempts to recover a failed connection.
   * @param peerId - The ID of the peer to attempt recovery with.
   * @returns A promise that resolves to true if recovery is successful.
   * @internal
   */
  private async attemptConnectionRecovery(peerId: string): Promise<boolean> {
    if (!peerId) {
      return false;
    }

    const attempts = this.retryAttempts.get(peerId) || 0;
    if (attempts >= this.maxRetries) {
      this.logWarning(`Max retry attempts reached for peer: ${peerId}`, {});
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
      this.logError(error as Error, {
        operation: 'recovery',
        peerId,
        attempt: attempts,
      });
      return false;
    }
  }

  /**
   * Retries an operation with exponential backoff.
   * @param operation - The async operation to retry.
   * @param attempt - The current retry attempt number.
   * @returns A promise that resolves with the result of the operation.
   * @internal
   */
  private async retryWithBackoff(
    operation: () => Promise<boolean>,
    attempt: number,
  ): Promise<boolean> {
    const delay = Math.min(1000 * Math.pow(2, attempt), 10000); // Max 10s delay
    await new Promise((resolve) => setTimeout(resolve, delay));
    return await operation();
  }

  /**
   * Logs an error to the console.
   * @param error - The error object.
   * @param context - Contextual information.
   * @internal
   */
  private logError(error: Error, context: object): void {
    console.error('Error:', error.message, 'Context:', context);
  }

  /**
   * Logs a warning to the console.
   * @param message - The warning message.
   * @param context - Contextual information.
   * @internal
   */
  private logWarning(message: string, context: object): void {
    console.warn('Warning:', message, 'Context:', context);
  }

  /**
   * Checks if an error is network-related.
   * @param error - The error object.
   * @returns True if the error appears to be a network error.
   * @internal
   */
  private isNetworkError(error: Error & { code?: string }): boolean {
    return (
      error.message.includes('network') ||
      error.message.includes('connection') ||
      error.code === 'NETWORK_ERROR'
    );
  }

  /**
   * Checks if an error is a timeout error.
   * @param error - The error object.
   * @returns True if the error appears to be a timeout.
   * @internal
   */
  private isTimeoutError(error: Error & { code?: string }): boolean {
    return (
      error.message.includes('timeout') ||
      error.message.includes('timed out') ||
      error.code === 'TIMEOUT'
    );
  }

  /**
   * Checks if an error is likely recoverable.
   * @param error - The error object.
   * @returns True if the error is a network or timeout error.
   * @internal
   */
  private isRecoverableError(error: Error): boolean {
    return this.isNetworkError(error) || this.isTimeoutError(error);
  }
}
