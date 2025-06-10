import { multiaddr } from '@multiformats/multiaddr';

export class RelayManager {
  constructor(node, appState, errorHandler) {
    this.node = node;
    this.appState = appState;
    this.errorHandler = errorHandler;
    this.relayPeerId = null;
    this.relayMultiaddr = null;
    this.reservationStatus = null;
  }

  async connectToRelay(relayMultiaddr) {
    try {
      this.relayMultiaddr = multiaddr(relayMultiaddr);
      this.relayPeerId = this.parseRelayPeerId(this.relayMultiaddr);

      console.log(`Connecting to relay: ${relayMultiaddr}`);
      console.log(`Relay peer ID: ${this.relayPeerId}`);

      const connection = await this.node.dial(this.relayMultiaddr, {
        signal: AbortSignal.timeout(10000), // Increased timeout
      });

      console.log(`Successfully connected to relay: ${this.relayPeerId}`);
      return connection;
    } catch (error) {
      console.error(`Failed to connect to relay: ${error.message}`);
      this.errorHandler.handleConnectionError(error, { relay: relayMultiaddr });
      throw error;
    }
  }

  async waitForRelayAddress() {
    return new Promise((resolve, reject) => {
      let timer;
      let checkCount = 0;
      const maxChecks = 60;

      const checkForAddress = () => {
        checkCount++;
        const circuitAddr = this.getCircuitAddress();

        if (circuitAddr) {
          console.log(`Circuit address obtained: ${circuitAddr.toString()}`);
          clearInterval(timer);
          resolve(circuitAddr);
          return;
        }

        if (checkCount >= maxChecks) {
          clearInterval(timer);
          reject(
            new Error('Timeout: Could not obtain a circuit address via relay.'),
          );
          return;
        }

        console.log(
          `Waiting for circuit address... (attempt ${checkCount}/${maxChecks})`,
        );
      };

      const initialCircuitAddr = this.getCircuitAddress();
      if (initialCircuitAddr) {
        console.log(
          `Circuit address already available: ${initialCircuitAddr.toString()}`,
        );
        resolve(initialCircuitAddr);
        return;
      }

      timer = setInterval(checkForAddress, 500);
    });
  }

  isConnectedToRelay() {
    if (!this.relayPeerId) {
      console.log('No relay peer ID set');
      return false;
    }

    const connection = this.appState.getConnection(this.relayPeerId.toString());
    const isConnected =
      connection !== undefined && connection.status === 'open';

    console.log(
      `Relay connection status: ${isConnected ? 'connected' : 'disconnected'}`,
    );
    return isConnected;
  }

  getCircuitAddress() {
    const multiaddrs = this.node.getMultiaddrs();
    const circuitAddr = multiaddrs.find((ma) =>
      ma.toString().includes('/p2p-circuit'),
    );

    if (circuitAddr) {
      console.log(`Found circuit address: ${circuitAddr.toString()}`);
    }

    return circuitAddr;
  }

  async reserveRelay() {
    try {
      if (!this.isConnectedToRelay()) {
        console.log('Not connected to relay, cannot reserve');
        return false;
      }

      const circuitAddr = await this.waitForRelayAddress(15000);
      if (circuitAddr) {
        this.reservationStatus = 'reserved';
        console.log('Relay reservation successful');
        return true;
      }

      return false;
    } catch (error) {
      console.error(`Relay reservation failed: ${error.message}`);
      this.errorHandler.handleConnectionError(error, {
        operation: 'reserveRelay',
      });
      return false;
    }
  }

  async releaseRelay() {
    try {
      if (this.reservationStatus !== 'reserved') {
        console.log('No active relay reservation to release');
        return true;
      }

      console.log('Releasing relay reservation...');

      if (this.relayPeerId) {
        const connection = this.appState.getConnection(
          this.relayPeerId.toString(),
        );
        if (connection && connection.status === 'open') {
          await connection.close();
          console.log('Relay connection closed');
        }
      }

      this.reservationStatus = null;
      console.log('Relay reservation released');
      return true;
    } catch (error) {
      console.error(`Failed to release relay: ${error.message}`);
      this.errorHandler.handleConnectionError(error, {
        operation: 'releaseRelay',
      });
      return false;
    }
  }

  parseRelayPeerId(multiaddr) {
    try {
      const peerId = multiaddr.getPeerId();
      if (!peerId) {
        throw new Error('No peer ID found in multiaddr');
      }
      console.log(`Parsed relay peer ID: ${peerId}`);
      return peerId;
    } catch (error) {
      console.error(`Failed to parse relay peer ID: ${error.message}`);
      this.errorHandler.handleConnectionError(error, {
        operation: 'parseRelayPeerId',
        multiaddr: multiaddr.toString(),
      });
      return null;
    }
  }

  validateRelayConnection(connection) {
    if (!connection) {
      console.log('No connection provided for validation');
      return false;
    }

    if (connection.status !== 'open') {
      console.log(`Connection status is ${connection.status}, not open`);
      return false;
    }

    if (!this.relayPeerId) {
      console.log('No relay peer ID to validate against');
      return false;
    }

    const isValid =
      connection.remotePeer.toString() === this.relayPeerId.toString();
    console.log(
      `Relay connection validation: ${isValid ? 'valid' : 'invalid'}`,
    );

    return isValid;
  }

  getRelayPeerId() {
    return this.relayPeerId;
  }

  getRelayMultiaddr() {
    return this.relayMultiaddr;
  }

  getReservationStatus() {
    return this.reservationStatus;
  }

  async canUseRelay() {
    if (!this.isConnectedToRelay()) {
      console.log('Cannot use relay: not connected');
      return false;
    }
    return true;
  }

  getRelayInfo() {
    return {
      peerId: this.relayPeerId?.toString(),
      multiaddr: this.relayMultiaddr?.toString(),
      connected: this.isConnectedToRelay(),
      reservationStatus: this.reservationStatus,
      circuitAddress: this.getCircuitAddress()?.toString(),
    };
  }
}
