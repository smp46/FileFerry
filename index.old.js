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
let selectedFile = null;

let activePeerId = null;
let activeStream = null;
let activeConnections = new Map();

let isSenderMode = false;
let isReceiverMode = false;

let fileTransferring = false;

async function main() {
  const connectionUpgradeManager = new Map();
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

  node.addEventListener('connection:open', async (event) => {
    const connection = event.detail;
    const remotePeerId = connection.remotePeer;
    const remotePeerIdStr = remotePeerId.toString();
    const remoteAddr = connection.remoteAddr.toString();
    const targetOutput = isSenderMode ? outputSend : outputReceive;

    let errorMessage = '';

    if (!connectionUpgradeManager.has(remotePeerIdStr)) {
      connectionUpgradeManager.set(remotePeerIdStr, {
        relay: null,
        webrtc: null,
        upgrading: false,
      });
    }

    const connInfo = connectionUpgradeManager.get(remotePeerIdStr);

    if (connection.remoteAddr.toString().includes('/p2p-circuit')) {
      connInfo.relay = connection;
    } else if (connection.remoteAddr.toString().includes('/webrtc')) {
      connInfo.webrtc = connection;

      if (connInfo.relay && connInfo.webrtc) {
        setTimeout(() => {
          if (connInfo.webrtc.status === 'open') {
            connInfo.relay.close();
          }
        }, 5000);
      }
    }

    log(
      `Connection OPENED with: ${remotePeerIdStr} on ${remoteAddr}`,
      targetOutput,
    );

    activeConnections.set(remotePeerIdStr, connection);

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
            const errorText = `Failed to register passphrase. Status: ${response.status}. Error: ${await response.text()}`;
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

    if (!activePeerId || activePeerId.toString() !== remotePeerIdStr) {
      log(
        `Peer connected: ${remotePeerIdStr}. Old activePeerId: ${activePeerId?.toString()}`,
        targetOutput,
      );
      activePeerId = remotePeerId;
    } else {
      log(
        `Re-established or additional connection to existing peer: ${remotePeerIdStr}`,
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
        remoteAddr.includes('/webrtc') &&
        !remoteAddr.includes('/p2p-circuit')
      ) {
        log(
          `Sender: Direct WebRTC connection to Peer ${activePeerId.toString()} active. Attempting file transfer.`,
          outputSend,
        );

        try {
          document.getElementById('fileInfoArea').style.display = 'none';
          document.getElementById('loadingIndicator').style.display = 'block';

          const pingService = node.services.ping;
          const identifyPushService = node.services.identifyPush;

          // Stop services
          await pingService.stop();
          await identifyPushService.stop();

          const stream = await node.dialProtocol(
            activePeerId,
            FILE_TRANSFER_PROTOCOL,
            {
              signal: AbortSignal.timeout(30000),
              runOnTransientConnection: false,
            },
          );

          activeStream = stream;
          log('File transfer stream opened to peer (via WebRTC).', outputSend);

          log(
            `Sending file '${selectedFile.name}' (${selectedFile.size} bytes)...`,
            outputSend,
          );

          fileTransferring = true;

          await sendFileToStream(stream, selectedFile);

          log('File sent completely.', outputSend);
          selectedFile = null;
          activeStream = null;
          fileTransferring = false;
          isSenderMode = false;

          document.getElementById('loadingIndicator').style.display = 'none';
          document.getElementById('completionMessage').style.display = 'block';
        } catch (err) {
          errorMessage = `File transfer failed: ${err.message}`;
          log(errorMessage, outputSend);
          activeStream = null;
          fileTransferring = false;
          document.getElementById('loadingIndicator').style.display = 'none';
          document.getElementById('errorMessage').style.display = 'block';
        }
      } else if (remoteAddr.includes('/p2p-circuit')) {
        log(
          `Sender: Relayed connection to Peer ${activePeerId.toString()} established (${remoteAddr}). Waiting for potential direct WebRTC upgrade before transferring.`,
          outputSend,
        );
      } else {
        log(
          `Sender: Peer connection via other transport (${remoteAddr}). File transfer logic currently prioritizes direct WebRTC.`,
          outputSend,
        );
      }
    } else if (
      isReceiverMode &&
      activePeerId &&
      activePeerId.toString() === remotePeerIdStr
    ) {
      log(
        `Receiver: Connected to sender peer (${remoteAddr}). Waiting for incoming file stream.`,
        outputReceive,
      );
    }

    if (errorMessage != '') {
      showErrorPopup(errorMessage);
      errorMessage = '';
    }
  });

  node.addEventListener('connection:close', (event) => {
    const remotePeerIdStr = event.detail.remotePeer.toString();
    const targetOutput = isSenderMode ? outputSend : outputReceive;
    log(`Connection CLOSED with: ${remotePeerIdStr}`, targetOutput);

    activeConnections.delete(remotePeerIdStr);
  });

  node.handle(FILE_TRANSFER_PROTOCOL, async ({ stream, connection }) => {
    log(
      `Incoming file transfer stream from ${connection.remotePeer.toString()}`,
      outputReceive,
    );

    if (activeStream && activeStream !== stream) {
      log(
        'Warning: A new stream is replacing an existing activeStream in receiver.',
        outputReceive,
      );
    }
    const pingService = node.services.ping;
    const identifyPushService = node.services.identifyPush;

    // Stop services
    await pingService.stop();
    await identifyPushService.stop();

    activeStream = stream;
    activePeerId = connection.remotePeer;

    let receivedFileBuffer = [];
    let fileNameFromHeader = 'downloaded_file';
    let fileSizeFromHeader = 0;
    let fileTypeFromHeader = 'application/octet-stream';
    let headerReceived = false;
    let receivedBytesTotal = 0;

    let lastUpdateTime = Date.now();
    let lastBytesReceived = 0;
    const updateInterval = 250;

    const updateProgress = (bytes, totalBytes, forceUpdate = false) => {
      const currentTime = Date.now();
      const timeSinceLastUpdate = currentTime - lastUpdateTime;

      if (!forceUpdate && timeSinceLastUpdate < updateInterval) {
        return;
      }

      const timeDiffSeconds = timeSinceLastUpdate / 1000;
      const bytesDiff = bytes - lastBytesReceived;

      let mbitsPerSecond = 0;
      if (timeDiffSeconds > 0 && bytesDiff > 0) {
        const bytesPerSecond = bytesDiff / timeDiffSeconds;
        mbitsPerSecond = (bytesPerSecond * 8) / (1024 * 1024);
      }

      const progressPercent = totalBytes > 0 ? (bytes / totalBytes) * 100 : 0;
      const receivedMB = (bytes / (1024 * 1024)).toFixed(2);
      const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);

      log(
        'Receive progress: ' +
          progressPercent.toFixed(2) +
          '% (' +
          receivedMB +
          ' MB / ' +
          totalMB +
          ' MB)',
        outputReceive,
      );

      updateTransferUI(progressPercent, receivedMB, totalMB, mbitsPerSecond);

      lastUpdateTime = currentTime;
      lastBytesReceived = bytes;
    };

    try {
      for await (const ualistChunk of activeStream.source) {
        if (!ualistChunk || ualistChunk.length === 0) {
          log('Received an empty or null chunk.', outputReceive);
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
                  outputReceive,
                );
                headerReceived = true;

                document.getElementById('receivedFileName').innerText =
                  fileNameFromHeader;
                document.getElementById('receivedFileSize').innerText =
                  `${(fileSizeFromHeader / 1024 / 1024).toFixed(2)} MB`;
              } catch (e) {
                log(
                  `Could not parse file header JSON: "${headerJsonString}". Error: ${e.message}. Treating chunk as data.`,
                  outputReceive,
                );
                headerReceived = true;
                bodyStartIndex = 0;
              }
            } else {
              log(
                'No newline for header in this chunk. Assuming no header or all data.',
                outputReceive,
              );
              headerReceived = true;
              bodyStartIndex = 0;
            }
          } catch (decodeError) {
            log(
              `Error decoding chunk for header: ${decodeError.message}. Treating as raw data.`,
              outputReceive,
            );
            headerReceived = true;
            bodyStartIndex = 0;
          }

          if (bodyStartIndex < dataChunk.byteLength) {
            const actualBodyData = dataChunk.subarray(bodyStartIndex);
            if (actualBodyData.length > 0) {
              receivedFileBuffer.push(actualBodyData);
              receivedBytesTotal += actualBodyData.length;
              updateProgress(receivedBytesTotal, fileSizeFromHeader);
            }
          }
        } else {
          receivedFileBuffer.push(dataChunk);
          receivedBytesTotal += dataChunk.length;
          updateProgress(receivedBytesTotal, fileSizeFromHeader);
        }
      }

      updateProgress(receivedBytesTotal, fileSizeFromHeader, true);

      log(
        `File stream source ended. Total bytes received in buffer: ${receivedBytesTotal}`,
        outputReceive,
      );

      if (fileSizeFromHeader != receivedBytesTotal) {
        showErrorPopup(
          'File size mismatch, received ' +
            (receivedBytesTotal / 1024 / 1024).toFixed(2) +
            ' MB, expected ' +
            (fileSizeFromHeader / 1024 / 1024).toFixed(2) +
            ' MB.',
        );
        stream.close();
        return;
      }

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
        document.getElementById('downloadReadyMessage').style.display = 'block';

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setTimeout(() => URL.revokeObjectURL(downloadUrl), 100);

        log('File received completely.', outputReceive);
      } else {
        const errorMessage =
          'No data received in file buffer. Download will be empty.';
        log(errorMessage, outputReceive);
        showErrorPopup(errorMessage);
      }
    } catch (err) {
      const errorMessage = `Error reading from file stream: ${err.message}`;
      log(errorMessage, outputReceive);
      showErrorPopup(errorMessage);
    } finally {
      log('Closing incoming file stream processing.', outputReceive);
      activeStream = null;
      stream.close();
    }
  });

  if (errorMessage != '') {
    log(errorMessage);
  }
}

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
  const GEO_USER_URL = 'http://ip-api.com/json/';
  const USER_GEO_CACHE_KEY = 'userGeoData';
  const CACHE_DURATION_MS = 48 * 60 * 60 * 1000;

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

