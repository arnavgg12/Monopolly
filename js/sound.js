// Synthesized SFX via WebAudio. No external assets.
let ctx = null;
let enabled = true;

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function setEnabled(v) { enabled = v; }
export function isEnabled() { return enabled; }

function envGain(c, t0, peak, attack = 0.005, decay = 0.15) {
  const g = c.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + attack + decay);
  return g;
}

function tone(freq, t0, duration, type = 'sine', peak = 0.2) {
  const c = ac();
  const o = c.createOscillator();
  const g = envGain(c, t0, peak, 0.005, duration);
  o.type = type;
  o.frequency.value = freq;
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + duration + 0.05);
}

function noiseBurst(t0, duration, peak = 0.25, lowpass = 1200) {
  const c = ac();
  const bufferSize = Math.floor(c.sampleRate * duration);
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = lowpass;
  const g = envGain(c, t0, peak, 0.001, duration);
  src.connect(filter).connect(g).connect(c.destination);
  src.start(t0);
  src.stop(t0 + duration + 0.05);
}

export function diceShake() {
  if (!enabled) return;
  const c = ac();
  const t = c.currentTime;
  for (let i = 0; i < 6; i++) {
    noiseBurst(t + i * 0.06, 0.05, 0.18, 2500);
  }
}

export function diceLand() {
  if (!enabled) return;
  const t = ac().currentTime;
  noiseBurst(t, 0.08, 0.3, 1800);
  tone(180, t + 0.04, 0.1, 'square', 0.12);
}

export function tokenHop() {
  if (!enabled) return;
  const t = ac().currentTime;
  tone(620, t, 0.06, 'sine', 0.15);
  tone(880, t + 0.03, 0.06, 'sine', 0.1);
}

export function cashRegister() {
  if (!enabled) return;
  const t = ac().currentTime;
  tone(880, t, 0.12, 'triangle', 0.18);
  tone(1318, t + 0.08, 0.18, 'triangle', 0.18);
}

export function cashLoss() {
  if (!enabled) return;
  const t = ac().currentTime;
  tone(440, t, 0.14, 'sawtooth', 0.18);
  tone(330, t + 0.1, 0.18, 'sawtooth', 0.18);
}

export function cardFlip() {
  if (!enabled) return;
  const t = ac().currentTime;
  noiseBurst(t, 0.18, 0.18, 4500);
}

export function buyChime() {
  if (!enabled) return;
  const t = ac().currentTime;
  tone(523, t,        0.1, 'triangle', 0.16);
  tone(659, t + 0.08, 0.1, 'triangle', 0.16);
  tone(784, t + 0.16, 0.18, 'triangle', 0.16);
}

export function bankruptSting() {
  if (!enabled) return;
  const t = ac().currentTime;
  tone(220, t,        0.22, 'sawtooth', 0.22);
  tone(196, t + 0.18, 0.22, 'sawtooth', 0.22);
  tone(165, t + 0.36, 0.36, 'sawtooth', 0.22);
}

export function winFanfare() {
  if (!enabled) return;
  const t = ac().currentTime;
  const notes = [523, 659, 784, 1046];
  notes.forEach((f, i) => tone(f, t + i * 0.12, 0.18, 'triangle', 0.2));
}

export function jailDoor() {
  if (!enabled) return;
  const t = ac().currentTime;
  noiseBurst(t, 0.05, 0.3, 600);
  tone(80, t + 0.04, 0.18, 'square', 0.2);
}

// Call once after a user gesture so iOS / Chrome unblock audio.
export function unlock() { ac(); }
