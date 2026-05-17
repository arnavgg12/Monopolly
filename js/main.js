// Bootstrap: lobby screen, room code, host/join flow, game loop.
import { Net } from './net.js';
import {
  createInitialState, rollDice, buyPending, declinePending, placeBid, passAuction,
  payJail, useJailCard, buildHouse, sellHouse, mortgage, unmortgage,
  proposeTrade, respondTrade, endTurn, currentPlayer,
} from './game.js';
import { renderAll } from './ui.js';

const $ = id => document.getElementById(id);

// -------- room code helpers --------
function getRoomFromURL() {
  const p = new URLSearchParams(location.search);
  return p.get('room') || null;
}
function makeRoomCode() {
  // 6-char base36, lowercase
  return Math.random().toString(36).slice(2, 8);
}
function roomToPeerId(code) {
  // Host's PeerJS id will be a deterministic-ish prefix; we just expose the room.
  // PeerJS allows custom IDs; we'll pass the room code straight in as the host's peer id.
  return `monopoly-${code}`;
}
function buildShareURL(code) {
  const u = new URL(location.href);
  u.searchParams.set('room', code);
  return u.toString();
}

// -------- app state --------
const app = {
  state: null,
  isHost: false,
  net: null,
  mySelf: null,    // my peer id once Net is up
  myName: '',
  room: null,
  started: false,  // game has begun
  hostPeerOverride: null, // for client: target peer id of host
};

// -------- lobby UI --------
function showLobby() {
  $('lobby').classList.remove('hidden');
  $('game').classList.add('hidden');
  const room = getRoomFromURL();
  if (room) {
    $('join-section').classList.remove('hidden');
    $('host-section').classList.add('hidden');
    $('join-room-label').textContent = room;
  } else {
    $('join-section').classList.add('hidden');
    $('host-section').classList.remove('hidden');
  }
}

function showGame() {
  $('lobby').classList.add('hidden');
  $('game').classList.remove('hidden');
}

// -------- start as host --------
async function startAsHost(name) {
  app.isHost = true;
  app.myName = name;
  app.room = makeRoomCode();
  const hostPeerId = roomToPeerId(app.room);

  // Override PeerJS to use our deterministic id
  app.net = new Net({
    onStateUpdate: (s) => { app.state = s; renderGame(); },
    onLog: (line) => appendStatus(line),
    onPeers: (peers, names) => renderLobbyPeers(peers, names),
    isHost: true,
    hostId: hostPeerId,
    myName: name,
    getStateForBroadcast: () => app.state,
    applyClientAction: hostApplyAction,
  });
  // Custom peer id: re-init the Peer with explicit id
  await initHostPeer(hostPeerId);

  $('host-share').classList.remove('hidden');
  $('share-url').value = buildShareURL(app.room);
  $('room-code').textContent = app.room;
  $('start-game-btn').disabled = false;
}

// Use a custom-id Peer for host so guests can connect without exchanging UUIDs.
async function initHostPeer(hostPeerId) {
  await new Promise((resolve, reject) => {
    app.net.peer = new Peer(hostPeerId, { debug: 1 });
    app.net.peer.on('open', (id) => {
      app.net.hostId = id;
      appendStatus(`Hosting as ${id}`);
      app.net._wirePeer();
      app.net.peerList = [id];
      app.net.peerNames[id] = app.myName;
      app.net.onPeers && app.net.onPeers(app.net.peerList.slice(), app.net.peerNames);
      resolve();
    });
    app.net.peer.on('error', (e) => {
      appendStatus(`Host error: ${e.type || e.message || e}. Try a different room — code may be in use.`);
      reject(e);
    });
  });
  await app.net._initMic();
}

// -------- join as client --------
async function joinRoom(name, room) {
  app.isHost = false;
  app.myName = name;
  app.room = room;
  const hostPeerId = roomToPeerId(room);
  app.net = new Net({
    onStateUpdate: (s) => {
      app.state = s;
      if (!app.started) { app.started = true; showGame(); }
      renderGame();
    },
    onLog: (line) => appendStatus(line),
    onPeers: (peers, names) => renderLobbyPeers(peers, names),
    isHost: false,
    hostId: hostPeerId,
    myName: name,
    getStateForBroadcast: () => null,
    applyClientAction: () => {},
  });
  await app.net.start();
  app.mySelf = app.net.myId();
}

