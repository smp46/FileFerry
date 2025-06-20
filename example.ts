// app.ts
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { identify, identifyPush } from '@libp2p/identify';
import { ping } from '@libp2p/ping';
import { webRTC, webRTCDirect } from '@libp2p/webrtc';
import { webSockets } from '@libp2p/websockets';
import { createLibp2p, type Libp2p, type Libp2pOptions } from 'libp2p';
import { multiaddr } from '@multiformats/multiaddr';
import { autoNAT } from '@libp2p/autonat';
import { keychain } from '@libp2p/keychain';
import { dcutr } from '@libp2p/dcutr';
import { kadDHT } from '@libp2p/kad-dht';
import { bootstrap } from '@libp2p/bootstrap';
import { WebRTC } from '@multiformats/multiaddr-matcher';
import * as filters from '@libp2p/websockets/filters';

import { StunService } from './src/services/StunService.ts';
import { PhraseService } from './src/services/PhraseService.ts';
import { ConfigManager } from './src/utils/ConfigManager.ts';

/**
 * Interface for the services container.
 * @internal
 */
interface Services {
  stun: StunService;
  phrase: PhraseService;
}
/**
 * The main application class that manages all modules.
 */
class FileFerryApp {
  private config: ConfigManager;
  private node: Libp2p | null;
  private services: Partial<Services>;

  /**
   * Initializes the FileFerryApp.
   */
  public constructor() {
    this.config = new ConfigManager();
    this.node = null;
    this.services = {};
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
   * Initializes all services, managers, and the libp2p node.
   * @returns A promise that resolves when initialization is complete.
   */
  public async initialize(): Promise<void> {
    try {
      this.config.validateConfig();
      await this.setupServices();
      await this.setupLibp2pNode();

      console.log('FileFerry app initialized successfully');
    } catch (error) {
      console.error('Failed to initialize app:', error);
      throw error;
    }
  }

  /**
   * Creates and configures the libp2p node.
   * @returns A promise that resolves when the node is started.
   * @internal
   */
  private async setupLibp2pNode(): Promise<void> {
    const iceConfig = {
      rtcConfiguration: {
        iceServers: [
          {
            urls: 'stun:stun.l.google.com:19302',
          },
          {
            urls: 'turn:turn.fileferry.xyz:5349',
            username: 'ferryCaptain',
            credential: 'i^YV13eTPOHdVzWm#2t5',
          },
        ],
      },
    };

    const relayAddr =
      '/dns4/195-114-14-137.k51qzi5uqu5dlg6rzzu1wamxpip5om9vddzw5dvmw38wp1f4b30yi0q4itxkym.libp2p.direct/tcp/41338/wss/p2p/12D3KooWQ3E3PsbrVnnh34dSggrcTqBKqrA2bbMwTH9EHmea7CfP';

    const options: Libp2pOptions = {
      addresses: {
        listen: ['/webrtc', '/p2p-circuit'],
      },
      transports: [
        circuitRelayTransport({
          discoverRelays: 1,
        }),
        webRTC(iceConfig),
        webSockets({
          filter: filters.all,
        }),
      ],
      connectionEncrypters: [noise()],
      streamMuxers: [yamux()],
      connectionGater: {
        denyDialMultiaddr: (multiaddr) => {
          const isIPv6 = multiaddr.toString().startsWith('/ip6/');
          if (isIPv6) {
            return true;
          }
          return false;
        },
      },
      services: {
        dht: kadDHT({
          clientMode: true,
        }),
        peerDiscovery: bootstrap({
          list: [relayAddr],
          timeout: 1000,
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

    /**
     * Starts the sender workflow.
     * @param file - The file to be sent.
     */
    const startSenderMode = async (): Promise<void> => {
      try {
        console.log('Starting sender mode...');

        // Phrase is a rndomly generated string used to connect sender and receiver
        const phrase = await this.services.phrase?.generatePhrase();
        console.log(`Generated phrase: ${phrase}`);

        let webRTCMultiAddr;
        while (!webRTCMultiAddr) {
          webRTCMultiAddr = this.node
            ?.getMultiaddrs()
            .find((ma) => WebRTC.matches(ma));
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        console.log('WebRTC Circuit Address:', webRTCMultiAddr?.toString());

        console.log('Registering phrase...');
        await this.services.phrase?.registerPhrase(
          phrase || '',
          webRTCMultiAddr,
        );

        console.log('Sender mode setup complete. Waiting for receiver...');
      } catch (error) {
        console.error('Failed to start sender mode:', error);
      }
    };

    /**
     * Starts the receiver workflow.
     * @param phrase - The phrase to look up the sender.
     */
    const startReceiverMode = async (phrase: string): Promise<void> => {
      const addressData = await this.services.phrase?.lookupPhrase(phrase);

      if (!addressData?.maddr) {
        throw new Error('No address found for phrase');
      }

      const peerMultiaddr = multiaddr(addressData.maddr);
      console.log(`Connecting to peer: ${addressData.maddr}`);

      await this.node?.dial(peerMultiaddr, {
        signal: AbortSignal.timeout(60000),
      });

      console.log(`Connected to sender via phrase: ${phrase}`);
    };

    // Prompt user to choose between sender and receiver mode
    const mode = prompt('Enter mode: sender or receiver', 'sender')
      ?.trim()
      .toLowerCase();

    if (mode === 'sender') {
      await startSenderMode();
    } else if (mode === 'receiver') {
      const phrase = prompt(
        'Enter the phrase to connect to the sender',
      )?.trim();
      if (phrase) {
        await startReceiverMode(phrase);
      } else {
        console.warn('Receiver mode canceled: no phrase provided.');
      }
    } else {
      console.warn(
        'Invalid mode selected. Node is running but no mode started.',
      );
    }
  }
}

const app = new FileFerryApp();
app.initialize();
