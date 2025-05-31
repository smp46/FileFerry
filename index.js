import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { circuitRelayTransport } from "@libp2p/circuit-relay-v2";
import { identify, identifyPush } from "@libp2p/identify";
import { ping } from "@libp2p/ping";
import { webRTC } from "@libp2p/webrtc";
import { webSockets } from "@libp2p/websockets";
import * as filters from "@libp2p/websockets/filters";
import { multiaddr, protocols } from "@multiformats/multiaddr";
import { createLibp2p } from "libp2p";

const WEBRTC_CODE = protocols("webrtc").code;

const output = document.getElementById("output");
const appendOutput = (line) => {
  if (output) {
    const div = document.createElement("div");
    div.appendChild(document.createTextNode(line));
    output.append(div);
  } else {
    console.log(line);
  }
};

let localPeerMultiaddrs = [];

const VITE_RELAY_MADDR = import.meta.env.VITE_RELAY_MADDR;
const VITE_PHRASEBOOK_API_URL = import.meta.env.VITE_PHRASEBOOK_API_URL;

let node;

let isSenderWaiting = false;
let generatedPhrase = "8-drunken-sailors";
let isReceiverConnecting = false;
let relayPeerIdStr = null;

function getCircuitAddress(libp2pNode, timeout = 25000) {
  return new Promise((resolve, reject) => {
    let timer;
    const listener = () => {
      const multiaddrs = libp2pNode.getMultiaddrs();
      const circuitAddr = multiaddrs.find((ma) =>
        ma.toString().includes("/p2p-circuit"),
      );
      if (circuitAddr) {
        libp2pNode.removeEventListener("self:peer:update", listener);
        clearTimeout(timer);
        resolve(circuitAddr);
      }
    };

    timer = setTimeout(() => {
      libp2pNode.removeEventListener("self:peer:update", listener);
      reject(
        new Error("Timeout: Could not obtain a circuit address via relay."),
      );
    }, timeout);

    const initialMultiaddrs = libp2pNode.getMultiaddrs();
    const initialCircuitAddr = initialMultiaddrs.find((ma) =>
      ma.toString().includes("/p2p-circuit"),
    );
    if (initialCircuitAddr) {
      clearTimeout(timer);
      resolve(initialCircuitAddr);
      return;
    }

    libp2pNode.addEventListener("self:peer:update", listener);
  });
}

async function main() {
  node = await createLibp2p({
    addresses: {
      listen: ["/p2p-circuit", "/webrtc"],
    },
    transports: [
      webSockets({
        filter: filters.all,
      }),
      webRTC({
        rtcConfiguration: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            { urls: "stun:stun.nextcloud.com:443" },
          ],
        },
      }),
      circuitRelayTransport({}),
    ],
    connectionEncryption: [noise()],
    streamMuxers: [yamux()],
    connectionGater: {
      denyDialMultiaddr: async () => {
        return false;
      },
    },
    services: {
      identify: identify(),
      identifyPush: identifyPush(),
      ping: ping(),
    },
  });

  await node.start();
  appendOutput(`Node started with Peer ID: ${node.peerId.toString()}`);
  localPeerMultiaddrs = node.getMultiaddrs().map((ma) => ma.toString());
  appendOutput("My addresses:");
  localPeerMultiaddrs.forEach((addr) => appendOutput(`  - ${addr}`));

  if (VITE_RELAY_MADDR) {
    try {
      relayPeerIdStr = multiaddr(VITE_RELAY_MADDR).getPeerId();
    } catch (e) {
      appendOutput(
        `Warning: Could not parse Peer ID from VITE_RELAY_MADDR: ${VITE_RELAY_MADDR}. Relay connection distinction might fail.`,
      );
      console.warn("Error parsing relay PeerID from VITE_RELAY_MADDR:", e);
    }
  }

  node.addEventListener("connection:open", (event) => {
    const remotePeerId = event.detail.remotePeer.toString();
    const remoteAddr = event.detail.remoteAddr.toString();
    appendOutput(`Connection OPENED with: ${remotePeerId} on ${remoteAddr}`);

    if (isSenderWaiting) {
      if (relayPeerIdStr && remotePeerId === relayPeerIdStr) {
        appendOutput("INFO: Connection to the relay server confirmed.");
      } else {
        appendOutput("Connected");
        isSenderWaiting = false;
        generatedPhrase = "8-drunken-sailors";
      }
    } else if (isReceiverConnecting) {
      appendOutput("Connected");
      isReceiverConnecting = false;
    }
  });

  node.addEventListener("connection:close", (event) => {
    appendOutput(
      `Connection CLOSED with: ${event.detail.remotePeer.toString()}`,
    );
    if (
      isSenderWaiting &&
      event.detail.remotePeer.toString() === relayPeerIdStr
    ) {
      appendOutput("ERROR: Connection to relay lost while waiting for peer.");
      isSenderWaiting = false;
    }
    if (isReceiverConnecting) {
      appendOutput("INFO: Peer connection attempt failed or dropped.");
      isReceiverConnecting = false;
    }
  });

  node.addEventListener("self:peer:update", () => {
    appendOutput("Node addresses updated (self:peer:update):");
    localPeerMultiaddrs = node.getMultiaddrs().map((ma) => ma.toString());
    localPeerMultiaddrs.forEach((addr) => appendOutput(`  - ${addr}`));
  });
}

const isWebrtc = (ma) => {
  return ma.protoCodes().includes(WEBRTC_CODE);
};

