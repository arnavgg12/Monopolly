// Animation helpers using Web Animations API + CSS transforms.
// Tokens live in a tokens-layer overlay positioned absolutely over the board.
import * as sfx from './sound.js';

export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ----- Dice -----
// Tumbles dice for ~800ms, then locks to the rolled values. Plays sounds.
export async function rollDiceAnimation(diceEl, d1, d2) {
  if (!diceEl) return;
  diceEl.innerHTML = `
    <div class="die die-a"><span class="face">?</span></div>
    <div class="die die-b"><span class="face">?</span></div>
  `;
  const dieA = diceEl.querySelector('.die-a .face');
  const dieB = diceEl.querySelector('.die-b .face');
  const cubeA = diceEl.querySelector('.die-a');
  const cubeB = diceEl.querySelector('.die-b');

  sfx.diceShake();

  const start = performance.now();
  const duration = 800;
  await new Promise((resolve) => {
    function frame() {
      const t = performance.now() - start;
      const tnorm = t / duration;
      if (tnorm >= 1) { resolve(); return; }
      cubeA.style.transform = `rotateX(${360 * tnorm + Math.random() * 30}deg) rotateY(${380 * tnorm}deg) translateY(${Math.sin(tnorm * 12) * 6}px)`;
      cubeB.style.transform = `rotateX(${320 * tnorm}deg) rotateY(${410 * tnorm + Math.random() * 20}deg) translateY(${Math.cos(tnorm * 12) * 6}px)`;
      dieA.textContent = 1 + Math.floor(Math.random() * 6);
      dieB.textContent = 1 + Math.floor(Math.random() * 6);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });

  // Settle
  dieA.textContent = d1;
  dieB.textContent = d2;
  cubeA.style.transform = `rotateX(0) rotateY(0) translateY(0)`;
  cubeB.style.transform = `rotateX(0) rotateY(0) translateY(0)`;
  cubeA.classList.add('settled');
  cubeB.classList.add('settled');
  sfx.diceLand();
  await sleep(200);
}

// ----- Token hop along the board -----
// `coordsForSpace(i)` returns {x,y} in pixels relative to the board container.
export async function hopToken(tokenEl, fromIndex, toIndex, coordsForSpace) {
  if (!tokenEl) return;
  // Compute the path: each integer step between fromIndex and toIndex (clockwise wrap at 40).
  const steps = [];
  let cur = fromIndex;
  while (cur !== toIndex) {
    cur = (cur + 1) % 40;
    steps.push(cur);
  }
  if (!steps.length) {
    // direct snap (e.g., teleport via Chance card or rolling a 0)
    const p = coordsForSpace(toIndex);
    tokenEl.style.transform = `translate(${p.x}px, ${p.y}px)`;
    return;
  }

  const hopMs = steps.length > 12 ? 70 : 110;
  for (const idx of steps) {
    const p = coordsForSpace(idx);
    tokenEl.style.transition = `transform ${hopMs}ms cubic-bezier(.2,.85,.4,1)`;
    tokenEl.style.transform = `translate(${p.x}px, ${p.y - 14}px)`;
    sfx.tokenHop();
    await sleep(hopMs * 0.55);
    tokenEl.style.transform = `translate(${p.x}px, ${p.y}px)`;
    await sleep(hopMs * 0.45);
  }
}

// Snap token without animation (initial render).
export function placeToken(tokenEl, spaceIndex, coordsForSpace) {
  if (!tokenEl) return;
  const p = coordsForSpace(spaceIndex);
  tokenEl.style.transition = 'none';
  tokenEl.style.transform = `translate(${p.x}px, ${p.y}px)`;
}

// ----- Money fly -----
// A floating "+$200" element drifts from `fromEl` toward `toEl` then fades.
export function flyMoney(amount, fromEl, toEl, sign = '+') {
  if (!fromEl || !toEl) return;
  const a = fromEl.getBoundingClientRect();
  const b = toEl.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'fly-money';
  el.textContent = `${sign}$${amount}`;
  el.style.color = sign === '+' ? '#4ade80' : '#ef4444';
  document.body.appendChild(el);
  const startX = a.left + a.width / 2;
  const startY = a.top  + a.height / 2;
  const endX   = b.left + b.width / 2;
  const endY   = b.top  + b.height / 2;
  el.style.left = `${startX}px`;
  el.style.top  = `${startY}px`;
  requestAnimationFrame(() => {
    el.style.transition = 'transform 900ms cubic-bezier(.2,.7,.3,1), opacity 900ms';
    el.style.transform = `translate(${endX - startX}px, ${endY - startY}px) scale(1.2)`;
    el.style.opacity = '0';
  });
  setTimeout(() => el.remove(), 1000);
  if (sign === '+') sfx.cashRegister(); else sfx.cashLoss();
}

// ----- Card flip overlay -----
export async function showCard(text, deck) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'card-overlay';
    wrap.innerHTML = `
      <div class="card-flip">
        <div class="card-face card-${deck}">
          <div class="card-deck-name">${deck === 'chance' ? 'CHANCE' : 'COMMUNITY CHEST'}</div>
          <div class="card-text">${text.replace(/</g, '&lt;')}</div>
          <button class="card-ok">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
    sfx.cardFlip();
    requestAnimationFrame(() => wrap.classList.add('shown'));
    const close = () => {
      wrap.classList.remove('shown');
      setTimeout(() => { wrap.remove(); resolve(); }, 250);
    };
    wrap.querySelector('.card-ok').onclick = close;
    setTimeout(close, 3200);
  });
}

// ----- Toast -----
export function toast(msg, ms = 1800) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('shown'));
  setTimeout(() => {
    t.classList.remove('shown');
    setTimeout(() => t.remove(), 250);
  }, ms);
}
