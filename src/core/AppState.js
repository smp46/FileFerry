export class AppState {
  constructor() {
    this.mode = 'idle'; // 'idle', 'sender', 'receiver'
    this.connections = new Map();
    this.activeTransfer = null;
    this.selectedFile = null;
    this.activePeerId = null;
    this.activeStream = null;
  }

  // State management
  setMode(mode) {
    this.mode = mode;
  }

  getMode() {
    return this.mode;
  }

  reset() {
    this.mode = 'idle';
    this.connections.clear();
    this.activeTransfer = null;
    this.selectedFile = null;
    this.activePeerId = null;
    this.activeStream = null;
  }

  // Connection tracking
  addConnection(peerId, connection) {
    const connectionsMap = this.connections.get(peerId.toString()) || new Map();
    connectionsMap.set(connection.id, connection);
    this.connections.set(peerId.toString(), connectionsMap);
  }

  removeConnection(peerId, id) {
    const connectionsMap = this.connections.get(peerId.toString());
    connectionsMap?.delete(id);
    this.connections.set(peerId.toString(), connectionsMap);
  }

  removeALlConnectionsWithPeer(peerId) {
    this.connections.delete(peerId.toString());
  }

  getConnectionsForPeer(peerId) {
    return this.connections.get(peerId.toString());
  }

  getAllConnections() {
    return Array.from(this.connections.values());
  }

  // Transfer state
  setActiveTransfer(transferInfo) {
    this.activeTransfer = transferInfo;
  }

  clearActiveTransfer() {
    this.activeTransfer = null;
  }

  isTransferActive() {
    return this.activeTransfer !== null;
  }

  // File state
  setSelectedFile(file) {
    this.selectedFile = file;
  }

  getSelectedFile() {
    return this.selectedFile;
  }

  clearSelectedFile() {
    this.selectedFile = null;
  }

  // Active peer/stream
  setActivePeer(peerId) {
    this.activePeerId = peerId;
  }

  getActivePeer() {
    return this.activePeerId;
  }

  setActiveStream(stream) {
    this.activeStream = stream;
  }

  getActiveStream() {
    return this.activeStream;
  }
}
