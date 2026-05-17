// Bootstrap + lobby + game loop. Picks up state updates from the host and runs
// animation diffs before rendering.
import { Net } from './net.js';
import {
  createInitialState, rollDice, buyPending, declinePending, placeBid, passAuction,
  payJail, useJailCard, buildHouse, sellHouse, mortgage, unmortgage,
  proposeTrade, respondTrade, endTurn, currentPlayer,
  settlePending, declareBankruptcy,
} from './game.js';
import { TOKENS } from './data.js';
import { renderStatic, applyStateWithAnim, ensureTokensPlaced } from './ui.js';
import * as sfx from './sound.js';
import { toast } from './anim.js';

const $ = id => document.getElementById(id);

// ----- helpers -----
function getRoomFromURL() {
  const p = new URLSearchParams(location.search);
  return p.get('room') || null;
}
function makeRoomCode() { return Math.random().toString(36).slice(2, 8); }
function roomToPeerId(code) { return `ptyc-${code}`; }
function buildShareURL(code) {
  const u = new URL(location.href);
  u.searchParams.set('room', code);
  return u.toString();
}

// ----- app state -----
const app = {
  state: null,
  lastState: null,
  isHost: false,
  net: null,
  mySelf: null,
  myName: '',
  myToken: TOKENS[0],
  room: null,
  started: false,
  quickMode: false,
  videoOn: false,
  takenTokens: new Set(), // host tracks reservations during lobby
};

// ----- screens -----
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

// ----- token picker -----
function renderTokenPicker(container) {
  container.innerHTML = '';
  for (const t of TOKENS) {
    const div = document.createElement('div');
    div.className = 'token-pick' + (t === app.myToken ? ' selected' : '');
    div.textContent = t;
    div.onclick = () => {
      app.myToken = t;
      renderTokenPicker(container);
      // Update lobby peer list if we're connected so others see the pick
      pushTokenSelection();
    };
    container.appendChild(div);
  }
}

function pushTokenSelection() {
  if (!app.net) return;
  if (app.isHost) {
    // Host: broadcast the change to all peers (via state if game running, or peers msg if not)
    app.net.peerNames[app.net.myId()] = app.myName;
    if (app.net.peerTokens) app.net.peerTokens[app.net.myId()] = app.myToken;
    app.net.onPeers && app.net.onPeers(app.net.peerList.slice(), app.net.peerNames);
  } else {
    // Client: send action to host
    app.net.sendAction('updateToken', { token: app.myToken });
  }
}

// ----- mode toggle -----
function renderModeToggle(container) {
  container.innerHTML = `
    <div class="mode-chip ${!app.quickMode ? 'selected' : ''}" data-mode="classic">
      <div class="mode-title">Classic</div>
      <div class="mode-desc">$1500 start · full rules</div>
    </div>
    <div class="mode-chip ${app.quickMode ? 'selected' : ''}" data-mode="quick">
      <div class="mode-title">Quick</div>
      <div class="mode-desc">$1000 start · faster game</div>
    </div>
  `;
  for (const chip of container.querySelectorAll('.mode-chip')) {
    chip.onclick = () => {
      app.quickMode = chip.dataset.mode === 'quick';
      renderModeToggle(container);
    };
  }
}

// ----- host bootstrap -----
async function startAsHost(name) {
  app.isHost = true;
  app.myName = name;
  app.room = makeRoomCode();
  const hostPeerId = roomToPeerId(app.room);

  app.net = new Net({
    onStateUpdate: () => {}, // host generates state itself
    onLog: (line) => appendStatus(line),
    onPeers: (peers, names) => renderLobbyPeers(peers, names),
    isHost: true,
    hostId: hostPeerId,
    myName: name,
    getStateForBroadcast: () => app.state,
    applyClientAction: hostApplyAction,
  });
  // Per-peer token map for the lobby
  app.net.peerTokens = {};

  await initHostPeer(hostPeerId);
  app.net.peerTokens[app.net.myId()] = app.myToken;

  $('host-share').classList.remove('hidden');
  $('share-url').value = buildShareURL(app.room);
  $('room-code').textContent = app.room;
  $('start-game-btn').disabled = false;
}

async function initHostPeer(hostPeerId) {
  await new Promise((resolve, reject) => {
    app.net.peer = new Peer(hostPeerId, { debug: 1 });
    app.net.peer.on('open', (id) => {
      app.net.hostId = id;
      appendStatus(`Hosting`);
      app.net._wirePeer();
      app.net.peerList = [id];
      app.net.peerNames[id] = app.myName;
      app.net.onPeers && app.net.onPeers(app.net.peerList.slice(), app.net.peerNames);
      resolve();
    });
    app.net.peer.on('error', (e) => {
      appendStatus(`Host error: ${e.type || e.message || e}. The room code may be in use — please refresh and try again.`);
      reject(e);
    });
  });
  await app.net._initMic();
}

