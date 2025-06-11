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
            iceCandidatePoolSize: 10,
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require',
          },
          initiatorOptions: {
            offerTimeout: 30000,
            answerTimeout: 30000,
          },
          dataChannelOptions: {
            ordered: true,
            maxRetransmits: 10,
          },
        }),
        circuitRelayTransport({
          discoverRelays: 0,
          reservationConcurrency: 1,
          maxReservations: 1,
          connectionGater: {
            denyInboundRelayedConnection: () => false,
            denyOutboundRelayedConnection: () => false,
          },
        }),
      ],
      connectionEncrypters: [noise()],
      streamMuxers: [
        yamux({
          maxStreamWindowSize: 1024 * 1024 * 4,
          maxMessageSize: 1024 * 1024 * 2,
          keepAliveInterval: 30000,
          maxInboundStreams: 512,
          maxOutboundStreams: 512,
          streamWindowUpdateThreshold: 1024 * 256,
          closeTimeout: 0,
          streamCloseTimeout: 60000,
        }),
      ],

      connectionGater: {
        denyDialMultiaddr: () => false,
      },
      services: {
        identify: identify({
          timeout: 30000,
          maxInboundStreams: 64,
          maxOutboundStreams: 64,
          runOnTransientConnection: false,
        }),
        identifyPush: identifyPush({
          runOnTransientConnection: false,
        }),
        ping: ping({
          maxInboundStreams: 32,
          maxOutboundStreams: 32,
          timeout: 30000,
        }),
      },
      connectionManager: {
        minConnections: 1,
        pollInterval: 30000,
        inboundConnectionThreshold: 5,
        maxIncomingPendingConnections: 10,
        autoDialInterval: 0,
        maxParallelDials: 10,
        dialTimeout: 60000,
        maxConnections: 100,
        autoDial: false,
        maxDialsPerPeer: 3,
        connectTimeout: 60000,
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
    this.managers.progress = new ProgressTracker(this.managers.ui);

    // Create core managers
    this.managers.fileTransfer = new FileTransferManager(
      this.node,
      this.appState,
      this.managers.progress,
      this.managers.ui,
      this.managers.error,
    );

    this.managers.connection = new ConnectionManager(
      this.node,
      this.appState,
      this.managers.error,
      this.config,
      this.managers.fileTransfer,
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
      await this.managers.relay.connectToRelay(this.config.getRelayAddress());

      // Wait for relay to be ready
      console.log('Waiting for relay to be ready...');
      const canUseRelay = await this.managers.relay.canUseRelay();
      if (!canUseRelay) {
        throw new Error('Relay is not ready for use');
      }

      // Get circuit address
      const circuitAddress = await this.managers.relay.waitForRelayAddress();

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

    // Connect to relay first
    await this.managers.relay.connectToRelay(this.config.getRelayAddress());

    // Wait for relay to be ready
    console.log('Waiting for relay to be ready...');
    const canUseRelay = await this.managers.relay.canUseRelay();
    if (!canUseRelay) {
      throw new Error('Relay is not ready for use');
    }

    // Wait for circuit address
    await this.managers.relay.waitForRelayAddress();

    const peerMultiaddr = multiaddr(addressData.maddr);

    const connection = await this.managers.connection.dialPeer(peerMultiaddr, {
      signal: AbortSignal.timeout(60000),
    });

    console.log(`Connected to sender via phrase: ${phrase}`);

    this.appState.setActivePeer(connection.remotePeer.toString());

    const checkWebRTC = setInterval(() => {
      const connections = this.node.getConnections(connection.remotePeer);
      const webrtcConn = connections.find((c) =>
        c.remoteAddr.toString().includes('/webrtc'),
      );

      if (webrtcConn && webrtcConn.status === 'open') {
        clearInterval(checkWebRTC);
        console.log(
          'WebRTC connection established, circuit can now be closed safely',
        );
      }
    }, 1000);
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

// debugger;
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
