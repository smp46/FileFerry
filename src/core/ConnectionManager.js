export class ConnectionManager {
  constructor(node, appState, errorHandler) {
    this.node = node;
    this.appState = appState;
    this.errorHandler = errorHandler;
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

    this.appState.addConnection(remotePeerIdStr, connection);

    if (!this.connectionUpgrades.has(remotePeerIdStr)) {
      this.connectionUpgrades.set(remotePeerIdStr, {
        relay: null,
        webrtc: null,
        upgrading: false,
        stable: false,
      });
    }

    await this.handleConnectionType(connection, remotePeerIdStr, remoteAddr);

    this.setConnectionStabilityTimer(remotePeerIdStr);
  }

  setConnectionStabilityTimer(remotePeerIdStr) {
    if (this.connectionStabilityTimer.has(remotePeerIdStr)) {
      clearTimeout(this.connectionStabilityTimer.get(remotePeerIdStr));
    }

    const timer = setTimeout(() => {
      const connInfo = this.connectionUpgrades.get(remotePeerIdStr);
      if (connInfo) {
        connInfo.stable = true;
        console.log(`Connection to ${remotePeerIdStr} marked as stable`);
      }
    }, 10000);

    this.connectionStabilityTimer.set(remotePeerIdStr, timer);
  }

  async onConnectionClosed(event) {
    const remotePeerIdStr = event.detail.remotePeer.toString();
    this.appState.removeConnection(remotePeerIdStr);
    this.connectionUpgrades.delete(remotePeerIdStr);
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

  monitorConnectionHealth() {
    setInterval(() => {
      for (const [peerId, connection] of this.appState.connections) {
        if (connection.status !== 'open') {
          this.retryFailedConnection(peerId);
        }
      }
    }, 10000);
  }

  async retryFailedConnection(peerId) {
    const attempts = this.retryAttempts.get(peerId) || 0;
    if (attempts >= 3) return;

    this.retryAttempts.set(peerId, attempts + 1);

    try {
      // retry logic
      await new Promise((resolve) =>
        setTimeout(resolve, Math.pow(2, attempts) * 1000),
      );
    } catch (error) {
      this.errorHandler.handleConnectionError(error, {
        peerId,
        retry: attempts,
      });
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

  getBestConnection(peerId) {
    const connection = this.appState.getConnection(peerId);
    return connection;
  }

  async handleConnectionType(connection, remotePeerIdStr, remoteAddr) {
    const connInfo = this.connectionUpgrades.get(remotePeerIdStr);

    if (remoteAddr.includes('/p2p-circuit')) {
      connInfo.relay = connection;
      console.log(`Relay connection established for ${remotePeerIdStr}`);
    } else if (remoteAddr.includes('/webrtc')) {
      connInfo.webrtc = connection;
      console.log(`WebRTC connection established for ${remotePeerIdStr}`);

      if (connInfo.relay && connInfo.webrtc && !connInfo.upgrading) {
        await this.scheduleConnectionUpgrade(remotePeerIdStr);
      }
    }
  }

  async scheduleConnectionUpgrade(remotePeerIdStr) {
    const connInfo = this.connectionUpgrades.get(remotePeerIdStr);
    if (!connInfo || connInfo.upgrading) return;

    connInfo.upgrading = true;

    setTimeout(() => {
      if (
        connInfo.webrtc &&
        connInfo.webrtc.status === 'open' &&
        connInfo.stable
      ) {
        console.log(
          `Closing relay connection for ${remotePeerIdStr} - WebRTC is stable`,
        );
        if (connInfo.relay && connInfo.relay.status === 'open') {
          connInfo.relay.close();
        }
      }
    }, 15000);
  }
}
