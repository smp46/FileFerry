const DEBUG_ENABLED = true;

import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { identify, identifyPush } from '@libp2p/identify';
import { ping } from '@libp2p/ping';
import { webRTC } from '@libp2p/webrtc';
import { webSockets } from '@libp2p/websockets';
import * as filters from '@libp2p/websockets/filters';
import { multiaddr } from '@multiformats/multiaddr';
import { createLibp2p } from 'libp2p';
import { Uint8ArrayList } from 'uint8arraylist';
import * as DashPhraseModule from 'dashphrase';

const output = document.getElementById('output');
const outputSend = document.getElementById('outputSend');
const outputReceive = document.getElementById('outputReceive');

const appendOutput = (line, _targetElement) => {
  if (DEBUG_ENABLED) {
    console.log(line);
  }
};

let localPeerMultiaddrs = [];

const VITE_RELAY_MADDR = import.meta.env.VITE_RELAY_MADDR;
const VITE_PHRASEBOOK_API_URL = import.meta.env.VITE_PHRASEBOOK_API_URL;

let node;
let relayPeerIdStr = null;
const FILE_TRANSFER_PROTOCOL = '/fileferry/filetransfer/1.0.0';

let currentSenderPhrase = '';
let selectedFile = null; // To store the file selected by the sender via drag-drop

let activePeerId = null; // PeerId of the currently connected peer (sender or receiver)
let activeStream = null; // The active stream for file transfer

// Flags to manage UI and logic flow
let isSenderMode = false; // Is the current instance acting as a sender?
let isReceiverMode = false; // Is the current instance acting as a receiver?

let fileTransferInitiated = false;

function getCircuitAddress(libp2pNode, timeout = 30000) {
  return new Promise((resolve, reject) => {
    let timer;
    const listener = () => {
      const multiaddrs = libp2pNode.getMultiaddrs();
      const circuitAddr = multiaddrs.find((ma) =>
        ma.toString().includes('/p2p-circuit'),
      );
      if (circuitAddr) {
        libp2pNode.removeEventListener('self:peer:update', listener);
        clearTimeout(timer);
        resolve(circuitAddr);
      }
    };

    const initialCircuitAddr = libp2pNode
      .getMultiaddrs()
      .find((ma) => ma.toString().includes('/p2p-circuit'));
    if (initialCircuitAddr) {
      resolve(initialCircuitAddr);
      return;
    }

    timer = setTimeout(() => {
      libp2pNode.removeEventListener('self:peer:update', listener);
      reject(
        new Error('Timeout: Could not obtain a circuit address via relay.'),
      );
    }, timeout);

    libp2pNode.addEventListener('self:peer:update', listener);
  });
}

async function getClosestStunServer() {
  const GEO_LOC_URL =
    'https://raw.githubusercontent.com/pradt2/always-online-stun/master/geoip_cache.txt';
  const IPV4_URL =
    'https://raw.githubusercontent.com/pradt2/always-online-stun/master/valid_ipv4s.txt';
  const GEO_USER_URL = 'https://geolocation-db.com/json/';
  const geoLocs = await (await fetch(GEO_LOC_URL)).json();
  const { latitude, longitude } = await (await fetch(GEO_USER_URL)).json();
  const closestAddr = (await (await fetch(IPV4_URL)).text())
    .trim()
    .split('\n')
    .map((addr) => {
      const [stunLat, stunLon] = geoLocs[addr.split(':')[0]];
      const dist =
        ((latitude - stunLat) ** 2 + (longitude - stunLon) ** 2) ** 0.5;
      return [addr, dist];
    })
    .reduce(([addrA, distA], [addrB, distB]) =>
      distA <= distB ? [addrA, distA] : [addrB, distB],
    )[0];
  appendOutput('Closest STUN server found: ' + closestAddr, output);
  return closestAddr;
}