async function sendFileToStream(stream, file, chunkSize = 256 * 256) {
  try {
    const header = JSON.stringify({
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
    });
    const encodedHeader = new TextEncoder().encode(header + '\n');

    let bytesSent = 0;
    let lastUpdateTime = Date.now();
    let lastBytesSent = 0;

    const channel = stream.channel;
    const threshold = channel.bufferedAmountLowThreshold || 65536;

    const updateProgress = (bytes, totalBytes, forceUpdate = false) => {
      const currentTime = Date.now();
      const timeSinceLastUpdate = currentTime - lastUpdateTime;

      if (!forceUpdate && timeSinceLastUpdate < 250) {
        return;
      }

      const timeDiffSeconds = timeSinceLastUpdate / 1000;
      const bytesDiff = bytes - lastBytesSent;

      let mbitsPerSecond = 0;
      if (timeDiffSeconds > 0 && bytesDiff > 0) {
        const bytesPerSecond = bytesDiff / timeDiffSeconds;
        mbitsPerSecond = (bytesPerSecond * 8) / (1024 * 1024);
      }

      const progressPercent = (bytes / totalBytes) * 100;
      const sentMB = (bytes / (1024 * 1024)).toFixed(2);
      const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);

      log(
        'Transfer progress: ' +
          progressPercent.toFixed(2) +
          '% (' +
          sentMB +
          ' MB / ' +
          totalMB +
          ' MB)',
        outputSend,
      );
      updateTransferUI(progressPercent, sentMB, totalMB, mbitsPerSecond);

      lastUpdateTime = currentTime;
      lastBytesSent = bytes;
    };

    async function* fileChunks() {
      yield new Uint8ArrayList(encodedHeader);
      await new Promise((resolve) => setTimeout(resolve, 1));

      for (let offset = 0; offset < file.size; offset += chunkSize) {
        const slice = file.slice(
          offset,
          Math.min(offset + chunkSize, file.size),
        );
        const chunk = new Uint8Array(await slice.arrayBuffer());

        yield new Uint8ArrayList(chunk);

        if (channel.bufferedAmount > threshold) {
          await new Promise((resolve) => {
            channel.addEventListener('bufferedamountlow', resolve, {
              once: true,
            });
          });
        }

        bytesSent += chunk.length;
        updateProgress(bytesSent, file.size);
      }
    }

    await stream.sink(fileChunks());
    await stream.close();

    updateProgress(file.size, file.size, true);
    log('File sent completely.', outputSend);
    return true;
  } catch (error) {
    log(`Error sending file: ${error.message}`, outputSend);
    try {
      await stream.abort(error);
    } catch (abortError) {
      log(`Error aborting stream: ${abortError.message}`, outputSend);
    }
    throw error;
  }
}

function updateTransferUI(progressPercent, sentMB, totalMB, mbps) {
  let progressBar;
  let progressText;
  let transferRate;

  if (isSenderMode) {
    progressBar = document.getElementById('sendProgressBar');
    progressText = document.getElementById('sendProgressText');
    transferRate = document.getElementById('sendRate');
  } else {
    progressBar = document.getElementById('receiveProgressBar');
    progressText = document.getElementById('receiveProgressText');
    transferRate = document.getElementById('receiveRate');
  }

  progressBar.style.width = `${progressPercent}%`;
  progressText.textContent = `${sentMB} MB / ${totalMB} MB`;

  if (progressPercent >= 100) {
    transferRate.textContent = 'Complete';
  } else {
    transferRate.textContent = `${mbps.toFixed(2)} Mbps`;
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
      selectedFile = event.target.files[0];

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
          apiErrorMessage += ` - ${response.statusText}`;
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
