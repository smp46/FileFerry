// core/AppState.ts
import type { Connection } from '@libp2p/interface';
import type { Stream } from '@libp2p/interface';
import type { PeerId } from '@libp2p/interface';

/**
 * Represents the application's current operational mode.
 */
export type AppMode = 'idle' | 'sender' | 'receiver';

/**
 * Holds and manages the dynamic state of the application, such as
 * connection status, active transfers, and user selections.
 */
export class AppState {
  public mode: AppMode;
  public connections: Map<string, Map<string, Connection>>;
  public activeTransfer: boolean | null;
  public finished: boolean | null;
  public selectedFile: File | null;
  public activePeerId: string | null;
  public activeStream: Stream | null;
  public transferConnectionId: string | null;

  /**
   * Initializes the application state.
   */
  public constructor() {
    this.mode = 'idle'; // 'idle', 'sender', 'receiver'
    this.connections = new Map();
    this.activeTransfer = false;
    this.finished = false;
    this.selectedFile = null;
    this.activePeerId = null;
    this.activeStream = null;
    this.transferConnectionId = null;
  }

  /**
   * Sets the application's current mode.
   * @param mode - The mode to set.
   */
  public setMode(mode: AppMode): void {
    this.mode = mode;
  }

  /**
   * Gets the application's current mode.
   * @returns The current application mode.
   */
  public getMode(): AppMode {
    return this.mode;
  }

  /**
   * Resets the application state to its initial default values.
   */
  public reset(): void {
    this.mode = 'idle';
    this.connections.clear();
    this.activeTransfer = false;
    this.finished = false;
    this.selectedFile = null;
    this.activePeerId = null;
    this.activeStream = null;
  }

  /**
   * Adds a new connection to track.
   * @param peerId - The PeerId of the remote peer.
   * @param connection - The connection object.
   */
  public addConnection(peerId: PeerId, connection: Connection): void {
    const connectionsMap =
      this.connections.get(peerId.toString()) || new Map<string, Connection>();
    connectionsMap.set(connection.id, connection);
    this.connections.set(peerId.toString(), connectionsMap);
  }

  /**
   * Removes a specific connection.
   * @param peerId - The string representation of the remote peer's PeerId.
   * @param id - The ID of the connection to remove.
   */
  public removeConnection(peerId: string, id: string): void {
    const connectionsMap = this.connections.get(peerId);
    connectionsMap?.delete(id);
    if (connectionsMap) {
      this.connections.set(peerId, connectionsMap);
    }
  }

  /**
   * Removes all connections associated with a peer.
   * @param peerId - The string representation of the remote peer's PeerId.
   */
  public removeAllConnectionsWithPeer(peerId: string): void {
    this.connections.delete(peerId);
  }

  /**
   * Gets all connections for a specific peer.
   * @param peerId - The string representation of the remote peer's PeerId.
   * @returns A map of connections for the peer, or undefined if none exist.
   */
  public getConnectionsForPeer(
    peerId: string,
  ): Map<string, Connection> | undefined {
    return this.connections.get(peerId);
  }

  /**
   * Gets all active connections.
   * @returns An array of connection maps.
   */
  public getAllConnections(): Map<string, Connection>[] {
    return Array.from(this.connections.values());
  }

  /**
   * Sets the state to indicate an active file transfer.
   */
  public setActiveTransfer(): void {
    this.activeTransfer = true;
  }

  /**
   * Clears the active file transfer state.
   */
  public clearActiveTransfer(): void {
    this.activeTransfer = false;
  }

  /**
   * Checks if a file transfer is currently active.
   * @returns True if a transfer is active, false otherwise.
   */
  public isTransferActive(): boolean {
    return !!this.activeTransfer;
  }

  /**
   * Sets the ID of the connection used for the current transfer.
   * @param id - The connection ID.
   */
  public setTransferConnectionId(id: string): void {
    this.transferConnectionId = id;
  }

  /**
   * Gets the ID of the connection used for the current transfer.
   * @returns The connection ID or null.
   */
  public getTransferConnectionId(): string | null {
    return this.transferConnectionId;
  }

  /**
   * Sets the currently selected file.
   * @param file - The file selected by the user.
   */
  public setSelectedFile(file: File): void {
    this.selectedFile = file;
  }

  /**
   * Gets the currently selected file.
   * @returns The selected file or null.
   */
  public getSelectedFile(): File | null {
    return this.selectedFile;
  }

  /**
   * Clears the currently selected file from state.
   */
  public clearSelectedFile(): void {
    this.selectedFile = null;
  }

  /**
   * Sets the active peer for the current operation.
   * @param peerId - The string representation of the peer's PeerId.
   */
  public setActivePeer(peerId: string): void {
    this.activePeerId = peerId;
  }

  /**
   * Gets the active peer.
   * @returns The active peer's ID string or null.
   */
  public getActivePeer(): string | null {
    return this.activePeerId;
  }

  /**
   * Sets the active stream for the file transfer.
   * @param stream - The libp2p stream object.
   */
  public setActiveStream(stream: Stream): void {
    this.activeStream = stream;
  }

  /**
   * Gets the active stream.
   * @returns The active stream object or null.
   */
  public getActiveStream(): Stream | null {
    return this.activeStream;
  }

  public isFinished(): boolean {
    return this.finished || false;
  }

  public declareFinished(): void {
    this.finished = true;
  }
}