async function main() {
  // const c = await getClosestStunServer().catch((err) => {
  //   appendOutput('Could not fetch closest STUN server: ' + err.message, output);
  // });
  node = await createLibp2p({
    addresses: {
      listen: ['/p2p-circuit', '/webrtc'],
    },
    transports: [
      webSockets({ filter: filters.all }),
      webRTC({
        rtcConfiguration: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun.nextcloud.com:443' },
            {
              urls: 'turn:195.114.14.137:3478?transport=udp',
              username: 'ferryCaptain',
              credential: 'i^YV13eTPOHdVzWm#2t5',
            },
            {
              urls: 'turn:195.114.14.137:3478?transport=tcp',
              username: 'ferryCaptain', // Yes I am aware this is plaintext
              credential: 'i^YV13eTPOHdVzWm#2t5',
            },
          ],
        },
      }),
      circuitRelayTransport({
        discoverRelays: 0,
      }),
    ],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    connectionGater: {
      denyDialMultiaddr: () => false,
    },
    services: {
      identify: identify(),
      identifyPush: identifyPush(),
      ping: ping(),
    },
    connectionManager: {
      maxConnections: Infinity,
      minConnections: 0,
      pollInterval: 5000,
    },
  });

  await node.start();
  appendOutput(`Node started with Peer ID: ${node.peerId.toString()}`, output);
  localPeerMultiaddrs = node.getMultiaddrs().map((ma) => ma.toString());
  appendOutput('My addresses:', output);
  localPeerMultiaddrs.forEach((addr) => appendOutput(`  - ${addr}`, output));

  if (VITE_RELAY_MADDR) {
    try {
      relayPeerIdStr = multiaddr(VITE_RELAY_MADDR).getPeerId();
    } catch (e) {
      appendOutput(
        `Warning: Could not parse Peer ID from VITE_RELAY_MADDR: ${VITE_RELAY_MADDR}.`,
        output,
      );
      console.warn('Error parsing relay PeerID:', e);
    }
  }

  // Event listener for when a connection opens
  node.addEventListener('connection:open', async (event) => {
    const connection = event.detail;
    const remotePeerId = connection.remotePeer;
    const remotePeerIdStr = remotePeerId.toString();
    const remoteAddr = connection.remoteAddr.toString();
    const remoteAddrStr = connection.remoteAddr.toString();
    const targetOutput = isSenderMode ? outputSend : outputReceive;

    appendOutput(
      `Connection OPENED with: ${remotePeerIdStr} on ${remoteAddr}`,
      targetOutput,
    );

    if (remotePeerIdStr === relayPeerIdStr) {
      appendOutput(
        'INFO: Connection to the relay server confirmed.',
        targetOutput,
      );
      if (isSenderMode && !activePeerId) {
        try {
          const senderCircuitAddress = await getCircuitAddress(node);
          appendOutput(
            `Obtained listen address: ${senderCircuitAddress.toString()}`,
            outputSend,
          );
          appendOutput(
            `Registering passphrase '${currentSenderPhrase}'...`,
            outputSend,
          );

          const apiUrl = `${VITE_PHRASEBOOK_API_URL}/phrase`;
          const response = await fetch(apiUrl, {
            method: 'POST',
            body: JSON.stringify({
              Maddr: senderCircuitAddress.toString(),
              Phrase: currentSenderPhrase,
            }),
            headers: { 'Content-type': 'application/json; charset=UTF-8' },
          });

          if (response.ok) {
            appendOutput(
              'Passphrase registered. Waiting for peer to connect...',
              outputSend,
            );
          } else {
            const errorText = await response.text();
            appendOutput(
              `Failed to register passphrase. Status: ${response.status}. Error: ${errorText}`,
              outputSend,
            );
            isSenderMode = false;
          }
        } catch (err) {
          appendOutput(
            `Error during sender setup after relay connect: ${err.message}`,
            outputSend,
          );
          isSenderMode = false;
        }
      }
      return;
    }

    // If it's not the relay, it's a peer
    if (!activePeerId || activePeerId.toString() !== remotePeerIdStr) {
      appendOutput(
        `Peer connected: ${remotePeerIdStr}. Old activePeerId: ${activePeerId?.toString()}`,
        targetOutput,
      );
      activePeerId = remotePeerId;
    } else {
      appendOutput(
        `Re-established or additional connection to existing peer: ${remotePeerIdStr}`,
        targetOutput,
      );
    }

    if (
      isSenderMode &&
      activePeerId &&
      activePeerId.toString() === remotePeerIdStr &&
      selectedFile &&
      !fileTransferInitiated
    ) {
      if (
        remoteAddrStr.includes('/webrtc') &&
        !remoteAddrStr.includes('/p2p-circuit')
      ) {
        fileTransferInitiated = true;
        appendOutput(
          `Sender: Direct WebRTC connection to Peer ${activePeerId.toString()} active. Attempting file transfer.`,
          outputSend,
        );
        try {
          document.getElementById('fileInfoArea').style.display = 'none';
          document.getElementById('loadingIndicator').style.display = 'block';
          const stream = await node.dialProtocol(
            activePeerId,
            FILE_TRANSFER_PROTOCOL,
            {
              signal: AbortSignal.timeout(10000),
            },
          );
          // const rtt = await node.services.ping.ping(activePeerId);
          // appendOutput(
          //   'Successfully pinged peer: ' +
          //     activePeerId.toString() +
          //     ' with RTT: ' +
          //     rtt +
          //     'ms',
          //   targetOutput,
          // );
          activeStream = stream;
          appendOutput(
            'File transfer stream opened to peer (via WebRTC).',
            outputSend,
          );

          appendOutput(
            `Sending file '${selectedFile.name}' (${selectedFile.size} bytes)...`,
            outputSend,
          );

          const header = JSON.stringify({
            name: selectedFile.name,
            size: selectedFile.size,
          });
          const encodedHeader = new TextEncoder().encode(header + '\n');
          const array = await getByteArray(selectedFile);
          const arrayWithHeader = new Uint8ArrayList();
          arrayWithHeader.append(encodedHeader);
          arrayWithHeader.append(array);

          await activeStream.sink(arrayWithHeader);

          appendOutput('Finished sending file data.', outputSend);
          await activeStream.closeWrite();
          appendOutput(
            'File sent completely. Closed stream for writing.',
            outputSend,
          );
          selectedFile = null;
          activeStream = null;
          fileTransferInitiated = false;
          isSenderMode = false;

          document.getElementById('loadingIndicator').style.display = 'none';
          document.getElementById('completionMessage').style.display = 'block';
        } catch (err) {
          appendOutput(
            `Opening/writing file transfer stream to peer failed: ${err.message}`,
            outputSend,
          );
          console.error('DialProtocol/Stream error (Sender):', err); // This console.error remains
          activeStream = null;
          document.getElementById('loadingIndicator').style.display = 'none';
          document.getElementById('errorMessage').style.display = 'block';
        }
      } else if (remoteAddrStr.includes('/p2p-circuit')) {
        appendOutput(
          `Sender: Relayed connection to Peer ${activePeerId.toString()} established (${remoteAddrStr}). Waiting for potential direct WebRTC upgrade before transferring.`,
          outputSend,
        );
      } else {
        appendOutput(
          `Sender: Peer connection via other transport (${remoteAddrStr}). File transfer logic currently prioritizes direct WebRTC.`,
          outputSend,
        );
      }
    } else if (
      isReceiverMode &&
      activePeerId &&
      activePeerId.toString() === remotePeerIdStr
    ) {
      appendOutput(
        `Receiver: Connected to sender peer (${remoteAddrStr}). Waiting for incoming file stream.`,
        outputReceive,
      );
    } else if (
      isSenderMode &&
      activePeerId &&
      selectedFile &&
      fileTransferInitiated &&
      activeStream
    ) {
      appendOutput(
        `Sender: File transfer already initiated for ${selectedFile.name}. Current stream active.`,
        outputSend,
      );
    }
  });

  // Event listener for when a connection closes
  node.addEventListener('connection:close', (event) => {
    const remotePeerIdStr = event.detail.remotePeer.toString();
    const targetOutput = isSenderMode ? outputSend : outputReceive;
    appendOutput(`Connection CLOSED with: ${remotePeerIdStr}`, targetOutput);

    if (activePeerId && remotePeerIdStr === activePeerId.toString()) {
      appendOutput('Active peer connection closed.', targetOutput);
      activePeerId = null;
      activeStream = null;
    } else if (remotePeerIdStr === relayPeerIdStr) {
      appendOutput('Connection to relay closed.', targetOutput);
    }
  });

  node.addEventListener('self:peer:update', () => {
    localPeerMultiaddrs = node.getMultiaddrs().map((ma) => ma.toString());
  });

  node.handle(FILE_TRANSFER_PROTOCOL, async ({ stream, connection }) => {
    const targetOutput = outputReceive;
    appendOutput(
      `Incoming file transfer stream from ${connection.remotePeer.toString()}`,
      targetOutput,
    );

    if (activeStream && activeStream !== stream) {
      appendOutput(
        'Warning: A new stream is replacing an existing activeStream in receiver.',
        targetOutput,
      );
      try {
        if (activeStream.close) await activeStream.close();
      } catch (_) {
        /*ignore*/
      }
    }
    activeStream = stream;

    if (!isReceiverMode) {
      isReceiverMode = true;
      appendOutput(
        'Switched to Receiver mode due to incoming stream.',
        targetOutput,
      );
    }
    activePeerId = connection.remotePeer;

    document.getElementById('initialReceiveUI').style.display = 'none';
    document.getElementById('receivingLoadingIndicator').style.display =
      'block';

    let receivedFileBuffer = [];
    let fileNameFromHeader = 'downloaded_file';
    let fileSizeFromHeader = 0;
    let fileTypeFromHeader = 'application/octet-stream';
    let headerReceived = false;
    let receivedBytesTotal = 0;

    try {
      for await (const ualistChunk of activeStream.source) {
        if (!ualistChunk || ualistChunk.length === 0) {
          appendOutput('Received an empty or null chunk.', targetOutput);
          continue;
        }

        const dataChunk = ualistChunk.subarray();

        if (!headerReceived) {
          let headerJsonString = '';
          let bodyStartIndex = 0;

          try {
            const potentialHeaderText = new TextDecoder('utf-8', {
              fatal: false,
            }).decode(dataChunk);
            const newlineIndex = potentialHeaderText.indexOf('\n');

            if (newlineIndex !== -1) {
              headerJsonString = potentialHeaderText.substring(0, newlineIndex);
              const encodedHeaderWithNewlineLength = new TextEncoder().encode(
                headerJsonString + '\n',
              ).byteLength;
              bodyStartIndex = encodedHeaderWithNewlineLength;

              try {
                const parsedHeaderObject = JSON.parse(headerJsonString);
                fileNameFromHeader =
                  parsedHeaderObject.name || fileNameFromHeader;
                fileSizeFromHeader =
                  parsedHeaderObject.size || fileSizeFromHeader;
                fileTypeFromHeader =
                  parsedHeaderObject.type || fileTypeFromHeader;

                appendOutput(
                  `Receiving file: ${fileNameFromHeader} (Size: ${fileSizeFromHeader} bytes, Type: ${fileTypeFromHeader})`,
                  targetOutput,
                );
                headerReceived = true;
              } catch (e) {
                appendOutput(
                  `Could not parse file header JSON: "${headerJsonString}". Error: ${e.message}. Treating chunk as data.`,
                  targetOutput,
                );
                headerReceived = true;
                bodyStartIndex = 0;
              }
            } else {
              appendOutput(
                'No newline for header in this chunk. Assuming no header or all data.',
                targetOutput,
              );
              headerReceived = true;
              bodyStartIndex = 0;
            }
          } catch (decodeError) {
            appendOutput(
              `Error decoding chunk for header: ${decodeError.message}. Treating as raw data.`,
              targetOutput,
            );
            headerReceived = true;
            bodyStartIndex = 0;
          }

          // Process the remainder of the current chunk (if any) after the header
          if (bodyStartIndex < dataChunk.byteLength) {
            const actualBodyData = dataChunk.subarray(bodyStartIndex);
            if (actualBodyData.length > 0) {
              receivedFileBuffer.push(actualBodyData);
              receivedBytesTotal += actualBodyData.length;
              appendOutput(
                `Received ${receivedBytesTotal} bytes (from first chunk's body)...`,
                targetOutput,
              );
            }
          }
        } else {
          // Header has already been processed, this entire chunk is file data
          receivedFileBuffer.push(dataChunk);
          receivedBytesTotal += dataChunk.length;
          appendOutput(
            `Received ${receivedBytesTotal} bytes... (Expected: ${fileSizeFromHeader > 0 ? fileSizeFromHeader : 'N/A'})`,
            targetOutput,
          );
        }
      }
      appendOutput(
        `File stream source ended. Total bytes received in buffer: ${receivedBytesTotal}`,
        targetOutput,
      );

      if (receivedBytesTotal > 0) {
        const completeFileBlob = new Blob(receivedFileBuffer, {
          type: fileTypeFromHeader,
        });

        const downloadUrl = URL.createObjectURL(completeFileBlob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = fileNameFromHeader;
        const fileSizeMb = `${(receivedBytesTotal / 1024 / 1024).toFixed(2)}`;
        a.textContent = `Download ${fileSizeMb} MB)`;
        a.style.display = 'hidden';

        document.getElementById('receivingLoadingIndicator').style.display =
          'none';
        document.getElementById('receivedFileName').innerText =
          fileNameFromHeader;
        document.getElementById('receivedFileSize').innerText =
          `${fileSizeMb} MB`;
        document.getElementById('downloadReadyMessage').style.display = 'block';

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        appendOutput(
          'No data received in file buffer. Download will be empty.',
          targetOutput,
        );

        document.getElementById('receivingLoadingIndicator').style.display =
          'none';
        document.getElementById('receiveErrorMessage').style.display = 'block';
      }
    } catch (err) {
      appendOutput(
        `Error reading from file stream: ${err.message}`,
        targetOutput,
      );

      document.getElementById('receivingLoadingIndicator').style.display =
        'none';
      document.getElementById('receiveErrorMessage').style.display = 'block';
      console.error('Stream read error (Receiver):', err);
    } finally {
      appendOutput('Closing incoming file stream processing.', targetOutput);
      if (activeStream) {
        try {
          if (typeof activeStream.close === 'function') {
            await activeStream.close();
          } else if (typeof activeStream.abort === 'function') {
            await activeStream.abort();
          }
        } catch (e) {
          console.warn('Error closing stream on receiver:', e);
        }
      }
      activeStream = null;
    }
  });
}
function dragOverHandler(ev) {
  ev.preventDefault();
}

