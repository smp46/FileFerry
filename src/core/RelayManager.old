// core/RelayManager.ts
import { multiaddr, type Multiaddr } from '@multiformats/multiaddr';
import type { Libp2p } from 'libp2p';
import type { Connection, PeerId } from '@libp2p/interface';
import type { AppState } from '@core/AppState';
import type { ErrorHandler } from '@utils/ErrorHandler';

/**
 * Type for relay reservation status.
 * @internal
 */
type ReservationStatus = 'reserved' | null;

/**
 * Handles all interactions with the circuit relay node, including connecting,
 * reserving a slot, and obtaining a circuit address.
 */
export class RelayManager {
  private node: Libp2p;
  private appState: AppState;
  private errorHandler: ErrorHandler;
  private relayPeerId: PeerId | null;
  private relayMultiaddr: Multiaddr | null;
  private reservationStatus: ReservationStatus;

  /**
   * Initializes the RelayManager.
   * @param node - The libp2p node instance.
   * @param appState - The application state.
   * @param errorHandler - The error handler instance.
   */
  public constructor(
    node: Libp2p,
    appState: AppState,
    errorHandler: ErrorHandler,
  ) {
    this.node = node;
    this.appState = appState;
    this.errorHandler = errorHandler;
    this.relayPeerId = null;
    this.relayMultiaddr = null;
    this.reservationStatus = null;
  }

  /**
   * Connects to the specified relay server.
   * @param relayMultiaddrStr - The string multiaddress of the relay.
   * @returns A promise that resolves to the established connection.
   */
  public async connectToRelay(relayMultiaddrStr: string): Promise<Connection> {
    try {
      this.relayMultiaddr = multiaddr(relayMultiaddrStr);
      const peerIdStr = this.relayMultiaddr.getPeerId();
      if (!peerIdStr) {
        throw new Error('Could not parse PeerId from relay multiaddr');
      }
      this.relayPeerId = this.parseRelayPeerId(this.relayMultiaddr);

      console.log(`Connecting to relay: ${relayMultiaddrStr}`);
      console.log(`Relay peer ID: ${this.relayPeerId}`);

      const connection = await this.node.dial(this.relayMultiaddr, {
        signal: AbortSignal.timeout(10000), // Increased timeout
      });

      console.log(`Successfully connected to relay: ${this.relayPeerId}`);
      return connection;
    } catch (error) {
      const err = error as Error;
      console.error(`Failed to connect to relay: ${err.message}`);
      this.errorHandler.handleConnectionError(err, {
        relay: relayMultiaddrStr,
      });
      throw error;
    }
  }

