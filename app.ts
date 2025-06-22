// app.ts
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { identify, identifyPush } from '@libp2p/identify';
import { ping } from '@libp2p/ping';
import { webRTC } from '@libp2p/webrtc';
import { webSockets } from '@libp2p/websockets';
import { createLibp2p, type Libp2p, type Libp2pOptions } from 'libp2p';
import { multiaddr } from '@multiformats/multiaddr';
import { keychain } from '@libp2p/keychain';
import { dcutr } from '@libp2p/dcutr';
import { kadDHT } from '@libp2p/kad-dht';
import { bootstrap } from '@libp2p/bootstrap';
import { WebRTC } from '@multiformats/multiaddr-matcher';
import * as filters from '@libp2p/websockets/filters';
import type { ConnectionGater } from '@libp2p/interface';
import type { Multiaddr } from '@multiformats/multiaddr';

import { AppState } from '@/core/AppState';
import { ConnectionManager } from '@/core/ConnectionManager';
import { FileTransferManager } from '@/core/FileTransferManager';
import { StunService } from '@/services/StunService';
import { PhraseService } from '@/services/PhraseService';
import { UIManager } from '@/ui/UIManager';
import { ProgressTracker } from '@/ui/ProgressTracker';
import { ErrorHandler } from '@/utils/ErrorHandler';
import { ConfigManager } from '@/utils/ConfigManager';

/**
 * Interface for the services container.
 * @internal
 */
interface Services {
  stun: StunService;
  phrase: PhraseService;
}

/**
 * Interface for the managers container.
 * @internal
 */
interface Managers {
  ui: UIManager;
  error: ErrorHandler;
  progress: ProgressTracker;
  fileTransfer: FileTransferManager;
  connection: ConnectionManager;
}

// Extend the Window interface for global app access
declare global {
  interface Window {
    fileFerryApp: FileFerryApp;
  }
}

/**
 * The main application class that manages all modules.
 */
class FileFerryApp {
  private config: ConfigManager;
  private appState: AppState;
  private node: Libp2p | null;
  private services: Partial<Services>;
  private managers: Partial<Managers>;

  /**
   * Initializes the FileFerryApp.
   */
  public constructor() {
    this.config = new ConfigManager();
    this.appState = new AppState();
    this.node = null;
    this.services = {};
    this.managers = {};
  }

  /**
   * Initializes all services, managers, and the libp2p node.
   * @returns A promise that resolves when initialization is complete.
   */
  public async initialize(): Promise<void> {
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

  /**
   * Sets up application services.
   * @returns A promise that resolves when services are set up.
   * @internal
   */
  private async setupServices(): Promise<void> {
    this.services.stun = new StunService();
    this.services.phrase = new PhraseService(this.config.getApiUrl());
  }

  /**
   * Creates and configures the libp2p node.
   * @returns A promise that resolves when the node is started.
   * @internal
   */
  private async setupLibp2pNode(): Promise<void> {
    const stunServer = await this.getStunConfiguration();
    const relayAddress = this.config.getRelayAddress();
    console.log(stunServer);

    const iceConfig = {
      rtcConfiguration: {
        iceServers: [
          {
            urls: stunServer,
          },
          {
            urls: 'turn:turn.fileferry.xyz:5349',
            username: 'ferryCaptain',
            credential: 'i^YV13eTPOHdVzWm#2t5',
          },
        ],
      },
    };

    const options: Libp2pOptions = {
      addresses: {
        listen: ['/webrtc', '/p2p-circuit'],
      },
      transports: [
        circuitRelayTransport(),
        webRTC(iceConfig),
        webSockets({
          filter: filters.all,
        }),
      ],
      connectionEncrypters: [noise()],
      streamMuxers: [yamux()],
      services: {
        dht: kadDHT(),
        peerDiscovery: bootstrap({
          list: [relayAddress],
          timeout: 2000,
        }),
        dcutr: dcutr(),
        identify: identify(),
        identifyPush: identifyPush(),
        keychain: keychain(),
        ping: ping(),
      },
    };

    this.node = await createLibp2p(options);
    await this.node.start();
    console.log(`Node started with Peer ID: ${this.node.peerId.toString()}`);
  }

  /**
   * Sets up all application managers.
   * @returns A promise that resolves when managers are set up.
   * @internal
   */
  private async setupManagers(): Promise<void> {
    if (!this.node) {
      throw new Error('Libp2p node is not initialized.');
    }
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
    );

    this.managers.connection = new ConnectionManager(
      this.node,
      this.appState,
      this.managers.error,
      this.config,
      this.managers.fileTransfer,
    );

    // Setup event listeners
    this.setupEventListeners();

    // Setup file transfer protocol
    this.managers.fileTransfer.setupFileTransferProtocol();

    //If the URL has a pathname, handle it
    const pathname = window.location.pathname;
    if (pathname) {
      this.actionPathname(pathname);
    }
  }

