// core/ConnectionManager.ts
import { multiaddr, type Multiaddr } from '@multiformats/multiaddr';
import type { Libp2p } from 'libp2p';
import type { Connection, PeerId, DialOptions } from '@libp2p/interface';
import type { AppState } from '@core/AppState';
import type { ErrorHandler } from '@utils/ErrorHandler';
import type { ConfigManager } from '@utils/ConfigManager';
import type { FileTransferManager } from '@core/FileTransferManager';

/**
 * Manages peer connections, including dialing, lifecycle events (open/close),
 * and connection upgrades from relay to direct WebRTC.
 */
export class ConnectionManager {
  private node: Libp2p;
  private appState: AppState;
  private errorHandler: ErrorHandler;
  private config: ConfigManager;
  private fileTransferHandler: FileTransferManager;
  private retryAttempts: Map<string, number>;

  /**
   * Initializes the ConnectionManager.
   * @param node - The libp2p node instance.
   * @param appState - The application state.
   * @param errorHandler - The error handler instance.
   * @param config - The config manager instance.
   * @param fileTransferHandler - The file transfer manager instance.
   */
  public constructor(
    node: Libp2p,
    appState: AppState,
    errorHandler: ErrorHandler,
    config: ConfigManager,
    fileTransferHandler: FileTransferManager,
  ) {
    this.node = node;
    this.appState = appState;
    this.errorHandler = errorHandler;
    this.config = config;
    this.fileTransferHandler = fileTransferHandler;
    this.retryAttempts = new Map();
  }

  /**
   * Handles new incoming or outgoing connections.
   * @param event - The 'connection:open' event.
   */
  public async onConnectionEstablished(
    event: CustomEvent<Connection>,
  ): Promise<void> {
    const connection = event.detail;
    const remotePeerId = connection.remotePeer;
    const remotePeerIdStr = remotePeerId.toString();
    const remoteAddr = connection.remoteAddr.toString();

    console.log(`Connection OPENED with: ${remotePeerIdStr} on ${remoteAddr}`);

    this.appState.addConnection(remotePeerId, connection);

    await this.handleConnectionType(connection, remotePeerIdStr, remoteAddr);
  }

  /**
   * Handles closed connections and initiates reconnection if necessary.
   * @param event - The 'connection:close' event.
   */
  public async onConnectionClosed(
    event: CustomEvent<Connection>,
  ): Promise<void> {
    const remotePeerIdStr = event.detail.remotePeer.toString();
    const connectionId = event.detail.id;

    if (
      this.appState.isTransferActive() &&
      remotePeerIdStr === this.appState.getActivePeer() &&
      this.appState.getTransferConnectionId() === connectionId &&
      !this.appState.isFinished() &&
      !this.appState.hasReconnected()
    ) {
      console.log('LOST CONNECTION');
      this.errorHandler.reconnecting();
      if (this.appState.getMode() === 'sender') {
        await this.onSenderConnectionError(event.detail.remotePeer);
      } else if (this.appState.getMode() === 'receiver') {
        await this.onReceiverConnectionError(remotePeerIdStr);
      }
    }
    this.appState.removeConnection(remotePeerIdStr, connectionId);
  }

  /**
   * Waits for a reconnection to the sender,
   * if none occurs after 30 seconds then gracefully exits.
   *
   * @param remotePeerIdStr - The string PeerId of the remote peer.
   * @returns A promise that resolves when a reconnection is detected or after a timeout.
   */
  private async onReceiverConnectionError(
    remotePeerIdStr: string,
  ): Promise<void> {
    let onConnectionOpen:
      | ((event: CustomEvent<Connection>) => void)
      | undefined;

    try {
      await new Promise<void>((resolve, reject) => {
        onConnectionOpen = (event: CustomEvent<Connection>) => {
          if (
            event.detail.remotePeer.toString() === remotePeerIdStr &&
            this.appState.isTransferActive()
          ) {
            // Reconnection successful, update state and resolve the promise
            this.appState.setReconnected(true);
            this.errorHandler.reconnected();
            this.onConnectionEstablished(event);
            resolve();
          }
        };
        this.node.addEventListener('connection:open', onConnectionOpen);

        // Set up a timeout that will reject the promise if no reconnection occurs
        setTimeout(() => {
          reject(
            new Error(
              'Timeout: Waited 30 seconds for reconnection, but none occurred.',
            ),
          );
        }, 30000);
      });
    } catch (error) {
      console.error(error);
      await this.fileTransferHandler.transferComplete();
      this.errorHandler.tryAgainError();
    } finally {
      if (onConnectionOpen) {
        this.node.removeEventListener('connection:open', onConnectionOpen);
      }
    }
  }

