// utils/ConfigManager.ts
/**
 * Interface for the main configuration object.
 * @internal
 */
interface Config {
  relay: {
    address: string;
    timeout: number;
  };
  api: {
    url: string;
    timeout: number;
  };
  transfer: {
    chunkSize: number;
    protocol: string;
  };
  stun: {
    fallback: string;
    timeout: number;
  };
  debug: boolean;
}

/**
 * Manages all configuration for the FileFerry application.
 */
export class ConfigManager {
  private readonly config: Config;

  /**
   * Initializes the ConfigManager with default values.
   */
  public constructor() {
    this.config = {
      relay: {
        address:
          '/dns4/relay.smp46.me/tcp/443/tls/ws/p2p/12D3KooWPUXghsjtba2yaKbxJAPUpCgZ1UzciEdCPzohBQi7wiPg',
        timeout: 30000,
      },
      api: {
        url: 'https://exchange.smp46.me',
        timeout: 10000,
      },
      transfer: {
        chunkSize: 256 * 256,
        protocol: '/fileferry/filetransfer/1.0.0',
      },
      stun: {
        fallback: 'stun:l.google.com:19302',
        timeout: 5000,
      },
      debug: true,
    };
  }

  /**
   * Gets the relay server address.
   * @returns The multiaddress of the relay server.
   */
  public getRelayAddress(): string {
    return this.config.relay.address;
  }

  /**
   * Gets the API URL for the phrase exchange server.
   * @returns The base URL of the API.
   */
  public getApiUrl(): string {
    return this.config.api.url;
  }

  /**
   * Gets the list of STUN and TURN servers.
   * @returns An array of STUN/TURN server URLs.
   */
  public getStunServers(): string[] {
    return [
      this.config.stun.fallback,
      'turn:relay.smp46.me:3478?transport=udp',
      'turn:relay.smp46.me:3478?transport=tcp',
    ];
  }

  /**
   * Gets the file transfer settings.
   * @returns An object containing transfer settings.
   */
  public getTransferSettings(): { chunkSize: number; protocol: string } {
    return this.config.transfer;
  }

  /**
   * Gets the protocol ID for file transfers.
   * @returns The file transfer protocol string.
   */
  public getFileTransferProtocol(): string {
    return this.config.transfer.protocol;
  }

  /**
   * Gets the chunk size for file transfers.
   * @returns The chunk size in bytes.
   */
  public getChunkSize(): number {
    return this.config.transfer.chunkSize;
  }

  /**
   * Gets various timeout settings.
   * @returns An object containing timeout values in milliseconds.
   */
  public getTimeouts(): { relay: number; api: number; stun: number } {
    return {
      relay: this.config.relay.timeout,
      api: this.config.api.timeout,
      stun: this.config.stun.timeout,
    };
  }

  /**
   * Checks if debug mode is enabled.
   * @returns True if debug mode is on, false otherwise.
   */
  public isDebugEnabled(): boolean {
    return this.config.debug;
  }

  /**
   * Validates the current configuration.
   * @returns True if the configuration is valid.
   * @throws {Error} if a required configuration key is missing.
   */
  public validateConfig(): boolean {
    const required: string[] = [
      'relay.address',
      'api.url',
      'transfer.protocol',
    ];

    for (const key of required) {
      if (!this.getConfigValue(key)) {
        throw new Error(`Missing required configuration: ${key}`);
      }
    }

    return true;
  }

  /**
   * Sets a configuration value dynamically.
   * @param key - The dot-notation key for the setting (e.g., 'relay.address').
   * @param value - The value to set.
   */
  public setConfigValue(key: string, value: unknown): void {
    const keys = key.split('.');
    let current: any = this.config;

    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }

    current[keys[keys.length - 1]] = value;
  }

  /**
   * Gets a configuration value by key.
   * @param key - The dot-notation key for the setting.
   * @param defaultValue - The value to return if the key is not found.
   * @returns The configuration value or the default value.
   */
  public getConfigValue(key: string, defaultValue: unknown = null): unknown {
    const keys = key.split('.');
    let current: any = this.config;

    for (const k of keys) {
      if (current[k] === undefined) {
        return defaultValue;
      }
      current = current[k];
    }

    return current;
  }
}