  /**
   * Sets up the UI manager and its callbacks.
   * @returns A promise that resolves when the UI is set up.
   * @internal
   */
  private async setupUI(): Promise<void> {
    if (!this.managers.ui) {
      throw new Error('UIManager not initialized');
    }
    this.managers.ui.setupEventListeners();

    // Override UI callbacks
    this.managers.ui.onFileSelected = this.handleFileSelected.bind(this);
    this.managers.ui.onPhraseEntered = this.handlePhraseEntered.bind(this);
    this.managers.ui.onReceiveModeRequested =
      this.handleReceiveModeRequested.bind(this);
  }

  /**
   * Sets up global libp2p event listeners.
   * @internal
   */
  private setupEventListeners(): void {
    if (!this.node || !this.managers.connection) {
      return;
    }
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

  /**
   * Gets the best STUN server configuration.
   * @returns A promise that resolves to the STUN server URL string.
   * @internal
   */
  private async getStunConfiguration(): Promise<string[]> {
    if (!this.services.stun) {
      return this.config.getStunServers();
    }
    try {
      const closestStuns = await this.services.stun.getClosestStunServers();
      return closestStuns ? closestStuns : this.config.getStunServers();
    } catch (error) {
      console.warn('Could not fetch closest STUN server:', error);
      return this.config.getStunServers();
    }
  }

  /**
   * Handles the file selection event from the UI.
   * @param file - The selected file.
   * @internal
   */
  private async handleFileSelected(file: File): Promise<void> {
    if (!this.managers.ui || !this.managers.error) {
      return;
    }
    try {
      this.managers.ui.showSenderMode();
      await this.startSenderMode(file);
    } catch (error) {
      this.managers.error.handleTransferError(error as Error, {
        operation: 'fileSelected',
        direction: 'send',
      });
    }
  }

  /**
   * Handles the phrase submission event from the UI.
   * @param phrase - The entered phrase.
   * @internal
   */
  private async handlePhraseEntered(phrase: string): Promise<void> {
    if (!this.managers.error) {
      return;
    }
    try {
      await this.startReceiverMode(phrase);
    } catch (error) {
      this.managers.error.handleApiError(error as Error, {
        operation: 'phraseEntered',
      });
    }
  }

  /**
   * Handles the request to switch to receiver mode.
   * @internal
   */
  private async handleReceiveModeRequested(): Promise<void> {
    if (!this.managers.ui) {
      return;
    }
    this.managers.ui.showReceiverMode();
  }

  /**
   * Starts the sender workflow.
   * @param file - The file to be sent.
   * @internal
   */
  private async startSenderMode(file: File): Promise<void> {
    if (!this.services.phrase || !this.managers.error) {
      return;
    }
    try {
      this.appState.setSelectedFile(file);
      this.appState.setMode('sender');

      console.log('Starting sender mode...');

      // Generate phrase first
      const phrase = await this.services.phrase.generatePhrase();
      console.log(`Generated phrase: ${phrase}`);

      // Update UI with phrase
      this.managers.ui?.showPhrase(phrase);

      // Get address
      let webRTCMultiAddr;
      while (!webRTCMultiAddr) {
        webRTCMultiAddr = this.node
          ?.getMultiaddrs()
          .find((ma) => WebRTC.matches(ma));
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      console.log('WebRTC Circuit Address:', webRTCMultiAddr?.toString());

      // Register phrase
      console.log('Registering phrase...');
      await this.services.phrase.registerPhrase(phrase, webRTCMultiAddr);

      console.log('Sender mode setup complete. Waiting for receiver...');
    } catch (error) {
      console.error('Failed to start sender mode:', error);
      this.managers.error.handleTransferError(error as Error, {
        operation: 'startSenderMode',
        direction: 'send',
      });
      this.appState.setMode('idle');
      throw error;
    }
  }

  /**
   * Starts the receiver workflow.
   * @param phrase - The phrase to look up the sender.
   * @internal
   */
  private async startReceiverMode(phrase: string): Promise<void> {
    if (
      !this.appState ||
      !this.services.phrase ||
      !this.managers.connection ||
      !this.node
    ) {
      return;
    }
    this.appState.setMode('receiver');

    // Lookup phrase
    let addressData;
    try {
      addressData = await this.services.phrase.lookupPhrase(phrase);
    } catch (error) {
      this.managers.ui?.showErrorPopup(
        'No address found for the provided phrase.',
      );
    }

    if (addressData == undefined || !addressData.maddr) {
      this.managers.ui?.showErrorPopup(
        'No address found for the provided phrase.',
      );
      return;
    }

    const peerMultiaddr = multiaddr(addressData.maddr);
    console.log(`Connecting to peer: ${addressData.maddr}`);

    const connection = await this.managers.connection.dialPeer(peerMultiaddr, {
      signal: AbortSignal.timeout(60000),
    });

    console.log(`Connected to sender via phrase: ${phrase}`);

    this.appState.setActivePeer(connection.remotePeer.toString());
  }

  /**
   * Conditionally handles the provided pathname of the current URL.
   * If the pathname starts with `/send`, it shows the send window.
   * If it starts with `/receive`, it checks for a phrase in the URL parameters,
   * if the phrase is valid, it starts the receiver mode and shows the receiver window.
   *
   * @param pathname - The pathname from the current URL.
   * @internal
   */
  private actionPathname(pathname: string): void {
    if (pathname.startsWith('/send')) {
      this.managers.ui?.showSendWindow();
    } else if (pathname.startsWith('/receive')) {
      this.managers.ui?.showReceiveWindow();
      const urlParams = new URLSearchParams(window.location.search);
      const phrase = this.services.phrase?.sanitizePhrase(
        urlParams.get('phrase') || '',
      );
      if (phrase && this.services.phrase?.validatePhrase(phrase)) {
        this.startReceiverMode(phrase);
        this.managers.ui?.showReceiverMode();
        this.managers.ui?.onPhraseEntered(phrase);
      } else {
        this.managers.ui?.showErrorPopup('Invalid phrase provided.');
      }
    } else if (
      pathname !== '/' &&
      pathname !== '' &&
      !pathname.startsWith('/staging')
    ) {
      this.managers.ui?.showErrorPopup('404 Page Not Found');
    }
  }

  /**
   * Starts the application.
   * @returns A promise that resolves when the app has started.
   */
  public async start(): Promise<void> {
    await this.initialize();
  }

  /**
   * Stops the application and the libp2p node.
   * @returns A promise that resolves when the app has stopped.
   */
  public async stop(): Promise<void> {
    if (this.node) {
      await this.node.stop();
    }
    this.appState.reset();
    console.log('FileFerry app stopped');
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

window.addEventListener(
  'unhandledrejection',
  (event: PromiseRejectionEvent) => {
    console.error('Unhandled promise rejection:', event.reason);
  },
);

window.addEventListener('error', (event: ErrorEvent) => {
  console.error('Global error:', event.error);
});

window.fileFerryApp = app;