  /**
   * Tries to reconnect to peer after a connection error.
   * Gracefully exits after unsuccessful 5 attempts.
   *
   * @param event - The 'connection:closed' event.
   * @returns A promise that resolves when the reconnection attempts are complete.
   */
  private async onSenderConnectionError(remotePeerId: PeerId): Promise<void> {
    const remotePeerIdStr = remotePeerId.toString();
    const retryDelay = 2000;
    let retryAttemptsForThisPeer = this.retryAttempts.get(remotePeerIdStr) || 0;

    while (retryAttemptsForThisPeer < 4) {
      console.log(`Attempting to reconnect to ${remotePeerIdStr}...`);
      try {
        const connection = await this.dialPeer(remotePeerId, {
          signal: AbortSignal.timeout(5000),
        });
        console.log(`Reconnected to ${remotePeerIdStr}`);
        this.errorHandler.reconnected();
        this.appState.setReconnected(true);
        this.handleConnectionType(
          connection,
          remotePeerIdStr,
          connection.remoteAddr.toString(),
        );
        break; // If reconnection is successful, break the loop
      } catch (_) {
        retryAttemptsForThisPeer++;
        this.retryAttempts.set(remotePeerIdStr, retryAttemptsForThisPeer);
        await new Promise((resolve) =>
          setTimeout(resolve, retryDelay * retryAttemptsForThisPeer),
        );
      }
    }

    if (retryAttemptsForThisPeer >= 4) {
      // Give up after 4 attempts
      this.appState.declareFinished();
      await this.node.stop();
      this.errorHandler.tryAgainError();
    }
  }

  /**
   * Dials a peer using their multiaddress.
   * @param multiaddr - The multiaddress of the peer to dial.
   * @param options - Dialing options.
   * @returns A promise that resolves to the established connection.
   */
  public async dialPeer(
    multiaddr: Multiaddr | PeerId,
    options: DialOptions = {},
  ): Promise<Connection> {
    try {
      const connection = await this.node.dial(multiaddr, options);
      return connection;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Closes the connection to a specific peer.
   * @param peerId - The PeerId of the peer to disconnect from.
   */
  public async closePeer(peerId: PeerId): Promise<void> {
    const connections = this.appState.getConnectionsForPeer(peerId.toString());
    if (connections) {
      for (const connection of connections.values()) {
        if (connection) {
          await connection.close();
          connections.delete(connection.id);
        }
      }
    }
  }

  /**
   * Handles a new connection based on its type (relay or webrtc).
   * @param connection - The new connection.
   * @param remotePeerIdStr - The string PeerId of the remote peer.
   * @param remoteAddr - The string multiaddress of the remote peer.
   * @internal
   */
  private async handleConnectionType(
    connection: Connection,
    remotePeerIdStr: string,
    remoteAddr: string,
  ): Promise<void> {
    const relayAddress = this.config.getRelayAddress();

    if (remoteAddr.includes('/webrtc')) {
      console.log(
        remoteAddr.includes('/webrtc'),
        'WebRTC connection established',
      );
      if (
        this.appState.getMode() === 'sender' &&
        this.appState.getSelectedFile() != null
      ) {
        const peerMultiaddr = multiaddr(remoteAddr);
        const stream = await this.node.dialProtocol(
          peerMultiaddr,
          this.config.getFileTransferProtocol(),
        );

        this.appState.setTransferConnectionId(connection.id);
        this.appState.setActivePeer(remotePeerIdStr);
        this.appState.setActiveStream(stream);

        try {
          console.log('Starting file transfer with', remotePeerIdStr);
          await this.fileTransferHandler.startFileTransfer();
        } catch (error) {
          this.onSenderConnectionError(connection.remotePeer);
        }
      }
    } else if (remoteAddr === relayAddress) {
      console.log(`Direct relay connection established for ${remotePeerIdStr}`);
    }
  }
}
