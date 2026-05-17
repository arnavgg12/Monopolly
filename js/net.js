// PeerJS-based networking. Host-authoritative state. Mesh voice between all peers.
// Wire protocol (data channel):
//   host -> client : { t:'state', state }
//                  : { t:'peers', peers:[id] }    // tell new joiner everyone else
//                  : { t:'hello',  selfId, hostId }
//   client -> host : { t:'join',   name }
//                  : { t:'action', action, payload }
// All non-host peers connect to host AND to each other (data + voice).
// Voice: mediaConnection per pair.

const PEERJS_OPTS = { debug: 1 }; // uses free public cloud server by default

export class Net {
  constructor({ onStateUpdate, onLog, onPeers, isHost, hostId, myName, getStateForBroadcast, applyClientAction }) {
    this.onStateUpdate = onStateUpdate;
    this.onLog = onLog;
    this.onPeers = onPeers;
    this.isHost = isHost;
    this.hostId = hostId; // for client; for host: equals this.peer.id once open
    this.myName = myName;
    this.getStateForBroadcast = getStateForBroadcast;
    this.applyClientAction = applyClientAction;

    this.peer = null;
    this.connections = {};   // peerId -> DataConnection
    this.calls = {};         // peerId -> MediaConnection
    this.audioStream = null;
    this.muted = false;
    this.peerList = [];      // all peer ids in game (host first)
    this.peerNames = {};     // peerId -> displayName
    this.audioElements = {}; // peerId -> <audio>
  }

  async start() {
    await this._initPeer();
    await this._initMic();
    if (this.isHost) {
      this.peerList = [this.peer.id];
      this.peerNames[this.peer.id] = this.myName;
      this.onPeers && this.onPeers(this.peerList.slice(), this.peerNames);
    } else {
      this._connectToHost();
    }
  }

  _initPeer() {
    return new Promise((resolve, reject) => {
      // Let PeerJS auto-assign a 36-char id.
      this.peer = new Peer(undefined, PEERJS_OPTS);
      this.peer.on('open', (id) => {
        this.onLog && this.onLog(`Peer ready: ${id.slice(0, 8)}…`);
        if (this.isHost) this.hostId = id;
        this._wirePeer();
        resolve(id);
      });
      this.peer.on('error', (e) => {
        this.onLog && this.onLog(`Peer error: ${e.type || e.message || e}`);
        reject(e);
      });
    });
  }

  _wirePeer() {
    this.peer.on('connection', (conn) => this._handleIncomingData(conn));
    this.peer.on('call',       (call) => this._handleIncomingCall(call));
  }

  async _initMic() {
    try {
      this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this.onLog && this.onLog('Microphone ready.');
    } catch (e) {
      this.onLog && this.onLog('Microphone blocked — voice chat off.');
      this.audioStream = null;
    }
  }

  _connectToHost() {
    const conn = this.peer.connect(this.hostId, { reliable: true });
    this._registerDataConnection(conn, this.hostId);
    conn.on('open', () => {
      conn.send({ t: 'join', name: this.myName });
      if (this.audioStream) this._callPeer(this.hostId);
    });
  }

  _handleIncomingData(conn) {
    this._registerDataConnection(conn, conn.peer);
  }

  _registerDataConnection(conn, peerId) {
    this.connections[peerId] = conn;
    conn.on('data', (msg) => this._onMessage(peerId, msg, conn));
    conn.on('close', () => this._onPeerLeft(peerId));
    conn.on('error', () => this._onPeerLeft(peerId));
  }

  _handleIncomingCall(call) {
    if (this.audioStream) call.answer(this.audioStream); else call.answer();
    this._wireCall(call, call.peer);
  }

  _callPeer(targetId) {
    if (!this.audioStream || targetId === this.peer.id) return;
    if (this.calls[targetId]) return;
    const call = this.peer.call(targetId, this.audioStream);
    this._wireCall(call, targetId);
  }

  _wireCall(call, peerId) {
    this.calls[peerId] = call;
    call.on('stream', (remoteStream) => this._attachRemoteAudio(peerId, remoteStream));
    call.on('close', () => this._detachRemoteAudio(peerId));
    call.on('error', () => this._detachRemoteAudio(peerId));
  }

