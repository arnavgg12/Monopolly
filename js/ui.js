// Rendering + animation diff layer.
// renderStatic() refreshes panels; animateTransitions() runs animations on state diff.
import { BOARD, COLOR_GROUPS, CHANCE_CARDS, CHEST_CARDS } from './data.js';
import { currentPlayer, planRaiseCash, ownsGroup } from './game.js';
import * as anim from './anim.js';

const $ = id => document.getElementById(id);

// 11x11 grid coords for each board space
function gridCoords(i) {
  if (i === 0)              return { r: 11, c: 11 };
  if (i >= 1 && i <= 9)     return { r: 11, c: 11 - i };
  if (i === 10)             return { r: 11, c: 1 };
  if (i >= 11 && i <= 19)   return { r: 11 - (i - 10), c: 1 };
  if (i === 20)             return { r: 1, c: 1 };
  if (i >= 21 && i <= 29)   return { r: 1, c: 1 + (i - 20) };
  if (i === 30)             return { r: 1, c: 11 };
  if (i >= 31 && i <= 39)   return { r: 1 + (i - 30), c: 11 };
}

function spaceClass(sp) {
  if (sp.i === 0)  return 'corner go';
  if (sp.i === 10) return 'corner jail';
  if (sp.i === 20) return 'corner parking';
  if (sp.i === 30) return 'corner gotojail';
  const side = (sp.i < 10) ? 'bottom' : (sp.i < 20) ? 'left' : (sp.i < 30) ? 'top' : 'right';
  return `space side-${side}`;
}