// ----- join -----
async function joinRoom(name, room) {
  app.isHost = false;
  app.myName = name;
  app.room = room;
  const hostPeerId = roomToPeerId(room);

  app.net = new Net({
    onStateUpdate: async (s) => {
      if (!app.started) { app.started = true; showGame(); }
      const old = app.lastState;
      app.lastState = s;
      app.state = s;
      app.mySelf = app.net.myId();
      try { await applyStateWithAnim(old, s, app.mySelf, sendAction); }
      catch (e) { renderStatic(s, app.mySelf, sendAction); }
    },
    onLog: (line) => appendStatus(line),
    onPeers: (peers, names) => renderLobbyPeers(peers, names),
    isHost: false,
    hostId: hostPeerId,
    myName: name,
    getStateForBroadcast: () => null,
    applyClientAction: () => {},
  });

  // Patch Net to inject our token into the join message
  const origStart = app.net.start.bind(app.net);
  app.net.start = async () => {
    await origStart();
    // After connection opens, send a token update
    setTimeout(() => app.net.sendAction('updateToken', { token: app.myToken }), 300);
  };

  await app.net.start();
  app.mySelf = app.net.myId();
}

// ----- host action handler -----
function hostApplyAction(peerId, action, payload) {
  // Pre-game (no state yet): only token updates are accepted
  if (!app.state) {
    if (action === 'updateToken' && payload?.token) {
      if (TOKENS.includes(payload.token)) {
        if (!app.net.peerTokens) app.net.peerTokens = {};
        app.net.peerTokens[peerId] = payload.token;
        app.net.onPeers && app.net.onPeers(app.net.peerList.slice(), app.net.peerNames);
      }
    }
    return;
  }

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
      if (app.state.pendingTrade?.to === peerId) ok = respondTrade(app.state, payload?.accept);
      break;
    case 'endTurn':      if (isMyTurn) ok = endTurn(app.state); break;
    case 'settlePending': ok = settlePending(app.state, peerId); break;
    case 'bankrupt':      ok = declareBankruptcy(app.state, peerId); break;
  }
  if (ok) {
    app.net.broadcastState(app.state);
    runHostAnim();
  }
}

async function runHostAnim() {
  const old = app.lastState;
  app.lastState = app.state;
  app.mySelf = app.net.myId();
  try { await applyStateWithAnim(old, app.state, app.mySelf, sendAction); }
  catch (e) { renderStatic(app.state, app.mySelf, sendAction); }
}

function sendAction(action, payload) {
  sfx.unlock();
  app.net.sendAction(action, payload);
}

// ----- video (added on demand on top of Net's audio-only stream) -----
async function toggleVideo() {
  if (!app.net) return;
  if (app.videoOn) {
    // Stop video tracks
    if (app.net.audioStream) {
      for (const track of app.net.audioStream.getVideoTracks()) { track.stop(); app.net.audioStream.removeTrack(track); }
    }
    document.querySelectorAll('.video-tile').forEach(t => t.remove());
    app.videoOn = false;
    $('video-btn').textContent = '📷 Video on';
    $('video-btn').classList.add('off');
  } else {
    try {
      const v = await navigator.mediaDevices.getUserMedia({ video: true });
      const track = v.getVideoTracks()[0];
      if (app.net.audioStream) {
        app.net.audioStream.addTrack(track);
      } else {
        app.net.audioStream = v;
      }
      app.videoOn = true;
      mountSelfVideo(app.net.audioStream);
      $('video-btn').textContent = '📷 Video off';
      $('video-btn').classList.remove('off');
      // Renegotiate calls so other peers see the new track
      for (const id of Object.keys(app.net.calls || {})) {
        try { app.net.calls[id].close(); } catch {}
        delete app.net.calls[id];
        app.net._callPeer(id);
      }
    } catch (e) {
      toast('Camera blocked');
    }
  }
}

function mountSelfVideo(stream) {
  let tiles = $('video-tiles');
  if (!tiles) {
    tiles = document.createElement('div');
    tiles.id = 'video-tiles';
    tiles.className = 'video-tiles';
    document.body.appendChild(tiles);
  }
  let tile = tiles.querySelector('[data-self="1"]');
  if (!tile) {
    tile = document.createElement('div');
    tile.className = 'video-tile';
    tile.dataset.self = '1';
    tile.innerHTML = `<video autoplay muted playsinline></video><div class="nm">You</div>`;
    tiles.appendChild(tile);
  }
  tile.querySelector('video').srcObject = stream;
}