function dropHandler(ev) {
  ev.preventDefault();

  if (ev.dataTransfer.items) {
    const item = [...ev.dataTransfer.items].find(
      (item) => item.kind === 'file',
    );
    if (item) selectedFile = item.getAsFile();
  } else if (ev.dataTransfer.files && ev.dataTransfer.files.length > 0) {
    selectedFile = ev.dataTransfer.files[0];
  }

  if (selectedFile) {
    appendOutput(
      `Selected file: ${selectedFile.name} (Size: ${selectedFile.size} bytes)`,
      outputSend,
    );
    document.getElementById('fileNameDisplay').textContent = selectedFile.name;
    document.getElementById('fileSizeDisplay').textContent =
      `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB`;

    window.actions.startSendProcess();
  } else {
    appendOutput('No file selected from drop.', outputSend);
  }
}

function copyPhrase() {
  var copyText = document.getElementById('generatedPhraseDisplay');
  navigator.clipboard.writeText(copyText.innerText);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('phraseInput').value = '';

  const dropZone = document.getElementById('drop_zone');
  dropZone.addEventListener('dragover', dragOverHandler);
  dropZone.addEventListener('drop', dropHandler);

  const filePicker = document.getElementById('fileInput');

  filePicker.addEventListener('change', (event) => {
    if (event.target.files && event.target.files[0]) {
      var file = event.target.files[0];

      var reader = new FileReader();
      reader.readAsDataURL(file);

      reader.onload = (readerEvent) => {
        file = readerEvent.target.result;
      };

      reader.onerror = (error) => {
        console.error('FileReader error: ', error);
      };

      selectedFile = file;
      document.getElementById('fileNameDisplay').textContent =
        selectedFile.name;
      document.getElementById('fileSizeDisplay').textContent =
        `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB`;
      window.actions.startSendProcess();
    } else {
      console.log('No file selected.');
    }
  });

  const copyButton = document.getElementById('copyPhraseButton');
  copyButton.addEventListener('click', copyPhrase);

  appendOutput('handlers attached.', output);

  const receiveModeButton = document.getElementById('receiveModeButton');

  receiveModeButton.onclick = window.actions.startReceiveProcess;
});

