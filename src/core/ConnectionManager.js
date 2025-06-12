import { multiaddr } from '@multiformats/multiaddr';

export class ConnectionManager {
  constructor(node, appState, errorHandler, config, fileTransferHandler) {
    this.node = node;
    this.appState = appState;
    this.errorHandler = errorHandler;
    this.config = config;
    this.fileTransferHandler = fileTransferHandler;
    this.connectionUpgrades = new Map();
    this.retryAttempts = new Map();
    this.connectionStabilityTimer = new Map();
  }

  async onConnectionEstablished(event) {
    const connection = event.detail;
    const remotePeerId = connection.remotePeer;
    const remotePeerIdStr = remotePeerId.toString();
    const remoteAddr = connection.remoteAddr.toString();

    console.log(`Connection OPENED with: ${remotePeerIdStr} on ${remoteAddr}`);

    if (remoteAddr.includes('/p2p-circuit')) {
      const originalClose = connection.close.bind(connection);
      let closeBlocked = true;

      connection.close = async () => {
        if (closeBlocked) {
          console.log(
            `Blocking premature close of circuit connection to ${remotePeerIdStr}`,
          );
          return;
        }
        return originalClose();
      };

      setTimeout(() => {
        closeBlocked = false;
        const connInfo = this.connectionUpgrades.get(remotePeerIdStr);
        if (connInfo && connInfo.webrtc && connInfo.webrtc.status === 'open') {
          console.log(
            `Allowing circuit connection closure - WebRTC established`,
          );
        }
      }, 30000);
    }

    this.appState.addConnection(remotePeerIdStr, connection);

    if (!this.connectionUpgrades.has(connection.id)) {
      this.connectionUpgrades.set(connection.id, {
        relay: null,
        webrtc: null,
        upgrading: false,
        stable: false,
      });
    }

    await this.handleConnectionType(connection, remotePeerIdStr, remoteAddr);
  }

  async onConnectionClosed(event) {
    const remotePeerIdStr = event.detail.remotePeer.toString();
    const connectionId = event.detail.id;
    this.connectionUpgrades.delete(connectionId);
    if (
      this.appState.isTransferActive() &&
      remotePeerIdStr === this.appState.getActivePeer()
    ) {
      this.appState.removeConnection(remotePeerIdStr, event.detail.id);
      await this.managers.connection.dialPeer(event.detail.remotePeer, {
        signal: AbortSignal.timeout(60000),
      });
    } else {
      this.appState.removeConnection(remotePeerIdStr, connectionId);
    }
  }

  async dialPeer(multiaddr, options = {}) {
    try {
      const connection = await this.node.dial(multiaddr, options);
      return connection;
    } catch (error) {
      this.errorHandler.handleConnectionError(error, multiaddr);
      throw error;
    }
  }

  async closePeer(peerId) {
    const connection = this.appState.getConnection(peerId);
    if (connection) {
      await connection.close();
    }
  }

  async upgradeConnection(peerId) {
    const connInfo = this.connectionUpgrades.get(peerId);
    if (!connInfo || connInfo.upgrading) return;

    connInfo.upgrading = true;

    if (connInfo.relay && connInfo.webrtc) {
      setTimeout(() => {
        if (connInfo.webrtc.status === 'open') {
          connInfo.relay.close();
        }
      }, 5000);
    }
  }

  isDirectConnection(connection) {
    return (
      connection.remoteAddr.toString().includes('/webrtc') &&
      !connection.remoteAddr.toString().includes('/p2p-circuit')
    );
  }

  isRelayConnection(connection) {
    return connection.remoteAddr.toString().includes('/p2p-circuit');
  }

  async waitForWebRTCStream(stream, timeout = 30000) {
    if (stream.channel) {
      if (stream.channel.readyState === 'open') {
        return stream;
      }

      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('WebRTC stream open timeout'));
        }, timeout);

        const onOpen = () => {
          clearTimeout(timer);
          stream.channel.removeEventListener('open', onOpen);
          stream.channel.removeEventListener('error', onError);
          resolve(stream);
        };

        const onError = (error) => {
          clearTimeout(timer);
          stream.channel.removeEventListener('open', onOpen);
          stream.channel.removeEventListener('error', onError);
          reject(error);
        };

        stream.channel.addEventListener('open', onOpen);
        stream.channel.addEventListener('error', onError);
      });
    }

    return stream;
  }

  async handleConnectionType(connection, remotePeerIdStr, remoteAddr) {
    const connInfo = this.connectionUpgrades.get(connection.id);

    if (remoteAddr.includes('/p2p-circuit')) {
      connInfo.relay = connection;
      console.log(`Relay connection established for ${remotePeerIdStr}`);
    } else if (remoteAddr.includes('/webrtc')) {
      connInfo.webrtc = connection;

      if (
        this.appState.getMode() === 'sender' &&
        this.appState.getSelectedFile() != null
      ) {
        const peerMultiaddr = multiaddr(remoteAddr);
        const stream = await this.node.dialProtocol(
          peerMultiaddr,
          this.config.getFileTransferProtocol(),
        );
        this.appState.setActivePeer(remotePeerIdStr);
        this.appState.setActiveStream(await this.waitForWebRTCStream(stream));
        await this.waitForWebRTCStream(stream).then(() => {
          this.fileTransferHandler.startFileTransfer();
        });
      }

      console.log(`WebRTC connection established for ${remotePeerIdStr}`);
    } else if (remoteAddr == this.config.relayAddr) {
      connInfo.relay = connection;
      console.log(`Direct relay connection established for ${remotePeerIdStr}`);
    }
  }
}
