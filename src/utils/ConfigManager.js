export class ConfigManager {
  constructor() {
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

  // Configuration
  getRelayAddress() {
    return this.config.relay.address;
  }

  getApiUrl() {
    return this.config.api.url;
  }

  getStunServers() {
    return [
      this.config.stun.fallback,
      'turn:relay.smp46.me:3478?transport=udp',
      'turn:relay.smp46.me:3478?transport=tcp',
    ];
  }

  getTransferSettings() {
    return this.config.transfer;
  }

  // Constants
  getFileTransferProtocol() {
    return this.config.transfer.protocol;
  }

  getChunkSize() {
    return this.config.transfer.chunkSize;
  }

  getTimeouts() {
    return {
      relay: this.config.relay.timeout,
      api: this.config.api.timeout,
      stun: this.config.stun.timeout,
    };
  }

  isDebugEnabled() {
    return this.config.debug;
  }

  getEnvironment() {
    return import.meta.env.MODE || 'development';
  }

  validateConfig() {
    const required = ['relay.address', 'api.url', 'transfer.protocol'];

    for (const key of required) {
      if (!this.getConfigValue(key)) {
        throw new Error(`Missing required configuration: ${key}`);
      }
    }

    return true;
  }

  setConfigValue(key, value) {
    const keys = key.split('.');
    let current = this.config;

    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }

    current[keys[keys.length - 1]] = value;
  }

  getConfigValue(key, defaultValue = null) {
    const keys = key.split('.');
    let current = this.config;

    for (const k of keys) {
      if (current[k] === undefined) {
        return defaultValue;
      }
      current = current[k];
    }

    return current;
  }
}
