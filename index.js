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

const log = (line, _targetElement) => {
  if (DEBUG_ENABLED) {
    console.log(line);
  }
};

let localPeerMultiaddrs = [];

const VITE_RELAY_MADDR =
  '/dns4/relay.smp46.me/tcp/443/tls/ws/p2p/12D3KooWPUXghsjtba2yaKbxJAPUpCgZ1UzciEdCPzohBQi7wiPg';
const VITE_PHRASEBOOK_API_URL = 'https://exchange.smp46.me';

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

let fileTransferring = false;

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
  const HOST_URL =
    'https://raw.githubusercontent.com/pradt2/always-online-stun/master/valid_hosts.txt';
  const GEO_USER_URL = 'https://ip-api.com/json/';
  const USER_GEO_CACHE_KEY = 'userGeoData';
  const CACHE_DURATION_MS = 48 * 60 * 60 * 1000; // 48 hours in milliseconds

  let userData;

  try {
    const geoLocs = await (await fetch(GEO_LOC_URL)).json();
    const cachedUserGeo = localStorage.getItem(USER_GEO_CACHE_KEY);
    if (cachedUserGeo) {
      const parsedCache = JSON.parse(cachedUserGeo);
      if (parsedCache.expiry && parsedCache.expiry > Date.now()) {
        userData = parsedCache.data;
        log('Using cached user geo data.');
      } else {
        localStorage.removeItem(USER_GEO_CACHE_KEY);
        log('User geo cache expired or invalid.');
      }
    }

    if (!userData) {
      log('Fetching user geo data from API.');
      const geoUserResponse = await fetch(GEO_USER_URL);
      if (!geoUserResponse.ok) {
        throw new Error(
          `Failed to fetch user geo data: ${geoUserResponse.status} ${geoUserResponse.statusText}`,
        );
      }
      userData = await geoUserResponse.json();

      const cacheEntry = {
        data: userData,
        expiry: Date.now() + CACHE_DURATION_MS,
      };
      localStorage.setItem(USER_GEO_CACHE_KEY, JSON.stringify(cacheEntry));
      log('User geo data fetched and cached.');
    }

    const latitude = userData.lat;
    const longitude = userData.lon;
    const hostListResponse = await fetch(HOST_URL);
    const hostListText = await hostListResponse.text();

    const closestAddr = hostListText
      .trim()
      .split('\n')
      .map((addr) => {
        const serverIp = addr.split(':')[0];
        if (!geoLocs[serverIp]) {
          return [addr, Infinity];
        }
        const [stunLat, stunLon] = geoLocs[serverIp];
        if (typeof stunLat !== 'number' || typeof stunLon !== 'number') {
          return [addr, Infinity];
        }
        const dist =
          ((latitude - stunLat) ** 2 + (longitude - stunLon) ** 2) ** 0.5;
        return [addr, dist];
      })
      .reduce(([addrA, distA], [addrB, distB]) =>
        distA <= distB ? [addrA, distA] : [addrB, distB],
      )[0];

    log('Closest STUN server found: ' + closestAddr, output);
    return closestAddr;
  } catch (error) {
    log('Error in getClosestStunServer:', error);
    localStorage.removeItem(USER_GEO_CACHE_KEY);
    return undefined;
  }
}

