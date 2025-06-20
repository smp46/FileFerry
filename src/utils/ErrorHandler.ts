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

  /**
   * Initializes the ErrorHandler.
   * @param uiManager - An instance of UIManager to display error messages.
   */
  public constructor(uiManager: UIManager) {
    this.uiManager = uiManager;
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

    this.uiManager.showErrorPopup(errorMessage);
  }

  public tryAgainError() {
    this.uiManager.showErrorPopup(
      'The FileFerry got lost at sea, make sure your maps are in order and try again.',
    );
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

  public reconnecting() {
    this.uiManager.showReconnecting();
  }

  public reconnected() {
    this.uiManager.hideReconnecting();
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
}