window.actions = {
  startSendProcess: async () => {
    if (!node) {
      appendOutput('Libp2p node not initialized yet.', outputSend);
      return;
    }
    if (!VITE_RELAY_MADDR) {
      appendOutput('Relay address not configured.', outputSend);
      return;
    }
    if (!selectedFile) {
      appendOutput('Please select a file to send first.', outputSend);
      return;
    }

    isSenderMode = true;
    isReceiverMode = false;
    if (outputSend) outputSend.innerHTML = '';
    appendOutput('Sender Mode Activated. Generating passphrase...', outputSend);

    const randWords = await DashPhraseModule.default.generate(16);
    const randomNumber = Math.floor(Math.random() * 100) + 1;
    currentSenderPhrase = [randomNumber, ...randWords.split(' ')].join('-');

    document.getElementById('generatedPhraseDisplay').textContent =
      currentSenderPhrase;
    appendOutput(`Your passphrase: ${currentSenderPhrase}`, outputSend);
    appendOutput(
      `Attempting to connect to relay: ${VITE_RELAY_MADDR}...`,
      outputSend,
    );

    document.getElementById('initialDropUI').style.display = 'none';
    document.getElementById('fileInfoArea').style.display = 'block';

    const relayMa = multiaddr(VITE_RELAY_MADDR);
    try {
      await node.dial(relayMa, { signal: AbortSignal.timeout(5000) });
      appendOutput(
        'Dialing relay initiated. Waiting for connection...',
        outputSend,
      );
    } catch (err) {
      appendOutput(`Error dialing relay: ${err.message || err}`, outputSend);
      console.error('Relay dial error:', err);
      isSenderMode = false;
    }
  },

  startReceiveProcess: async () => {
    if (!node) {
      appendOutput('Libp2p node not initialized yet.', outputReceive);
      return;
    }

    isReceiverMode = true;
    isSenderMode = false;
    if (outputReceive) outputReceive.innerHTML = '';
    appendOutput(
      'Receiver Mode Activated. Enter passphrase to connect.',
      outputReceive,
    );

    const phraseInput = document.getElementById('phraseInput');
    const phraseValue = phraseInput.value.trim();

    if (!phraseValue) {
      appendOutput('Please enter a phrase to lookup.', outputReceive);
      isReceiverMode = false;
      return;
    }

    appendOutput(`Looking up passphrase '${phraseValue}'...`, outputReceive);

    try {
      const apiUrl = `${VITE_PHRASEBOOK_API_URL}/phrase/${encodeURIComponent(phraseValue)}`;
      const response = await fetch(apiUrl);

      if (!response.ok) {
        let apiErrorMessage = `Failed to lookup phrase '${phraseValue}'. Status: ${response.status}`;
        try {
          const errorData = await response.json();
          apiErrorMessage += ` - ${errorData.message || response.statusText}`;
        } catch (_) {
          apiErrorMessage += ` - ${response.statusText}`; // Fallback if error response is not JSON
        }
        appendOutput(apiErrorMessage, outputReceive);
        isReceiverMode = false;
        return;
      }

      const addressData = await response.json();
      const maddrString = addressData.maddr;

      if (!maddrString) {
        appendOutput(
          `Phrase found, but no multiaddress provided.`,
          outputReceive,
        );
        isReceiverMode = false;
        return;
      }

      const peerMa = multiaddr(maddrString);
      appendOutput(
        `Retrieved sender address: '${peerMa.toString()}'. Attempting to connect...`,
        outputReceive,
      );

      await node.dial(peerMa, { signal: AbortSignal.timeout(10000) });
      appendOutput(
        'Dialing sender initiated. Waiting for connection...',
        outputReceive,
      );
    } catch (error) {
      appendOutput(
        `Error in receive process: ${error.message || error}`,
        outputReceive,
      );
      console.error('Receive process error:', error);
      isReceiverMode = false;
    }
  },
};

main().catch((err) => {
  console.error('Failed to initialize libp2p node:', err);
  appendOutput(
    `Critical Error: Failed to initialize libp2p node - ${err.message}`,
    output, // Main output div
  );
});

function getByteArray(file) {
  return new Promise(function (resolve, reject) {
    let fileReader = new FileReader();
    fileReader.readAsArrayBuffer(file);
    fileReader.onload = function (ev) {
      const array = new Uint8Array(ev.target.result);
      resolve(array);
    };
    fileReader.onerror = reject;
  });
}