// Patch Net audio-attach to also use video tiles when a remote stream has video
function patchNetForVideoTiles() {
  if (!app.net) return;
  const orig = app.net._attachRemoteAudio.bind(app.net);
  app.net._attachRemoteAudio = function (peerId, stream) {
    orig(peerId, stream);
    // If stream has video, mount tile
    if (stream.getVideoTracks().length) {
      let tiles = $('video-tiles');
      if (!tiles) {
        tiles = document.createElement('div');
        tiles.id = 'video-tiles';
        tiles.className = 'video-tiles';
        document.body.appendChild(tiles);
      }
      let tile = tiles.querySelector(`[data-peer="${peerId}"]`);
      if (!tile) {
        tile = document.createElement('div');
        tile.className = 'video-tile';
        tile.dataset.peer = peerId;
        const name = app.net.peerNames[peerId] || 'Player';
        tile.innerHTML = `<video autoplay playsinline></video><div class="nm">${name}</div>`;
        tiles.appendChild(tile);
      }
      tile.querySelector('video').srcObject = stream;
    }
  };
  const origDetach = app.net._detachRemoteAudio.bind(app.net);
  app.net._detachRemoteAudio = function (peerId) {
    origDetach(peerId);
    const tile = document.querySelector(`.video-tile[data-peer="${peerId}"]`);
    if (tile) tile.remove();
  };
}

// ----- lobby peers list -----
function renderLobbyPeers(peers, names) {
  const el = $('lobby-peers');
  if (!el) return;
  el.innerHTML = peers.map(id => {
    const tok = (app.net.peerTokens && app.net.peerTokens[id]) || '';
    const isMe = id === app.net.myId();
    return `<li><span class="pl-token">${tok || '👤'}</span>${names[id] || id.slice(0, 6)}${isMe ? ' (you)' : ''}</li>`;
  }).join('');
  $('peer-count').textContent = peers.length;
  if (app.isHost) $('start-game-btn').disabled = peers.length < 2;
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

// ----- voice / video controls -----
function wireGameControls() {
  $('mute-btn').onclick = () => {
    sfx.unlock();
    const muted = !app.net.muted;
    app.net.setMuted(muted);
    $('mute-btn').textContent = muted ? '🔇 Unmute' : '🎤 Mute';
    $('mute-btn').classList.toggle('muted', muted);
  };
  $('video-btn').onclick = () => {
    sfx.unlock();
    toggleVideo();
  };
  $('sound-btn').onclick = () => {
    const newState = !sfx.isEnabled();
    sfx.setEnabled(newState);
    $('sound-btn').textContent = newState ? '🔊 Sound' : '🔈 Muted';
    $('sound-btn').classList.toggle('off', !newState);
  };
  window.addEventListener('resize', () => ensureTokensPlaced());
}

// ----- start the game (host only) -----
function startGame() {
  if (!app.isHost) return;
  if (app.net.peerList.length < 2) { appendStatus('Need at least 2 players.'); return; }
  const playerList = app.net.peerList.map(id => ({
    id,
    name: app.net.peerNames[id] || 'Player',
    token: (app.net.peerTokens && app.net.peerTokens[id]) || undefined,
  }));
  app.state = createInitialState(playerList, {
    startingCash: app.quickMode ? 1000 : 1500,
  });
  app.lastState = null;
  app.started = true;
  app.net.broadcastState(app.state);
  showGame();
  app.mySelf = app.net.myId();
  renderStatic(app.state, app.mySelf, sendAction);
  app.lastState = app.state;
  toast('Game on. Roll the dice!');
}

// ----- wire lobby -----
function wireLobby() {
  renderTokenPicker($('host-tokens'));
  renderTokenPicker($('join-tokens'));
  renderModeToggle($('mode-toggle'));

  $('host-btn').onclick = async () => {
    sfx.unlock();
    const name = $('host-name').value.trim() || 'Player';
    $('host-btn').disabled = true;
    try {
      await startAsHost(name);
      patchNetForVideoTiles();
    } catch (e) {
      $('host-btn').disabled = false;
    }
  };
  $('join-btn').onclick = async () => {
    sfx.unlock();
    const name = $('join-name').value.trim() || 'Player';
    const room = getRoomFromURL();
    if (!room) return;
    $('join-btn').disabled = true;
    try {
      await joinRoom(name, room);
      patchNetForVideoTiles();
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
  wireGameControls();
});
