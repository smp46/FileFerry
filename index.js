import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { circuitRelayTransport } from "@libp2p/circuit-relay-v2";
import { identify, identifyPush } from "@libp2p/identify";
import { ping } from "@libp2p/ping";
import { webRTC } from "@libp2p/webrtc";
import { webSockets } from "@libp2p/websockets";
import * as filters from "@libp2p/websockets/filters";
import { multiaddr, protocols } from "@multiformats/multiaddr";
import { byteStream } from "it-byte-stream";
import { createLibp2p } from "libp2p";
import { fromString, toString } from "uint8arrays";

const WEBRTC_CODE = protocols("webrtc").code;

const output = document.getElementById("output");
const sendSection = document.getElementById("send-section");
const appendOutput = (line) => {
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(line));
  output.append(div);
};
const CHAT_PROTOCOL = "/libp2p/examples/chat/1.0.0";
let ma;
let chatStream;

const node = await createLibp2p({
  addresses: {
    listen: ["/p2p-circuit", "/webrtc"],
  },
  transports: [
    webSockets({
      filter: filters.all,
    }),
    webRTC(),
    circuitRelayTransport(),
  ],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  connectionGater: {
    denyDialMultiaddr: () => {
      // by default we refuse to dial local addresses from the browser since they
      // are usually sent by remote peers broadcasting undialable multiaddrs but
      // here we are explicitly connecting to a local node so do not deny dialing
      // any discovered address
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

function updateConnList() {
  // Update connections list
  const connListEls = node.getConnections().map((connection) => {
    if (connection.remoteAddr.protoCodes().includes(WEBRTC_CODE)) {
      ma = connection.remoteAddr;
      sendSection.style.display = "block";
    }

    const el = document.createElement("li");
    el.textContent = connection.remoteAddr.toString();
    return el;
  });
  document.getElementById("connections").replaceChildren(...connListEls);
}

node.addEventListener("connection:open", (event) => {
  updateConnList();
});
node.addEventListener("connection:close", (event) => {
  updateConnList();
});

node.addEventListener("self:peer:update", (event) => {
  // Update multiaddrs list, only show WebRTC addresses
  const multiaddrs = node
    .getMultiaddrs()
    .filter((ma) => isWebrtc(ma))
    .map((ma) => {
      const el = document.createElement("li");
      el.textContent = ma.toString();
      return el;
    });
  document.getElementById("multiaddrs").replaceChildren(...multiaddrs);
});

node.handle(CHAT_PROTOCOL, async ({ stream }) => {
  chatStream = byteStream(stream);

  while (true) {
    const buf = await chatStream.read();
    appendOutput(`Received message '${toString(buf.subarray())}'`);
  }
});

const isWebrtc = (ma) => {
  return ma.protoCodes().includes(WEBRTC_CODE);
};

window.connect.onclick = async () => {
  const phrase = window.peer.value.trim(); // `window.peer` is the input field for the passphrase
  if (!phrase) {
    appendOutput("Please enter a phrase to lookup.");
    return;
  }

  appendOutput(`Looking up passphrase '${phrase}'...`);
  ma = null; // Reset ma

  try {
    // 1. Fetch the multiaddress from your Go API
    const apiUrl = `http://localhost:8080/phrase/${encodeURIComponent(phrase)}`;
    const response = await fetch(apiUrl);

    if (!response.ok) {
      let errorMessage = `Failed to lookup passphrase '${phrase}'. Status: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage += ` - ${errorData.message || "Unknown error from API"}`;
        if (response.status === 409 && errorData.item) {
          // Phrase used
          appendOutput(
            `Info: Phrase '${phrase}' is marked as used. Multiaddr: ${errorData.item.maddr}`,
          );
          // Decide if you want to allow connecting to "used" phrases.
          // For now, we'll prevent connection based on the 409 status.
          appendOutput("Connection aborted as phrase is already in use.");
          return;
        } else if (response.status === 404) {
          // Phrase not found
          appendOutput(
            `Error: Phrase '${phrase}' not found in the address book.`,
          );
          return;
        }
      } catch (e) {
        // Failed to parse error JSON from API, use status text
        errorMessage += ` - ${response.statusText}`;
      }
      appendOutput(errorMessage);
      return;
    }

    // 2. Parse the successful response
    const addressData = await response.json();
    const maddrString = addressData.maddr;

    if (!maddrString) {
      appendOutput(
        `Phrase '${phrase}' found, but no multiaddress (maddr) was provided by the API.`,
      );
      return;
    }

    if (addressData.uses === true) {
      appendOutput(
        `Warning: Connecting to phrase '${phrase}' which is marked as 'used'. Maddr: ${maddrString}`,
      );
      // If API returns 200 OK but "uses:true", you might still want to connect.
      // The Go API as designed previously would return 409 if "uses:true",
      // so this specific path (200 OK + uses:true) might not occur with that Go code.
      // This is a safeguard if the API logic changes.
    }

    // 3. Set the multiaddr and attempt to connect using libp2p
    ma = multiaddr(maddrString); // `ma` is the global variable
    appendOutput(
      `Retrieved multiaddr: '${ma.toString()}' for phrase '${phrase}'.`,
    );
    appendOutput(`Attempting to connect to peer...`);

    const signal = AbortSignal.timeout(10000); // Increased timeout for potentially slower WebRTC negotiation

    try {
      if (isWebrtc(ma)) {
        appendOutput(`Pinging WebRTC peer '${ma.toString()}'...`);
        const rtt = await node.services.ping.ping(ma, { signal });
        appendOutput(`Ping successful to '${ma.toString()}'! RTT: ${rtt}ms`);
        // To ensure the connection is listed and send section appears,
        // we might need to explicitly dial even for WebRTC
        // if ping alone doesn't keep the connection open for `updateConnList`.
        // For many libp2p examples, ping implies connect-ability.
        // A full dial might be needed if `updateConnList` doesn't reflect the connection.
        appendOutput(
          `Attempting to establish persistent connection to '${ma.toString()}'...`,
        );
        await node.dial(ma, { signal }); // Establish persistent connection
        appendOutput(`Connection established to '${ma.toString()}'.`);
      } else {
        appendOutput(`Dialing non-WebRTC peer '${ma.toString()}'...`);
        await node.dial(ma, { signal });
        appendOutput(`Connected to '${ma.toString()}'.`);
      }
      // The 'connection:open' event handler (updateConnList) should manage UI updates like sendSection visibility
    } catch (err) {
      if (signal.aborted) {
        appendOutput(`Timed out connecting to '${ma.toString()}'.`);
      } else {
        appendOutput(
          `Error connecting to '${ma.toString()}': ${err.message || err}`,
        );
      }
    }
  } catch (error) {
    // This catches errors from the fetch call itself (e.g., API server down, network issues)
    appendOutput(
      `Network or API error while looking up phrase '${phrase}': ${error.message || error}`,
    );
  }
};

window.send.onclick = async () => {
  if (chatStream == null) {
    appendOutput("Opening chat stream");

    const signal = AbortSignal.timeout(5000);

    try {
      const stream = await node.dialProtocol(ma, CHAT_PROTOCOL, {
        signal,
      });
      chatStream = byteStream(stream);

      Promise.resolve().then(async () => {
        while (true) {
          const buf = await chatStream.read();
          appendOutput(`Received message '${toString(buf.subarray())}'`);
        }
      });
    } catch (err) {
      if (signal.aborted) {
        appendOutput("Timed out opening chat stream");
      } else {
        appendOutput(`Opening chat stream failed - ${err.message}`);
      }

      return;
    }
  }

  const message = window.message.value.toString().trim();
  appendOutput(`Sending message '${message}'`);
  chatStream.write(fromString(message)).catch((err) => {
    appendOutput(`Error sending message - ${err.message}`);
  });
};
