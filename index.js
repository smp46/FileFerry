import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { identify, identifyPush } from '@libp2p/identify';
import { ping } from '@libp2p/ping';
import { webRTC } from '@libp2p/webrtc';
import { webSockets } from '@libp2p/websockets';
import * as filters from '@libp2p/websockets/filters';
import { createLibp2p } from 'libp2p';
import { multiaddr } from '@multiformats/multiaddr';

import { AppState } from '@core/AppState.js';
import { ConnectionManager } from '@core/ConnectionManager.js';
import { FileTransferManager } from '@core/FileTransferManager.js';
import { RelayManager } from '@core/RelayManager.js';
import { StunService } from '@services/StunService.js';
import { PhraseService } from '@services/PhraseService.js';
import { UIManager } from '@ui/UIManager.js';
import { ProgressTracker } from '@ui/ProgressTracker.js';
import { ErrorHandler } from '@utils/ErrorHandler.js';
import { ConfigManager } from '@utils/ConfigManager.js';

class FileFerryApp {
  constructor() {
    this.config = new ConfigManager();
    this.appState = new AppState();
    this.node = null;
    this.services = {};
    this.managers = {};
  }

  async initialize() {
    try {
      this.config.validateConfig();
      await this.setupServices();
      await this.setupLibp2pNode();
      await this.setupManagers();
      await this.setupUI();

      console.log('FileFerry app initialized successfully');
    } catch (error) {
      console.error('Failed to initialize app:', error);
      throw error;
    }
  }

  async setupServices() {
    this.services.stun = new StunService();
    this.services.phrase = new PhraseService(this.config.getApiUrl());
  }

  async setupLibp2pNode() {
    const stunServer = await this.getStunConfiguration();

    this.node = await createLibp2p({
      addresses: {
        listen: ['/p2p-circuit', '/webrtc'],
      },
      transports: [
        webSockets({ filter: filters.all }),
        webRTC({
          rtcConfiguration: {
            iceServers: [
              { urls: stunServer },
              {
                urls: 'turn:relay.smp46.me:3478?transport=udp',
                username: 'ferryCaptain',
                credential: 'i^YV13eTPOHdVzWm#2t5',
              },
              {
                urls: 'turn:relay.smp46.me:3478?transport=tcp',
                username: 'ferryCaptain',
                credential: 'i^YV13eTPOHdVzWm#2t5',
              },
            ],
          },
          dataChannel: {
            bufferedAmountLowThreshold: 1024 * 1024,
            maxMessageSize: 256 * 1024,
            maxBufferedAmount: 16 * 1024 * 1024,
            ordered: true,
            protocol: 'file-transfer',
          },
        }),
        circuitRelayTransport({
          discoverRelays: 0,
          reservationConcurrency: 1,
        }),
      ],
      connectionEncrypters: [noise()],
      streamMuxers: [
        yamux({
          maxStreamWindowSize: 1024 * 1024 * 2,
          maxMessageSize: 1024 * 1024,
        }),
      ],
      connectionGater: {
        denyDialMultiaddr: () => false,
      },
      services: {
        identify: identify(),
        identifyPush: identifyPush(),
        ping: ping({
          protocolPrefix: 'ipfs',
          maxInboundStreams: 1,
          maxOutboundStreams: 1,
          runOnTransientConnection: false,
          timeout: 30000,
        }),
      },
      connectionManager: {
        minConnections: 0,
        pollInterval: 30000,
        inboundConnectionThreshold: 5,
        maxIncomingPendingConnections: 5,
        autoDialInterval: 0,
        maxParallelDials: 10,
        dialTimeout: 30000,
      },
    });

    await this.node.start();
    console.log(`Node started with Peer ID: ${this.node.peerId.toString()}`);
  }

  async setupManagers() {
    // Create UI manager first
    this.managers.ui = new UIManager(this.appState);

    // Create error handler with UI manager
    this.managers.error = new ErrorHandler(this.managers.ui);

    // Create progress tracker
    this.managers.progress = new ProgressTracker();

    // Create core managers
    this.managers.connection = new ConnectionManager(
      this.node,
      this.appState,
      this.managers.error,
    );

    this.managers.fileTransfer = new FileTransferManager(
      this.node,
      this.appState,
      this.managers.progress,
      this.managers.error,
    );

    this.managers.relay = new RelayManager(
      this.node,
      this.appState,
      this.managers.error,
    );

    // Setup event listeners
    this.setupEventListeners();

    // Setup file transfer protocol
    this.managers.fileTransfer.setupFileTransferProtocol();
  }

