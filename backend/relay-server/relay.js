import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import {
  circuitRelayTransport,
  circuitRelayServer,
} from '@libp2p/circuit-relay-v2';
import { dcutr } from '@libp2p/dcutr';
import { identify, identifyPush } from '@libp2p/identify';
import { tls } from '@libp2p/tls';
import { loadOrCreateSelfKey } from '@libp2p/config';
import { keychain } from '@libp2p/keychain';
import { autoNAT } from '@libp2p/autonat';
import { autoTLS } from '@ipshipyard/libp2p-auto-tls';
import { tcp } from '@libp2p/tcp';
import { webSockets } from '@libp2p/websockets';
import { webRTC, webRTCDirect } from '@libp2p/webrtc';
import { WebSocketsSecure } from '@multiformats/multiaddr-matcher';
import { LevelDatastore } from 'datastore-level';
import { ping } from '@libp2p/ping';
import { kadDHT } from '@libp2p/kad-dht';
import { createLibp2p } from 'libp2p';

const ANNOUNCE_HOST = process.env.ANNOUNCE_HOST || '';
const LISTEN_HOST = process.env.LISTEN_HOST || '0.0.0.0';
const LISTEN_PORT = parseInt(process.env.LISTEN_PORT || 41337);
const MAX_RESERVATIONS = parseInt(process.env.MAX_RESERVATIONS || '50', 10);
const RESERVATION_TTL = parseInt(
  process.env.RESERVATION_TTL || 60 * 60 * 1000,
  10,
);

async function main() {
  let serverNode;

  const shutdown = async (signal) => {
    console.info(`Received ${signal}. Shutting down relay server...`);
    if (serverNode && serverNode.status === 'started') {
      try {
        await serverNode.stop();
        console.info('Server stopped.');
      } catch (err) {
        console.error('Error stopping server:', err);
      }
    }
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    const datastore = new LevelDatastore('/usr/src/app/db/db');
    await datastore.open();

    const privateKey = await loadOrCreateSelfKey(datastore);

    serverNode = await createLibp2p({
      datastore: datastore,
      privateKey: privateKey,
      addresses: {
        listen: [
          `/ip4/${LISTEN_HOST}/tcp/${LISTEN_PORT}/`,
          `/ip4/${LISTEN_HOST}/tcp/${LISTEN_PORT + 1}/ws`,
          `/ip4/${LISTEN_HOST}/udp/${LISTEN_PORT + 2}/webrtc-direct`,
          `/p2p-circuit`,
        ],
        announce: [
          `/ip4/${LISTEN_HOST}/tcp/${LISTEN_PORT}/`,
          `/ip4/${LISTEN_HOST}/tcp/${LISTEN_PORT + 1}/ws`,
          `/ip4/${LISTEN_HOST}/udp/${LISTEN_PORT + 2}/webrtc-direct`,
          `/p2p-circuit`,
        ],
      },
      transports: [
        circuitRelayTransport(),
        webRTC(),
        webRTCDirect(),
        webSockets(),
      ],
      connectionEncrypters: [noise(), tls()],
      streamMuxers: [yamux()],
      services: {
        dht: kadDHT({
          clientMode: false,
        }),
        identify: identify(),
        identifyPush: identifyPush(),
        keychain: keychain(),
        ping: ping(),
        autoTLS: autoTLS({
          autoConfirmAddress: true,
        }),
        dcutr: dcutr(),
        autoNAT: autoNAT(),
        relay: circuitRelayServer({
          reservations: {
            maxReservations: MAX_RESERVATIONS,
            defaultTtl: RESERVATION_TTL,
          },
        }),
      },
    });

    serverNode.addEventListener('certificate:provision', () => {
      console.info('A TLS certificate was provisioned');

      const interval = setInterval(() => {
        const mas = serverNode
          .getMultiaddrs()
          .filter(
            (ma) =>
              WebSocketsSecure.exactMatch(ma) &&
              ma.toString().includes('/sni/'),
          )
          .map((ma) => ma.toString());

        if (mas.length > 0) {
          console.info('addresses:');
          console.info(mas.join('\n'));
          clearInterval(interval);
        }
      }, 1_000);
    });

    console.info(`Relay node ${serverNode.peerId.toString()} started.`);
    console.info('Listening on multiaddrs:');
    serverNode.getMultiaddrs().forEach((ma) => console.info(ma.toString()));
  } catch (error) {
    console.error('Failed to start the libp2p relay server:', error);
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

main().catch((error) => {
  console.error('Critical error during main execution:', error);
  process.exit(1);
});