// -------- host: applying actions --------
function hostApplyAction(peerId, action, payload) {
  if (!app.state) return;
  const cp = currentPlayer(app.state);
  const isMyTurn = cp && cp.id === peerId;
  let ok = false;
  switch (action) {
    case 'roll':         if (isMyTurn) ok = rollDice(app.state); break;
    case 'buy':          if (isMyTurn) ok = buyPending(app.state); break;
    case 'decline':      if (isMyTurn) ok = declinePending(app.state); break;
    case 'bid':          ok = placeBid(app.state, peerId, payload?.amount); break;
    case 'passAuction':  ok = passAuction(app.state, peerId); break;
    case 'payJail':      if (isMyTurn) ok = payJail(app.state); break;
    case 'useJailCard':  if (isMyTurn) ok = useJailCard(app.state); break;
    case 'build':        ok = buildHouse(app.state, peerId, payload?.spaceIndex); break;
    case 'sellHouse':    ok = sellHouse(app.state, peerId, payload?.spaceIndex); break;
    case 'mortgage':     ok = mortgage(app.state, peerId, payload?.spaceIndex); break;
    case 'unmortgage':   ok = unmortgage(app.state, peerId, payload?.spaceIndex); break;
    case 'proposeTrade': ok = proposeTrade(app.state, peerId, payload?.to, payload?.offer, payload?.ask); break;
    case 'respondTrade':
      // Only the targeted player can respond
      if (app.state.pendingTrade?.to === peerId) ok = respondTrade(app.state, payload?.accept);
      break;
    case 'endTurn':      if (isMyTurn) ok = endTurn(app.state); break;
  }
  if (ok) {
    app.net.broadcastState(app.state);
    renderGame();
  }
}

// -------- send action (host or client) --------
function sendAction(action, payload) {
  app.net.sendAction(action, payload);
}

// -------- rendering wrappers --------
function renderGame() {
  app.mySelf = app.net.myId();
  renderAll(app.state, app.mySelf, sendAction);
}

function renderLobbyPeers(peers, names) {
  const el = $('lobby-peers');
  if (!el) return;
  el.innerHTML = peers.map(id => `<li>${names[id] || id.slice(0, 8)}${id === app.net.myId() ? ' (you)' : ''}</li>`).join('');
  $('peer-count').textContent = peers.length;
}

function appendStatus(line) {
  const el = $('lobby-status');
  if (!el) return;
  const d = document.createElement('div');
  d.className = 'log-line';
  d.textContent = line;
  el.appendChild(d);
  el.scrollTop = el.scrollHeight;
}

// -------- voice controls --------
function wireVoiceControls() {
  const muteBtn = $('mute-btn');
  if (!muteBtn) return;
  muteBtn.onclick = () => {
    const muted = !app.net.muted;
    app.net.setMuted(muted);
    muteBtn.textContent = muted ? '🔇 Unmute' : '🎤 Mute';
    muteBtn.classList.toggle('muted', muted);
  };
}

// -------- start game (host only) --------
function startGame() {
  if (!app.isHost) return;
  const playerList = app.net.peerList.map(id => ({ id, name: app.net.peerNames[id] || 'Player' }));
  if (playerList.length < 2) { appendStatus('Need at least 2 players.'); return; }
  app.state = createInitialState(playerList);
  app.started = true;
  app.net.broadcastState(app.state);
  showGame();
  renderGame();
}

// -------- wire up DOM --------
function wireLobby() {
  $('host-btn').onclick = async () => {
    const name = $('host-name').value.trim() || 'Player';
    $('host-btn').disabled = true;
    try {
      await startAsHost(name);
    } catch (e) {
      $('host-btn').disabled = false;
    }
  };
  $('join-btn').onclick = async () => {
    const name = $('join-name').value.trim() || 'Player';
    const room = getRoomFromURL();
    if (!room) return;
    $('join-btn').disabled = true;
    try {
      await joinRoom(name, room);
      appendStatus('Joined. Waiting for host to start…');
    } catch (e) {
      $('join-btn').disabled = false;
      appendStatus(`Join failed: ${e.message || e}`);
    }
  };
  $('start-game-btn').onclick = () => startGame();
  $('copy-url-btn').onclick = () => {
    $('share-url').select();
    document.execCommand('copy');
    $('copy-url-btn').textContent = 'Copied!';
    setTimeout(() => { $('copy-url-btn').textContent = 'Copy link'; }, 1500);
  };
}

window.addEventListener('DOMContentLoaded', () => {
  showLobby();
  wireLobby();
  wireVoiceControls();
});