function iconEl(text, cls) {
  const d = document.createElement('div');
  d.className = `space-icon ${cls}`;
  d.textContent = text;
  return d;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ===== Board static render =====
let boardBuilt = false;
function buildBoardOnce() {
  if (boardBuilt) return;
  const el = $('board');
  el.innerHTML = '';

  for (const sp of BOARD) {
    const { r, c } = gridCoords(sp.i);
    const div = document.createElement('div');
    div.className = spaceClass(sp);
    div.style.gridRow = r;
    div.style.gridColumn = c;
    div.dataset.index = sp.i;

    if (sp.type === 'prop') {
      const stripe = document.createElement('div');
      stripe.className = 'color-stripe';
      stripe.style.background = COLOR_GROUPS[sp.group].color;
      div.appendChild(stripe);
    }

    if (sp.i === 0)  div.innerHTML += '<div class="corner-icon">→</div><div>GO</div>';
    if (sp.i === 10) div.innerHTML += '<div class="corner-icon">🔒</div><div>JAIL</div>';
    if (sp.i === 20) div.innerHTML += '<div class="corner-icon">🅿️</div><div>FREE<br/>PARKING</div>';
    if (sp.i === 30) div.innerHTML += '<div class="corner-icon">🚓</div><div>GO TO<br/>JAIL</div>';

    if (sp.type !== 'go' && sp.type !== 'jail' && sp.type !== 'parking' && sp.type !== 'gotojail') {
      const name = document.createElement('div');
      name.className = 'space-name';
      name.textContent = sp.name;
      div.appendChild(name);
    }

    if (sp.price && sp.type !== 'go') {
      const price = document.createElement('div');
      price.className = 'space-price';
      price.textContent = `$${sp.price}`;
      div.appendChild(price);
    }
    if (sp.type === 'chance')  div.appendChild(iconEl('?', 'chance-icon'));
    if (sp.type === 'chest')   div.appendChild(iconEl('💰', 'chest-icon'));
    if (sp.type === 'tax')     div.appendChild(iconEl(`$${sp.amount}`, 'tax-icon'));
    if (sp.type === 'rr')      div.appendChild(iconEl('🚂', 'rr-icon'));
    if (sp.type === 'util' && sp.i === 12) div.appendChild(iconEl('💡', 'util-icon'));
    if (sp.type === 'util' && sp.i === 28) div.appendChild(iconEl('🚰', 'util-icon'));

    const housesEl = document.createElement('div');
    housesEl.className = 'houses';
    housesEl.dataset.houses = sp.i;
    div.appendChild(housesEl);

    const ownerTag = document.createElement('div');
    ownerTag.className = 'owner-tag';
    ownerTag.dataset.owner = sp.i;
    div.appendChild(ownerTag);

    const mortMark = document.createElement('div');
    mortMark.className = 'mortgaged-mark';
    mortMark.dataset.mort = sp.i;
    mortMark.style.display = 'none';
    div.appendChild(mortMark);

    el.appendChild(div);
  }

  // Center
  const center = document.createElement('div');
  center.className = 'board-center';
  center.innerHTML = `
    <div class="center-brand">PROPERTY TYCOON<span class="sm">multiplayer</span></div>
    <div class="center-dice" id="dice-area"></div>
    <div class="center-active" id="dice-status">Roll to begin</div>
  `;
  el.appendChild(center);

  // Tokens layer overlay
  const layer = document.createElement('div');
  layer.className = 'tokens-layer';
  layer.id = 'tokens-layer';
  el.appendChild(layer);

  boardBuilt = true;
}

// Get pixel center of a board space (relative to tokens-layer)
function spaceCenter(idx) {
  const cell = document.querySelector(`[data-index="${idx}"]`);
  const layer = document.getElementById('tokens-layer');
  if (!cell || !layer) return { x: 0, y: 0 };
  const cr = cell.getBoundingClientRect();
  const lr = layer.getBoundingClientRect();
  return { x: cr.left - lr.left + cr.width / 2 - 11, y: cr.top - lr.top + cr.height / 2 - 11 };
}

// Render houses/hotels and ownership tags from state
function renderProperties(state) {
  for (const sp of BOARD) {
    const prop = state.properties[sp.i];
    if (!prop) continue;

    const housesEl = document.querySelector(`[data-houses="${sp.i}"]`);
    if (housesEl) {
      housesEl.innerHTML = '';
      if (prop.hotel) {
        const h = document.createElement('div');
        h.className = 'hotel-pip';
        housesEl.appendChild(h);
      } else if (prop.houses > 0) {
        for (let i = 0; i < prop.houses; i++) {
          const h = document.createElement('div');
          h.className = 'house-pip';
          housesEl.appendChild(h);
        }
      }
    }

    const ownerEl = document.querySelector(`[data-owner="${sp.i}"]`);
    if (ownerEl) {
      const owner = prop.owner ? state.players.find(p => p.id === prop.owner) : null;
      ownerEl.textContent = owner ? owner.token : '';
    }

    const mortEl = document.querySelector(`[data-mort="${sp.i}"]`);
    if (mortEl) mortEl.style.display = prop.mortgaged ? 'block' : 'none';
  }
}

// Render tokens layer: one element per active player
const tokenEls = new Map(); // playerId -> element
function ensureTokenElements(state, mySelf) {
  const layer = $('tokens-layer');
  if (!layer) return;
  // Add tokens for any new players
  for (const p of state.players) {
    if (p.bankrupt) {
      const el = tokenEls.get(p.id);
      if (el) { el.remove(); tokenEls.delete(p.id); }
      continue;
    }
    if (!tokenEls.has(p.id)) {
      const el = document.createElement('div');
      el.className = 'token-piece';
      el.textContent = p.token;
      if (p.id === mySelf) el.classList.add('me');
      layer.appendChild(el);
      tokenEls.set(p.id, el);
      anim.placeToken(el, p.pos, spaceCenter);
    } else {
      const el = tokenEls.get(p.id);
      // Update "me" highlight in case mySelf only became known after first render
      if (p.id === mySelf) el.classList.add('me');
    }
  }
}

// ===== Players panel =====
function renderPlayers(state, mySelf) {
  const el = $('players');
  el.innerHTML = '';
  for (const p of state.players) {
    const card = document.createElement('div');
    card.className = `player-card ${p.bankrupt ? 'bankrupt' : ''} ${currentPlayer(state)?.id === p.id ? 'turn' : ''}`;
    card.dataset.player = p.id;
    card.innerHTML = `
      <div class="row1">
        <span class="tk">${p.token}</span>
        <span class="nm">${escapeHtml(p.name)}${p.id === mySelf ? ' (you)' : ''}</span>
      </div>
      <div class="row2">
        <span class="cash">$${p.cash}</span>
        ${p.inJail ? '<span class="jail-tag">JAIL</span>' : ''}
        ${p.jailCards ? `<span class="card-tag">🎟 ${p.jailCards}</span>` : ''}
      </div>
    `;
    el.appendChild(card);
  }
}

function renderTurn(state, mySelf) {
  const cp = currentPlayer(state);
  const t = $('turn-indicator');
  if (state.winner) {
    const w = state.players.find(p => p.id === state.winner);
    t.textContent = `🏆 ${w?.name || 'Winner'} won!`;
    return;
  }
  if (!cp) { t.textContent = ''; return; }
  t.textContent = (cp.id === mySelf)
    ? `Your turn`
    : `${cp.name}'s turn`;
}

function renderLog(state) {
  const el = $('log');
  el.innerHTML = '';
  for (const line of state.log.slice(-50)) {
    const d = document.createElement('div');
    d.className = 'log-line';
    d.textContent = line;
    el.appendChild(d);
  }
  el.scrollTop = el.scrollHeight;
}

function diceStatusText(state, mySelf) {
  if (state.winner) return `🏆 Game over`;
  const cp = currentPlayer(state);
  if (!cp) return '';
  if (state.lastRoll) return `${state.lastRoll[0]} + ${state.lastRoll[1]} = ${state.lastRoll[0] + state.lastRoll[1]}`;
  return (cp.id === mySelf) ? 'Roll the dice' : `${cp.name} is rolling`;
}

function renderDiceStatic(state) {
  const area = $('dice-area');
  if (!area) return;
  if (state.lastRoll) {
    area.innerHTML = `
      <div class="die settled"><span class="face">${state.lastRoll[0]}</span></div>
      <div class="die settled"><span class="face">${state.lastRoll[1]}</span></div>
    `;
  } else {
    area.innerHTML = `
      <div class="die"><span class="face">—</span></div>
      <div class="die"><span class="face">—</span></div>
    `;
  }
  $('dice-status').textContent = diceStatusText(state, lastSelf);
}

// ===== Action dock =====
function renderActions(state, mySelf, send) {
  const el = $('action-dock');
  el.innerHTML = '';
  const cp = currentPlayer(state);
  const me = state.players.find(p => p.id === mySelf);

  // Pending payment alert — highest priority
  if (state.pendingPayment && state.pendingPayment.playerId === mySelf) {
    const pp = state.pendingPayment;
    const plan = planRaiseCash(state, mySelf, pp.amount);
    const need = pp.amount - me.cash;
    const planSummary = plan.plan.length
      ? `${plan.plan.length} actions (${plan.plan.filter(a => a.kind === 'mortgage').length} mortgages, ${plan.plan.filter(a => a.kind === 'sellHouse').length} house sales)`
      : 'none available';
    el.innerHTML = `
      <div class="payment-alert">
        You owe <b>$${pp.amount}</b> but have <b>$${me.cash}</b>. Need <b>$${need}</b> more.
        ${plan.ok ? `Auto-raise: ${planSummary}.` : `<b>Insufficient assets — must declare bankruptcy.</b>`}
      </div>
      <div class="row">
        ${plan.ok ? `<button id="raise-btn" class="gold">Auto-raise $${need} & pay</button>` : ''}
        <button id="bankrupt-btn" class="danger">Declare bankruptcy</button>
      </div>
    `;
    if (plan.ok) $('raise-btn').onclick = () => send('settlePending', {});
    $('bankrupt-btn').onclick = () => send('bankrupt', {});
    return;
  }

  // Auction (anyone can bid)
  if (state.pendingAuction) {
    const sp = BOARD[state.pendingAuction.spaceIndex];
    const highName = state.pendingAuction.highBidder
      ? state.players.find(p => p.id === state.pendingAuction.highBidder)?.name
      : '(none)';
    el.innerHTML = `
      <div class="ah">🏷️ Auction: ${sp.name}</div>
      <div class="muted-text" style="font-size:12px; margin-bottom:6px;">High bid: $${state.pendingAuction.currentBid} by ${highName}</div>
      <div class="row">
        <input type="number" id="bid-input" placeholder="Your bid" min="${state.pendingAuction.currentBid + 1}" />
        <button id="bid-btn">Bid</button>
        <button id="pass-btn" class="ghost">Pass</button>
      </div>
    `;
    $('bid-btn').onclick = () => {
      const v = parseInt($('bid-input').value, 10);
      if (!isNaN(v)) send('bid', { amount: v });
    };
    $('pass-btn').onclick = () => send('passAuction', {});
    return;
  }

  // Trade response
  if (state.pendingTrade && state.pendingTrade.to === mySelf) {
    const from = state.players.find(p => p.id === state.pendingTrade.from);
    const offer = state.pendingTrade.offer, ask = state.pendingTrade.ask;
    const propName = i => BOARD[i].name;
    el.innerHTML = `
      <div class="ah">🤝 Trade offer from ${from.name}</div>
      <div style="font-size:12px; color:var(--muted); margin-bottom:6px;">
        <div>They give: $${offer.cash} ${offer.props.length ? '+ ' + offer.props.map(propName).join(', ') : ''}</div>
        <div>They ask: $${ask.cash} ${ask.props.length ? '+ ' + ask.props.map(propName).join(', ') : ''}</div>
      </div>
      <div class="row">
        <button id="trade-accept" class="gold">Accept</button>
        <button id="trade-decline" class="ghost">Decline</button>
      </div>
    `;
    $('trade-accept').onclick  = () => send('respondTrade', { accept: true });
    $('trade-decline').onclick = () => send('respondTrade', { accept: false });
    return;
  }

  if (state.winner) {
    const w = state.players.find(p => p.id === state.winner);
    el.innerHTML = `<div class="ah">🏆 ${escapeHtml(w?.name || 'Winner')} wins the game!</div>`;
    return;
  }

  if (!cp || cp.id !== mySelf) {
    el.innerHTML = `<div class="muted-text" style="font-size:13px;">Waiting for <b>${escapeHtml(cp?.name || '...')}</b>…</div>`;
    return;
  }

  // My turn
  if (state.phase === 'roll') {
    if (me.inJail) {
      el.innerHTML = `
        <div class="ah">🔒 You're in Jail (turn ${me.jailTurns + 1}/3)</div>
        <div class="row">
          <button id="roll-btn">🎲 Roll for doubles</button>
          <button id="pay-jail-btn" ${me.cash < 50 ? 'disabled' : ''}>Pay $50</button>
          <button id="card-jail-btn" ${me.jailCards <= 0 ? 'disabled' : ''}>Use card</button>
        </div>
      `;
      $('roll-btn').onclick      = () => send('roll', {});
      $('pay-jail-btn').onclick  = () => send('payJail', {});
      $('card-jail-btn').onclick = () => send('useJailCard', {});
    } else {
      el.innerHTML = `
        <div class="row">
          <button id="roll-btn" class="big">🎲 Roll dice</button>
        </div>
      `;
      $('roll-btn').onclick = () => send('roll', {});
    }
  } else if (state.phase === 'action' && state.pendingPurchase) {
    const sp = BOARD[state.pendingPurchase.spaceIndex];
    el.innerHTML = `
      <div class="ah">📍 ${sp.name} — $${sp.price}</div>
      <div class="row">
        <button id="buy-btn" class="gold" ${me.cash < sp.price ? 'disabled' : ''}>Buy for $${sp.price}</button>
        <button id="auction-btn" class="ghost">Auction</button>
      </div>
    `;
    $('buy-btn').onclick     = () => send('buy', {});
    $('auction-btn').onclick = () => send('decline', {});
  } else if (state.phase === 'end') {
    el.innerHTML = `
      <div class="row">
        <button id="end-btn" class="big">End turn</button>
      </div>
    `;
    $('end-btn').onclick = () => send('endTurn', {});
  }
}

function renderMyProperties(state, mySelf, send) {
  const el = $('my-properties');
  el.innerHTML = '';
  const owned = BOARD.filter(sp => state.properties[sp.i]?.owner === mySelf);
  if (!owned.length) { el.innerHTML = '<div class="muted-text" style="font-size:12px;">No properties yet.</div>'; return; }
  for (const sp of owned) {
    const prop = state.properties[sp.i];
    const row = document.createElement('div');
    row.className = `prop-row ${prop.mortgaged ? 'mortgaged' : ''}`;
    const stripeCol = sp.type === 'prop' ? COLOR_GROUPS[sp.group].color : (sp.type === 'rr' ? '#222' : '#888');
    row.innerHTML = `
      <span class="dot" style="background:${stripeCol}"></span>
      <span class="nm">${sp.name}</span>
      <span class="meta">${prop.hotel ? '🏨' : (prop.houses > 0 ? `🏠×${prop.houses}` : '')}${prop.mortgaged ? ' · mortgaged' : ''}</span>
    `;
    const actions = document.createElement('div');
    actions.className = 'prop-actions';

    if (sp.type === 'prop') {
      const canBuild = !prop.mortgaged && !prop.hotel && ownsGroup(state, mySelf, sp.group);
      const buildBtn = document.createElement('button');
      buildBtn.textContent = prop.houses === 4 ? '+🏨' : '+🏠';
      buildBtn.disabled = !canBuild;
      buildBtn.title = `Build ($${COLOR_GROUPS[sp.group].houseCost})`;
      buildBtn.onclick = () => send('build', { spaceIndex: sp.i });
      actions.appendChild(buildBtn);

      const sellBtn = document.createElement('button');
      sellBtn.className = 'ghost';
      sellBtn.textContent = '−🏠';
      sellBtn.disabled = !(prop.houses > 0 || prop.hotel);
      sellBtn.onclick = () => send('sellHouse', { spaceIndex: sp.i });
      actions.appendChild(sellBtn);
    }

    const mortBtn = document.createElement('button');
    mortBtn.className = 'ghost';
    if (prop.mortgaged) {
      mortBtn.textContent = `Unmort $${Math.ceil(sp.mortgage * 1.1)}`;
      mortBtn.onclick = () => send('unmortgage', { spaceIndex: sp.i });
    } else {
      mortBtn.textContent = `Mort $${sp.mortgage}`;
      mortBtn.disabled = sp.type === 'prop' && (prop.houses > 0 || prop.hotel);
      mortBtn.onclick = () => send('mortgage', { spaceIndex: sp.i });
    }
    actions.appendChild(mortBtn);

    row.appendChild(actions);
    el.appendChild(row);
  }
}

function renderTradePanel(state, mySelf, send) {
  const el = $('trade-panel');
  if (!el) return;
  const others = state.players.filter(p => p.id !== mySelf && !p.bankrupt);
  if (!others.length) { el.innerHTML = '<div class="muted-text" style="font-size:12px;">No one to trade with yet.</div>'; return; }
  el.innerHTML = `
    <label>To: <select id="trade-to">${others.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</select></label>
    <div class="row tight">
      <label style="flex:1; margin:0;">You give cash<input type="number" id="offer-cash" value="0" min="0" /></label>
      <label style="flex:1; margin:0;">You want cash<input type="number" id="ask-cash" value="0" min="0" /></label>
    </div>
    <div class="trade-grid">
      <div>
        <div class="trade-sub">Your props</div>
        <div id="offer-list">${tradeListHtml(state, mySelf, 'offer')}</div>
      </div>
      <div>
        <div class="trade-sub">Their props</div>
        <div id="ask-list"></div>
      </div>
    </div>
    <button id="trade-send" style="margin-top:8px;">Send offer</button>
  `;
  const refreshAsk = () => {
    const to = $('trade-to').value;
    $('ask-list').innerHTML = tradeListHtml(state, to, 'ask');
  };
  $('trade-to').onchange = refreshAsk;
  refreshAsk();
  $('trade-send').onclick = () => {
    const to = $('trade-to').value;
    const offerCash = parseInt($('offer-cash').value, 10) || 0;
    const askCash   = parseInt($('ask-cash').value, 10) || 0;
    const offerProps = Array.from(document.querySelectorAll('#offer-list input:checked')).map(i => +i.value);
    const askProps   = Array.from(document.querySelectorAll('#ask-list   input:checked')).map(i => +i.value);
    send('proposeTrade', { to, offer: { cash: offerCash, props: offerProps }, ask: { cash: askCash, props: askProps } });
  };
}

function tradeListHtml(state, playerId, prefix) {
  const owned = BOARD.filter(sp => state.properties[sp.i]?.owner === playerId);
  if (!owned.length) return '<div class="muted-text" style="font-size:11px;">None.</div>';
  return owned.map(sp => `
    <label class="trade-item"><input type="checkbox" value="${sp.i}" name="${prefix}-${sp.i}" /> ${sp.name}</label>
  `).join('');
}

// ===== Animation diff (state -> state) =====
let lastSelf = null;
function lastLogLine(state) { return state.log[state.log.length - 1] || ''; }

async function runDiff(oldState, newState, mySelf) {
  if (!oldState) return;

  // 1. Dice roll: detect new roll
  const oldRoll = oldState.lastRoll ? oldState.lastRoll.join(',') : null;
  const newRoll = newState.lastRoll ? newState.lastRoll.join(',') : null;
  if (newRoll && newRoll !== oldRoll) {
    await anim.rollDiceAnimation($('dice-area'), newState.lastRoll[0], newState.lastRoll[1]);
    $('dice-status').textContent = diceStatusText(newState, mySelf);
  }

  // 2. Token movements
  const moves = [];
  for (const p of newState.players) {
    const oldP = oldState.players.find(x => x.id === p.id);
    if (!oldP) continue;
    if (oldP.bankrupt && !p.bankrupt) continue;
    if (oldP.pos !== p.pos) {
      const tokenEl = tokenEls.get(p.id);
      if (tokenEl) {
        moves.push(anim.hopToken(tokenEl, oldP.pos, p.pos, spaceCenter));
      }
    }
  }
  if (moves.length) await Promise.all(moves);

  // 3. Card draw popup — detect "Card: X" in newest log line
  const lastLog = lastLogLine(newState);
  if (lastLog.startsWith('Card: ')) {
    const text = lastLog.slice(6);
    // Determine deck from log context: previous line says "...landed on Chance/Community Chest."
    const prev = newState.log[newState.log.length - 2] || '';
    const deck = prev.includes('Community Chest') ? 'chest' : 'chance';
    await anim.showCard(text, deck);
  }

  // 4. Cash transfers — show fly-money between player cards
  for (const p of newState.players) {
    const oldP = oldState.players.find(x => x.id === p.id);
    if (!oldP) continue;
    const delta = p.cash - oldP.cash;
    if (delta === 0) continue;
    const card = document.querySelector(`[data-player="${p.id}"]`);
    if (!card) continue;
    if (delta > 0) anim.flyMoney(delta, card, card, '+');
    else           anim.flyMoney(-delta, card, card, '-');
  }
}

// ===== Public API =====
export function renderStatic(state, mySelf, send) {
  lastSelf = mySelf;
  buildBoardOnce();
  ensureTokenElements(state, mySelf);
  // Snap tokens to current positions (no animation) — only for those without their own position yet
  for (const p of state.players) {
    if (p.bankrupt) continue;
    const el = tokenEls.get(p.id);
    if (!el) continue;
    if (!el.dataset.posSet) {
      anim.placeToken(el, p.pos, spaceCenter);
      el.dataset.posSet = '1';
    }
  }
  renderProperties(state);
  renderPlayers(state, mySelf);
  renderTurn(state, mySelf);
  renderLog(state);
  renderDiceStatic(state);
  renderActions(state, mySelf, send);
  renderMyProperties(state, mySelf, send);
  renderTradePanel(state, mySelf, send);
}

export async function applyStateWithAnim(oldState, newState, mySelf, send) {
  buildBoardOnce();
  ensureTokenElements(newState, mySelf);
  // Run diff animations against old state, then render static for new
  await runDiff(oldState, newState, mySelf);
  // After animations, update tokens to authoritative positions
  for (const p of newState.players) {
    if (p.bankrupt) continue;
    const el = tokenEls.get(p.id);
    if (el) anim.placeToken(el, p.pos, spaceCenter);
  }
  renderStatic(newState, mySelf, send);
}

export function ensureTokensPlaced() {
  // Called on resize: re-pin tokens to new pixel positions
  for (const [pid, el] of tokenEls) {
    const idx = parseInt(el.dataset.lastIdx ?? '-1', 10);
    if (idx >= 0) anim.placeToken(el, idx, spaceCenter);
  }
}