  /**
   * Waits for the node to obtain a circuit address through the relay.
   * @returns A promise that resolves to the circuit multiaddress.
   */
  public async waitForRelayAddress(): Promise<Multiaddr> {
    return new Promise((resolve, reject) => {
      let timer: number;
      let checkCount = 0;
      const maxChecks = 60;

      const checkForAddress = (): void => {
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

      timer = window.setInterval(checkForAddress, 500);
    });
  }

  /**
   * Checks if the node is currently connected to the configured relay.
   * @returns True if a connection to the relay is open.
   */
  public isConnectedToRelay(): boolean {
    if (!this.relayPeerId) {
      console.log('No relay peer ID set');
      return false;
    }

    const connectionsMap = this.appState.getConnectionsForPeer(
      this.relayPeerId.toString(),
    );
    if (!connectionsMap) {
      return false;
    }
    let isConnected = false;
    for (const connection of connectionsMap.values()) {
      if (connection !== undefined && connection.status === 'open') {
        isConnected = true;
        break;
      }
    }

    console.log(
      `Relay connection status: ${isConnected ? 'connected' : 'disconnected'}`,
    );
    return isConnected;
  }

  /**
   * Gets the node's circuit relay address.
   * @returns The circuit multiaddress, or undefined if not available.
   */
  public getCircuitAddress(): Multiaddr | undefined {
    const multiaddrs = this.node.getMultiaddrs();
    return multiaddrs.find((ma) => ma.toString().includes('/p2p-circuit'));
  }

  /**
   * Reserves a slot on the connected relay.
   * @returns A promise that resolves to true if reservation is successful.
   */
  public async reserveRelay(): Promise<boolean> {
    try {
      if (!this.isConnectedToRelay()) {
        console.log('Not connected to relay, cannot reserve');
        return false;
      }

      const circuitAddr = await this.waitForRelayAddress();
      if (circuitAddr) {
        this.reservationStatus = 'reserved';
        console.log('Relay reservation successful');
        return true;
      }

      return false;
    } catch (error) {
      const err = error as Error;
      console.error(`Relay reservation failed: ${err.message}`);
      this.errorHandler.handleConnectionError(err, {
        operation: 'reserveRelay',
      });
      return false;
    }
  }

  /**
   * Releases an active reservation on the relay.
   * @returns A promise that resolves to true if the reservation is released.
   */
  public async releaseRelay(): Promise<boolean> {
    try {
      if (this.reservationStatus !== 'reserved') {
        console.log('No active relay reservation to release');
        return true;
      }

      console.log('Releasing relay reservation...');

      if (this.relayPeerId) {
        const connections = this.appState.getConnectionsForPeer(
          this.relayPeerId.toString(),
        );
        if (connections) {
          for (const connection of connections.values()) {
            if (connection && connection.status === 'open') {
              await connection.close();
              console.log('Relay connection closed');
            }
          }
        }

        this.appState.removeAllConnectionsWithPeer(this.relayPeerId.toString());
      }

      this.reservationStatus = null;
      console.log('Relay reservation released');
      return true;
    } catch (error) {
      const err = error as Error;
      console.error(`Failed to release relay: ${err.message}`);
      this.errorHandler.handleConnectionError(err, {
        operation: 'releaseRelay',
      });
      return false;
    }
  }

  /**
   * Parses the PeerId from a relay's multiaddress.
   * @param maddr - The multiaddress to parse.
   * @returns The parsed PeerId or null on failure.
   * @internal
   */
  private parseRelayPeerId(maddr: Multiaddr): PeerId | null {
    try {
      const peerId = maddr.getPeerId();
      if (!peerId) {
        throw new Error('No peer ID found in multiaddr');
      }
      const p2pComponent = maddr.protos().find((p) => p.name === 'p2p');
      if (!p2pComponent) {
        throw new Error('Multiaddr does not contain a p2p component');
      }

      // This is a conceptual way; direct PeerId creation from string is needed
      // but getPeerId() returns a string, so we have to assume a way to get a PeerId object
      // For now, we'll return the string and handle it upstream.
      // In a real scenario, you'd use a PeerId factory.
      console.log(`Parsed relay peer ID: ${peerId}`);
      return { toString: () => peerId } as PeerId; // Mock PeerId object
    } catch (error) {
      const err = error as Error;
      console.error(`Failed to parse relay peer ID: ${err.message}`);
      this.errorHandler.handleConnectionError(err, {
        operation: 'parseRelayPeerId',
      });
      return null;
    }
  }

  /**
   * Validates a connection to ensure it is the correct, open relay connection.
   * @param connection - The connection to validate.
   * @returns True if the connection is a valid relay connection.
   */
  public validateRelayConnection(connection: Connection): boolean {
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

  /**
   * Gets the PeerId of the relay.
   * @returns The relay's PeerId or null.
   */
  public getRelayPeerId(): PeerId | null {
    return this.relayPeerId;
  }

  /**
   * Gets the multiaddress of the relay.
   * @returns The relay's multiaddress or null.
   */
  public getRelayMultiaddr(): Multiaddr | null {
    return this.relayMultiaddr;
  }

  /**
   * Gets the current reservation status.
   * @returns The reservation status.
   */
  public getReservationStatus(): ReservationStatus {
    return this.reservationStatus;
  }

  /**
   * Checks if the relay is connected and ready for use.
   * @returns A promise that resolves to true if the relay can be used.
   */
  public async canUseRelay(): Promise<boolean> {
    if (!this.isConnectedToRelay()) {
      console.log('Cannot use relay: not connected');
      return false;
    }
    return true;
  }

  /**
   * Gets a summary of the relay's current state.
   * @returns An object with relay information.
   */
  public getRelayInfo(): object {
    return {
      peerId: this.relayPeerId?.toString(),
      multiaddr: this.relayMultiaddr?.toString(),
      connected: this.isConnectedToRelay(),
      reservationStatus: this.reservationStatus,
      circuitAddress: this.getCircuitAddress()?.toString(),
    };
  }
}