window.send = {};
window.send.onclick = async () => {
  if (!node) {
    appendOutput("Libp2p node not initialized yet.");
    return;
  }
  if (!VITE_RELAY_MADDR) {
    appendOutput("Relay address (VITE_RELAY_MADDR) is not configured.");
    return;
  }

  output.innerHTML = "";
  isSenderWaiting = true;
  generatedPhrase = "8-drunken-sailors";

  appendOutput(`Your passphrase: ${generatedPhrase}`);
  appendOutput(`Attempting to connect to relay: ${VITE_RELAY_MADDR}...`);

  const relayMa = multiaddr(VITE_RELAY_MADDR);
  const dialSignal = AbortSignal.timeout(30000);

  try {
    await node.dial(relayMa, { signal: dialSignal });
    appendOutput(`Successfully connected to relay '${relayMa.toString()}'.`);
    appendOutput(
      "Obtaining our listen address via relay (may take a moment)...",
    );

    const senderCircuitAddress = await getCircuitAddress(node, 25000);
    appendOutput(`Obtained listen address: ${senderCircuitAddress.toString()}`);

    appendOutput(
      `Registering passphrase '${generatedPhrase}' with the address book...`,
    );
    const apiUrl = `${VITE_PHRASEBOOK_API_URL}/phrase/${encodeURIComponent(generatedPhrase)}`;

    const response = await fetch(apiUrl, {
      method: "POST",
      body: JSON.stringify({
        Phrase: generatedPhrase,
        Maddr: senderCircuitAddress.toString(),
      }),
      headers: {
        "Content-type": "application/json; charset=UTF-8",
      },
    });

    if (response.ok) {
      appendOutput(
        `Passphrase registered successfully. Waiting for a peer to connect...`,
      );
    } else {
      const errorText = await response.text();
      appendOutput(
        `Failed to register passphrase. Status: ${response.status}. Error: ${errorText}`,
      );
      isSenderWaiting = false;
      generatedPhrase = "";
    }
  } catch (err) {
    if (dialSignal.aborted && !err.message.includes("circuit address")) {
      appendOutput(`Timed out connecting to relay '${relayMa.toString()}'.`);
    } else {
      appendOutput(`Error in send process: ${err.message || err}`);
    }
    console.error("Libp2p send process error:", err);
    isSenderWaiting = false;
    generatedPhrase = "";
  }
};

window.receive = {};
window.receive.onclick = async () => {
  if (!node) {
    appendOutput("Libp2p node not initialized yet.");
    return;
  }

  const phraseInput = document.getElementById("phrase");
  if (!phraseInput) {
    appendOutput("Phrase input field (id='phrase') not found.");
    return;
  }
  const phraseValue = phraseInput.value.trim();

  if (!phraseValue) {
    appendOutput("Please enter a phrase to lookup.");
    return;
  }
  output.innerHTML = "";
  appendOutput(`Looking up passphrase '${phraseValue}'...`);
  isReceiverConnecting = true;

  try {
    const apiUrl = `${VITE_PHRASEBOOK_API_URL}/phrase/${encodeURIComponent(phraseValue)}`;
    const response = await fetch(apiUrl);

    if (!response.ok) {
      let apiErrorMessage = `Failed to lookup phrase '${phraseValue}'. Status: ${response.status}`;
      try {
        const errorData = await response.json();
        apiErrorMessage += ` - ${errorData.message || response.statusText}`;
        if (response.status === 409 && errorData.item) {
          appendOutput(
            `Info: Phrase '${phraseValue}' is used by maddr: ${errorData.item.maddr}. Not connecting.`,
          );
          isReceiverConnecting = false;
          return;
        } else if (response.status === 404) {
          appendOutput(`Error: Phrase '${phraseValue}' not found.`);
          isReceiverConnecting = false;
          return;
        }
      } catch (e) {
        apiErrorMessage += ` - ${response.statusText}`;
      }
      appendOutput(apiErrorMessage);
      isReceiverConnecting = false;
      return;
    }

    const addressData = await response.json();
    const maddrString = addressData.maddr;

    if (!maddrString) {
      appendOutput(
        `Phrase '${phraseValue}' found, but no multiaddress (maddr) was provided.`,
      );
      isReceiverConnecting = false;
      return;
    }

    const peerMa = multiaddr(maddrString);
    appendOutput(
      `Retrieved multiaddr: '${peerMa.toString()}' for phrase '${phraseValue}'.`,
    );
    appendOutput(`Attempting to connect to peer...`);

    const connectSignal = AbortSignal.timeout(30000);

    try {
      appendOutput(`Pinging peer '${peerMa.toString()}'...`);
      const rtt = await node.services.ping.ping(peerMa, {
        signal: connectSignal,
        count: 1,
      });
      appendOutput(`Ping successful to '${peerMa.toString()}'! RTT: ${rtt}ms`);
    } catch (pingErr) {
      appendOutput(
        `Ping failed to '${peerMa.toString()}': ${pingErr.message || pingErr}. Attempting dial anyway...`,
      );
    }

    await node.dial(peerMa, { signal: connectSignal });
  } catch (error) {
    if (error.name === "AbortError") {
      appendOutput(`Timed out connecting to peer.`);
    } else {
      appendOutput(`Error in receive process: ${error.message || error}`);
    }
    console.error("Libp2p receive process error:", error);
    isReceiverConnecting = false;
  }
};

main().catch((err) => {
  console.error("Failed to initialize libp2p node:", err);
  appendOutput(
    `Critical Error: Failed to initialize libp2p node - ${err.message}`,
  );
});

document.getElementById("send").addEventListener("click", window.send.onclick);
document
  .getElementById("receive")
  .addEventListener("click", window.receive.onclick);