async function main() {
  let errorMessage = '';
  const closestStunServer = await getClosestStunServer().catch((err) => {
    log('Could not fetch closest STUN server: ' + err.message, output);
  });
  const stunServer =
    closestStunServer != undefined
      ? `stun:${closestStunServer}`
      : 'stun:l.google.com:19302';

  node = await createLibp2p({
    addresses: {
      listen: ['/p2p-circuit', '/webrtc'],
    },
    transports: [
      webSockets({ filter: filters.all }),
      webRTC({
        rtcConfiguration: {
          iceServers: [
            {
              urls: stunServer,
            },
            {
              urls: 'turn:relay.smp46.me:3478?transport=udp',
              username: 'ferryCaptain',
              credential: 'i^YV13eTPOHdVzWm#2t5',
            },
            {
              urls: 'turn:relay.smp46.me:3478?transport=tcp',
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
  log(`Node started with Peer ID: ${node.peerId.toString()}`, output);
  localPeerMultiaddrs = node.getMultiaddrs().map((ma) => ma.toString());
  log('My addresses:', output);
  localPeerMultiaddrs.forEach((addr) => log(`  - ${addr}`, output));

  if (VITE_RELAY_MADDR) {
    try {
      relayPeerIdStr = multiaddr(VITE_RELAY_MADDR).getPeerId();
    } catch (e) {
      log(
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

    let errorMessage = '';

    log(
      `Connection OPENED with: ${remotePeerIdStr} on ${remoteAddr}`,
      targetOutput,
    );

    if (remotePeerIdStr === relayPeerIdStr) {
      log('INFO: Connection to the relay server confirmed.', targetOutput);
      if (isSenderMode && !activePeerId) {
        try {
          const senderCircuitAddress = await getCircuitAddress(node);
          log(
            `Obtained listen address: ${senderCircuitAddress.toString()}`,
            outputSend,
          );
          log(`Registering passphrase '${currentSenderPhrase}'...`, outputSend);

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
            log(
              'Passphrase registered. Waiting for peer to connect...',
              outputSend,
            );
          } else {
            const errorText =
              await `Failed to register passphrase. Status: ${response.status}. Error: ${await response.text()}`;
            log(errorText, outputSend);
            errorMessage = errorText;
            isSenderMode = false;
          }
        } catch (err) {
          const errorText = `Error during sender setup after relay connect: ${err.message}`;
          log(errorText, outputSend);
          errorMessage = errorText;
          isSenderMode = false;
        }
      }
      if (errorMessage != '') {
        showErrorPopup(errorMessage);
        errorMessage = '';
      }
      return;
    }

    // If it's not the relay, it's a peer
    if (!activePeerId || activePeerId.toString() !== remotePeerIdStr) {
      log(
        `Peer connected: ${remotePeerIdStr}. Old activePeerId: ${activePeerId?.toString()}`,
        targetOutput,
      );
      activePeerId = remotePeerId;
    } else {
      log(
        `Re-established or additional cohttps://fileferry.smp46.me/nnection to existing peer: ${remotePeerIdStr}`,
        targetOutput,
      );
    }

    if (
      isSenderMode &&
      activePeerId &&
      activePeerId.toString() === remotePeerIdStr &&
      selectedFile &&
      !fileTransferring
    ) {
      if (
        remoteAddrStr.includes('/webrtc') &&
        !remoteAddrStr.includes('/p2p-circuit')
      ) {
        log(
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
          const rtt = await node.services.ping.ping(activePeerId);
          log(
            'Successfully pinged peer: ' +
              activePeerId.toString() +
              ' with RTT: ' +
              rtt +
              'ms',
            targetOutput,
          );
          activeStream = stream;
          log('File transfer stream opened to peer (via WebRTC).', outputSend);

          log(
            `Sending file '${selectedFile.name}' (${selectedFile.size} bytes)...`,
            outputSend,
          );

          fileTransferring = true;

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

          log('Finished sending file data.', outputSend);
          await activeStream.closeWrite();
          log('File sent completely. Closed stream for writing.', outputSend);
          selectedFile = null;
          activeStream = null;
          fileTransferring = false;
          isSenderMode = false;

          document.getElementById('loadingIndicator').style.display = 'none';
          document.getElementById('completionMessage').style.display = 'block';
        } catch (err) {
          errorMessage = `Opening/writing file transfer stream to peer failed: ${err.message}`;
          log(errorMessage, outputSend);
          activeStream = null;
        }
      } else if (remoteAddrStr.includes('/p2p-circuit')) {
        log(
          `Sender: Relayed connection to Peer ${activePeerId.toString()} established (${remoteAddrStr}). Waiting for potential direct WebRTC upgrade before transferring.`,
          outputSend,
        );
      } else {
        log(
          `Sender: Peer connection via other transport (${remoteAddrStr}). File transfer logic currently prioritizes direct WebRTC.`,
          outputSend,
        );
      }
    } else if (
      isReceiverMode &&
      activePeerId &&
      activePeerId.toString() === remotePeerIdStr
    ) {
      log(
        `Receiver: Connected to sender peer (${remoteAddrStr}). Waiting for incoming file stream.`,
        outputReceive,
      );
    } else if (
      isSenderMode &&
      activePeerId &&
      selectedFile &&
      fileTransferring &&
      activeStream
    ) {
      log(
        `Sender: File transfer already initiated for ${selectedFile.name}. Current stream active.`,
        outputSend,
      );
    }

    if (errorMessage != '') {
      showErrorPopup(errorMessage);
      document.getElementById('loadingIndicator').style.display = 'none';
      document.getElementById('errorMessage').style.display = 'block';
      errorMessage = '';
    }
  });

  // Event listener for when a connection closes
  node.addEventListener('connection:close', (event) => {
    const remotePeerIdStr = event.detail.remotePeer.toString();
    const targetOutput = isSenderMode ? outputSend : outputReceive;
    log(`Connection CLOSED with: ${remotePeerIdStr}`, targetOutput);

    if (
      activePeerId &&
      remotePeerIdStr &&
      !fileTransferring === activePeerId.toString()
    ) {
      log('Active peer connection closed.', targetOutput);
      activePeerId = null;
      activeStream = null;
    } else if (remotePeerIdStr === relayPeerIdStr) {
      log('Connection to relay closed.', targetOutput);
    }
  });

  node.addEventListener('self:peer:update', () => {
    localPeerMultiaddrs = node.getMultiaddrs().map((ma) => ma.toString());
  });

  node.handle(FILE_TRANSFER_PROTOCOL, async ({ stream, connection }) => {
    const targetOutput = outputReceive;

    log(
      `Incoming file transfer stream from ${connection.remotePeer.toString()}`,
      targetOutput,
    );

    if (activeStream && activeStream !== stream) {
      log(
        'Warning: A new stream is replacing an existing activeStream in receiver.',
        targetOutput,
      );
    }
    activeStream = stream;
    activePeerId = connection.remotePeer;

    let receivedFileBuffer = [];
    let fileNameFromHeader = 'downloaded_file';
    let fileSizeFromHeader = 0;
    let fileTypeFromHeader = 'application/octet-stream';
    let headerReceived = false;
    let receivedBytesTotal = 0;

    try {
      for await (const ualistChunk of activeStream.source) {
        if (!ualistChunk || ualistChunk.length === 0) {
          log('Received an empty or null chunk.', targetOutput);
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

                log(
                  `Receiving file: ${fileNameFromHeader} (Size: ${fileSizeFromHeader} bytes, Type: ${fileTypeFromHeader})`,
                  targetOutput,
                );
                headerReceived = true;
              } catch (e) {
                log(
                  `Could not parse file header JSON: "${headerJsonString}". Error: ${e.message}. Treating chunk as data.`,
                  targetOutput,
                );
                headerReceived = true;
                bodyStartIndex = 0;
              }
            } else {
              log(
                'No newline for header in this chunk. Assuming no header or all data.',
                targetOutput,
              );
              headerReceived = true;
              bodyStartIndex = 0;
            }
          } catch (decodeError) {
            log(
              `Error decoding chunk for header: ${decodeError.message}. Treating as raw data.`,
              targetOutput,
            );
            headerReceived = true;
            bodyStartIndex = 0;
          }

          if (bodyStartIndex < dataChunk.byteLength) {
            const actualBodyData = dataChunk.subarray(bodyStartIndex);
            if (actualBodyData.length > 0) {
              receivedFileBuffer.push(actualBodyData);
              receivedBytesTotal += actualBodyData.length;
              log(
                `Received ${receivedBytesTotal} bytes (from first chunk's body)...`,
                targetOutput,
              );
            }
          }
        } else {
          receivedFileBuffer.push(dataChunk);
          receivedBytesTotal += dataChunk.length;
          log(
            `Received ${receivedBytesTotal} bytes... (Expected: ${fileSizeFromHeader > 0 ? fileSizeFromHeader : 'N/A'})`,
            targetOutput,
          );
        }
      }
      log(
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
        errorMessage =
          'No data received in file buffer. Download will be empty.';
        log(errorMessage, targetOutput);
      }
    } catch (err) {
      errorMessage = `Error reading from file stream: ${err.message}`;
      log(errorMessage, targetOutput);
    } finally {
      log('Closing incoming file stream processing.', targetOutput);
      if (activeStream) {
        try {
          if (typeof activeStream.close === 'function') {
            await activeStream.close();
          } else if (typeof activeStream.abort === 'function') {
            await activeStream.abort();
          }
        } catch (e) {
          errorMessage = `Error closing stream: ${e.message}`;
          log('Error closing stream on receiver:', e);
        }
      }
      activeStream = null;
    }
  });

  if (errorMessage != '') {
    log(errorMessage);
  }
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
    log(
      `Selected file: ${selectedFile.name} (Size: ${selectedFile.size} bytes)`,
      outputSend,
    );
    document.getElementById('fileNameDisplay').textContent = selectedFile.name;
    document.getElementById('fileSizeDisplay').textContent =
      `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB`;

    window.actions.startSendProcess();
  } else {
    log('No file selected from drop.', outputSend);
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

  log('handlers attached.', output);

  const receiveModeButton = document.getElementById('receiveModeButton');

  receiveModeButton.onclick = window.actions.startReceiveProcess;

  const errorWindow = document.getElementById('errorWindow');
  const errorMessageContainer = document.getElementById(
    'errorMessageContainer',
  );

  const closeErrorButton = document.getElementById('closeErrorButton');

  errorWindow.addEventListener('click', function (event) {
    if (event.target === errorWindow) {
      goHome();
      hideErrorPopup();
    }
  });

  errorMessageContainer.addEventListener('click', function (event) {
    event.stopPropagation();
  });

  closeErrorButton.addEventListener('click', function () {
    hideErrorPopup();
    goHome();
  });
});

window.actions = {
  startSendProcess: async () => {
    if (!node) {
      log('Libp2p node not initialized yet.', outputSend);
      return;
    }
    if (!VITE_RELAY_MADDR) {
      log('Relay address not configured.', outputSend);
      return;
    }
    if (!selectedFile) {
      log('Please select a file to send first.', outputSend);
      return;
    }

    isSenderMode = true;
    isReceiverMode = false;
    if (outputSend) outputSend.innerHTML = '';
    log('Sender Mode Activated. Generating passphrase...', outputSend);

    const randWords = await DashPhraseModule.default.generate(16);
    const randomNumber = Math.floor(Math.random() * 100) + 1;
    currentSenderPhrase = [randomNumber, ...randWords.split(' ')].join('-');

    document.getElementById('generatedPhraseDisplay').textContent =
      currentSenderPhrase;
    log(`Your passphrase: ${currentSenderPhrase}`, outputSend);
    log(`Attempting to connect to relay: ${VITE_RELAY_MADDR}...`, outputSend);

    document.getElementById('initialDropUI').style.display = 'none';
    document.getElementById('fileInfoArea').style.display = 'block';

    const relayMa = multiaddr(VITE_RELAY_MADDR);
    try {
      await node.dial(relayMa, { signal: AbortSignal.timeout(5000) });
      log('Dialing relay initiated. Waiting for connection...', outputSend);
    } catch (err) {
      log(`Error dialing relay: ${err.message || err}`, outputSend);
      console.error('Relay dial error:', err);
      isSenderMode = false;
    }
  },

  startReceiveProcess: async () => {
    if (!node) {
      log('Libp2p node not initialized yet.', outputReceive);
      return;
    }

    document.getElementById('initialReceiveUI').style.display = 'none';
    document.getElementById('receivingLoadingIndicator').style.display =
      'block';

    isReceiverMode = true;
    isSenderMode = false;
    if (outputReceive) outputReceive.innerHTML = '';
    log('Receiver Mode Activated. Enter passphrase to connect.', outputReceive);

    const phraseInput = document.getElementById('phraseInput');
    const phraseValue = phraseInput.value.trim();

    if (!phraseValue) {
      log('Please enter a phrase to lookup.', outputReceive);
      isReceiverMode = false;
      return;
    }

    log(`Looking up passphrase '${phraseValue}'...`, outputReceive);

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
        log(apiErrorMessage, outputReceive);
        isReceiverMode = false;
        return;
      }

      const addressData = await response.json();
      const maddrString = addressData.maddr;

      if (!maddrString) {
        log(`Phrase found, but no multiaddress provided.`, outputReceive);
        isReceiverMode = false;
        return;
      }

      const peerMa = multiaddr(maddrString);
      log(
        `Retrieved sender address: '${peerMa.toString()}'. Attempting to connect...`,
        outputReceive,
      );

      await node.dial(peerMa, { signal: AbortSignal.timeout(10000) });
      log('Dialing sender initiated. Waiting for connection...', outputReceive);
    } catch (error) {
      log(`Error in receive process: ${error.message || error}`, outputReceive);
      isReceiverMode = false;
    }
  },
};

main().catch((err) => {
  console.error('Failed to initialize libp2p node:', err);
  log(
    `Critical Error: Failed to initialize libp2p node - ${err.message}`,
    output,
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

function showErrorPopup(message) {
  document.getElementById('errorMessageText').textContent = message;
  document.getElementById('errorWindow').classList.remove('hidden');
}

function hideErrorPopup() {
  document.getElementById('errorWindow').classList.add('hidden');
}

function goHome() {
  document.getElementById('sendWindow').style.display = 'none';
  document.getElementById('receiveWindow').style.display = 'none';
  document.getElementById('returnButton').style.display = 'none';
  document.getElementById('goSendButton').style.display = 'flex';
  document.getElementById('goReceiveButton').style.display = 'flex';

  window.location.reload();
}

function goSend() {
  document.getElementById('returnButton').style.display = 'flex';
  document.getElementById('goSendButton').style.display = 'none';
  document.getElementById('goReceiveButton').style.display = 'none';
  document.getElementById('sendWindow').style.display = 'block';
  document.getElementById('receiveWindow').style.display = 'none';
}

function goReceive() {
  document.getElementById('returnButton').style.display = 'flex';
  document.getElementById('goSendButton').style.display = 'none';
  document.getElementById('goReceiveButton').style.display = 'none';
  document.getElementById('receiveWindow').style.display = 'block';
  document.getElementById('sendWindow').style.display = 'none';
}