  async setupUI() {
    this.managers.ui.setupEventListeners();

    // Override UI callbacks
    this.managers.ui.onFileSelected = this.handleFileSelected.bind(this);
    this.managers.ui.onPhraseEntered = this.handlePhraseEntered.bind(this);
    this.managers.ui.onReceiveModeRequested =
      this.handleReceiveModeRequested.bind(this);

    // Override progress callbacks
    this.managers.progress.onProgressUpdate =
      this.handleProgressUpdate.bind(this);
  }

  setupEventListeners() {
    this.node.addEventListener(
      'connection:open',
      this.managers.connection.onConnectionEstablished.bind(
        this.managers.connection,
      ),
    );

    this.node.addEventListener(
      'connection:close',
      this.managers.connection.onConnectionClosed.bind(
        this.managers.connection,
      ),
    );
  }

  async getStunConfiguration() {
    try {
      const closestStun = await this.services.stun.getClosestStunServer();
      return closestStun
        ? `stun:${closestStun}`
        : this.config.getStunServers()[0];
    } catch (error) {
      console.warn('Could not fetch closest STUN server:', error);
      return this.config.getStunServers()[0];
    }
  }

  // Event handlers
  async handleFileSelected(file) {
    try {
      this.managers.ui.showSenderMode();
      await this.startSenderMode(file);
    } catch (error) {
      this.managers.error.handleTransferError(error, {
        operation: 'fileSelected',
      });
    }
  }

  async handlePhraseEntered(phrase) {
    try {
      await this.startReceiverMode(phrase);
    } catch (error) {
      this.managers.error.handleApiError(error, { operation: 'phraseEntered' });
    }
  }

  async handleReceiveModeRequested() {
    this.managers.ui.showReceiverMode();
  }

  handleProgressUpdate(progress, direction) {
    this.managers.ui.showFileProgress(progress);
  }

  async startSenderMode(file) {
    try {
      this.appState.setSelectedFile(file);
      this.appState.setMode('sender');

      console.log('Starting sender mode...');

      // Generate phrase first
      const phrase = await this.services.phrase.generatePhrase();
      console.log(`Generated phrase: ${phrase}`);

      // Update UI with phrase
      const phraseDisplay = document.getElementById('generatedPhraseDisplay');
      if (phraseDisplay) {
        phraseDisplay.textContent = phrase;
      }

      // Connect to relay
      console.log('Connecting to relay...');
      await this.managers.relay.connectToRelay(this.config.getRelayAddress());

      // Wait for relay to be ready
      console.log('Waiting for relay to be ready...');
      const canUseRelay = await this.managers.relay.canUseRelay();
      if (!canUseRelay) {
        throw new Error('Relay is not ready for use');
      }

      // Get circuit address
      const circuitAddress = await this.managers.relay.waitForRelayAddress();
      console.log(`Circuit address: ${circuitAddress.toString()}`);

      // Register phrase
      console.log('Registering phrase...');
      await this.services.phrase.registerPhrase(phrase, circuitAddress);

      console.log('Sender mode setup complete. Waiting for receiver...');
    } catch (error) {
      console.error('Failed to start sender mode:', error);
      this.managers.error.handleTransferError(error, {
        operation: 'startSenderMode',
      });
      this.appState.setMode('idle');
      throw error;
    }
  }

  async startReceiverMode(phrase) {
    this.appState.setMode('receiver');

    // Lookup phrase
    const addressData = await this.services.phrase.lookupPhrase(phrase);

    if (!addressData.maddr) {
      throw new Error('No address found for phrase');
    }

    const peerMultiaddr = multiaddr(addressData.maddr);

    // Connect to sender
    await this.managers.connection.dialPeer(peerMultiaddr);

    console.log(`Connected to sender via phrase: ${phrase}`);
  }

  async start() {
    await this.initialize();
    console.log('FileFerry app started');
  }

  async stop() {
    if (this.node) {
      await this.node.stop();
    }
    this.appState.reset();
    console.log('FileFerry app stopped');
  }

  async cleanup() {
    await this.stop();
  }
}

const app = new FileFerryApp();

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await app.start();
  } catch (error) {
    console.error('Failed to start FileFerry app:', error);
  }
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
});

window.fileFerryApp = app;