  _attachRemoteAudio(peerId, stream) {
    let el = this.audioElements[peerId];
    if (!el) {
      el = document.createElement('audio');
      el.autoplay = true;
      el.playsInline = true;
      el.dataset.peer = peerId;
      document.body.appendChild(el);
      this.audioElements[peerId] = el;
    }
    el.srcObject = stream;
  }
  _detachRemoteAudio(peerId) {
    const el = this.audioElements[peerId];
    if (el) { el.srcObject = null; el.remove(); delete this.audioElements[peerId]; }
    delete this.calls[peerId];
  }

  _onMessage(peerId, msg, conn) {
    if (!msg || !msg.t) return;
    if (this.isHost) {
      if (msg.t === 'join') {
        this.peerNames[peerId] = msg.name || `Player`;
        if (!this.peerList.includes(peerId)) this.peerList.push(peerId);
        // Tell the new peer who's here so they can dial them for voice
        const others = this.peerList.filter(id => id !== peerId);
        conn.send({ t: 'hello', selfId: peerId, hostId: this.peer.id });
        conn.send({ t: 'peers', peers: others, names: this.peerNames });
        // Tell everyone else about the newcomer
        for (const id of others) {
          if (id === this.peer.id) continue;
          this.connections[id]?.send({ t: 'peers', peers: [peerId], names: this.peerNames });
        }
        this.onPeers && this.onPeers(this.peerList.slice(), this.peerNames);
        this.onLog && this.onLog(`${msg.name} joined.`);
        // Broadcast current state if game in progress
        const s = this.getStateForBroadcast && this.getStateForBroadcast();
        if (s) conn.send({ t: 'state', state: s });
      } else if (msg.t === 'action') {
        this.applyClientAction && this.applyClientAction(peerId, msg.action, msg.payload);
      }
    } else {
      if (msg.t === 'hello') {
        // self assignment confirmation (no-op)
      } else if (msg.t === 'peers') {
        if (msg.names) Object.assign(this.peerNames, msg.names);
        for (const id of msg.peers) {
          if (!this.peerList.includes(id)) this.peerList.push(id);
          if (id !== this.peer.id && !this.connections[id]) {
            const c = this.peer.connect(id, { reliable: true });
            this._registerDataConnection(c, id);
            c.on('open', () => { if (this.audioStream) this._callPeer(id); });
          } else if (id !== this.peer.id && this.audioStream && !this.calls[id]) {
            this._callPeer(id);
          }
        }
        this.onPeers && this.onPeers(this.peerList.slice(), this.peerNames);
      } else if (msg.t === 'state') {
        this.onStateUpdate && this.onStateUpdate(msg.state);
      }
    }
  }

  _onPeerLeft(peerId) {
    if (this.connections[peerId]) { try { this.connections[peerId].close(); } catch {} delete this.connections[peerId]; }
    if (this.calls[peerId])       { try { this.calls[peerId].close(); }       catch {} delete this.calls[peerId]; }
    this._detachRemoteAudio(peerId);
    this.peerList = this.peerList.filter(id => id !== peerId);
    delete this.peerNames[peerId];
    this.onLog && this.onLog(`Peer left: ${peerId.slice(0, 8)}…`);
    this.onPeers && this.onPeers(this.peerList.slice(), this.peerNames);
  }

  // ---------- public API ----------
  broadcastState(state) {
    if (!this.isHost) return;
    for (const id in this.connections) {
      try { this.connections[id].send({ t: 'state', state }); } catch {}
    }
  }

  sendAction(action, payload) {
    if (this.isHost) {
      this.applyClientAction && this.applyClientAction(this.peer.id, action, payload);
      return;
    }
    const conn = this.connections[this.hostId];
    if (conn) conn.send({ t: 'action', action, payload });
  }

  setMuted(muted) {
    this.muted = muted;
    if (!this.audioStream) return;
    for (const track of this.audioStream.getAudioTracks()) track.enabled = !muted;
  }

  myId() { return this.peer?.id; }
}
