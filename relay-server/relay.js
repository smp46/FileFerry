import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { circuitRelayServer } from "@libp2p/circuit-relay-v2";
import { identify } from "@libp2p/identify";
import { webSockets } from "@libp2p/websockets";
import * as filters from "@libp2p/websockets/filters";
import { createLibp2p } from "libp2p";
import { promises as fs } from "fs";
import { existsSync } from "fs";
import { dirname } from "path";
import { createEd25519PeerId } from "@libp2p/peer-id-factory";
import { peerIdFromString } from "@libp2p/peer-id";
import { fromString as uint8ArrayFromString } from "uint8arrays/from-string";
import { privateKeyFromProtobuf } from "@libp2p/crypto/keys";

const LISTEN_HOST = process.env.LISTEN_HOST || "0.0.0.0";
const LISTEN_PORT = parseInt(process.env.LISTEN_PORT || 9090);
const MAX_RESERVATIONS = parseInt(process.env.MAX_RESERVATIONS || "50", 10);
const RESERVATION_TTL = parseInt(
  process.env.RESERVATION_TTL || 2 * 60 * 60 * 1000,
  10,
);

const MAX_CONNECTIONS = parseInt(process.env.MAX_CONNECTIONS || "500", 10);
const MIN_CONNECTIONS = parseInt(process.env.MIN_CONNECTIONS || "0", 10);

async function getPrivateKeyObjectFromEnv() {
  const privKeyBase64 = process.env.PRIV_KEY_BASE64;

  if (!privKeyBase64) {
    console.error(`Error: Environment variable is not set.`);
    return null;
  }

  try {
    const protobufEncodedPrivKeyBytes = uint8ArrayFromString(
      privKeyBase64,
      "base64pad",
    );

    const privateKeyObject = privateKeyFromProtobuf(
      protobufEncodedPrivKeyBytes,
    );

    console.log(
      "Successfully created PrivateKey object from protobuf. Type:",
      privateKeyObject.type,
    );
    return privateKeyObject;
  } catch (error) {
    console.error(
      "Error creating PrivateKey object from protobuf string:",
      error,
    );
    return null;
  }
}

async function main() {
  let serverNode;

  const shutdown = async (signal) => {
    console.info(`Received ${signal}. Shutting down relay server...`);
    if (serverNode && serverNode.status === "started") {
      try {
        await serverNode.stop();
        console.info("Server stopped.");
      } catch (err) {
        console.error("Error stopping server:", err);
      }
    }
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  try {
    const loadedPrivateKey = await getPrivateKeyObjectFromEnv();

    serverNode = await createLibp2p({
      privateKey: loadedPrivateKey,
      addresses: {
        listen: [`/ip4/${LISTEN_HOST}/tcp/${LISTEN_PORT}/ws`],
      },
      transports: [
        webSockets({
          filter: filters.all,
        }),
      ],
      connectionEncrypters: [noise()],
      streamMuxers: [yamux()],
      services: {
        identify: identify(),
        relay: circuitRelayServer({
          reservations: {
            maxReservations: MAX_RESERVATIONS,
            defaultTtl: RESERVATION_TTL,
          },
        }),
      },
      connectionManager: {
        maxConnections: MAX_CONNECTIONS,
        minConnections: MIN_CONNECTIONS,
      },
    });

    console.info(`Relay node ${serverNode.peerId.toString()} started.`);
    console.info("Listening on multiaddrs:");
    serverNode.getMultiaddrs().forEach((ma) => console.info(ma.toString()));
  } catch (error) {
    console.error("Failed to start the libp2p relay server:", error);
    process.exit(1);
  }
}

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

main().catch((error) => {
  console.error("Critical error during main execution:", error);
  process.exit(1);
});
