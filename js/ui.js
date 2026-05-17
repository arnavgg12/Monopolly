// DOM rendering. Reads state, renders board + side panels.
import { BOARD, COLOR_GROUPS } from './data.js';
import { currentPlayer, rentFor, ownsGroup } from './game.js';

const boardEl  = () => document.getElementById('board');
const playersEl = () => document.getElementById('players');
const logEl    = () => document.getElementById('log');
const actionEl = () => document.getElementById('action-panel');
const turnEl   = () => document.getElementById('turn-indicator');
const propsEl  = () => document.getElementById('my-properties');
const tradeEl  = () => document.getElementById('trade-panel');

// Board layout: 11x11 grid, spaces around the edge.
// Square indices to grid coords:
//   0 = bottom-right corner (GO)
//   1..9 = bottom row, right to left
//   10 = bottom-left corner (Jail)
//   11..19 = left column, bottom to top
//   20 = top-left corner (Free Parking)
//   21..29 = top row, left to right
//   30 = top-right corner (Go To Jail)
//   31..39 = right column, top to bottom
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

export function renderBoard(state, mySelf) {
  const el = boardEl();
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

    const name = document.createElement('div');
    name.className = 'space-name';
    name.textContent = sp.name;
    div.appendChild(name);

    if (sp.price) {
      const price = document.createElement('div');
      price.className = 'space-price';
      price.textContent = `$${sp.price}`;
      div.appendChild(price);
    }
    if (sp.type === 'chance')  div.appendChild(iconEl('?', 'chance-icon'));
    if (sp.type === 'chest')   div.appendChild(iconEl('🎁', 'chest-icon'));
    if (sp.type === 'tax')     div.appendChild(iconEl(`$${sp.amount}`, 'tax-icon'));
    if (sp.type === 'rr')      div.appendChild(iconEl('🚂', 'rr-icon'));
    if (sp.type === 'util' && sp.i === 12) div.appendChild(iconEl('💡', 'util-icon'));
    if (sp.type === 'util' && sp.i === 28) div.appendChild(iconEl('🚰', 'util-icon'));

    // Houses / hotel
    const prop = state.properties[sp.i];
    if (prop && (prop.houses > 0 || prop.hotel)) {
      const houses = document.createElement('div');
      houses.className = 'houses';
      houses.textContent = prop.hotel ? '🏨' : '🏠'.repeat(prop.houses);
      div.appendChild(houses);
    }
    if (prop && prop.owner) {
      const owner = state.players.find(p => p.id === prop.owner);
      if (owner) {
        const tag = document.createElement('div');
        tag.className = 'owner-tag';
        tag.textContent = owner.token;
        if (prop.mortgaged) tag.style.opacity = 0.4;
        div.appendChild(tag);
      }
    }

    // Tokens
    const tokens = document.createElement('div');
    tokens.className = 'tokens';
    for (const p of state.players) {
      if (p.bankrupt) continue;
      if (p.pos === sp.i) {
        const t = document.createElement('span');
        t.className = 'token';
        if (p.id === mySelf) t.classList.add('me');
        t.textContent = p.token;
        tokens.appendChild(t);
      }
    }
    div.appendChild(tokens);

    el.appendChild(div);
  }

  // Center
  const center = document.createElement('div');
  center.className = 'board-center';
  center.style.gridRow = '2 / 11';
  center.style.gridColumn = '2 / 11';
  center.innerHTML = `
    <div class="brand">PROPERTY TYCOON</div>
    <div class="dice">${state.lastRoll ? `🎲 ${state.lastRoll[0]} + ${state.lastRoll[1]}` : '—'}</div>
    <div class="who">${state.winner ? '🏆 Winner!' : currentPlayer(state) ? `${currentPlayer(state).token} ${currentPlayer(state).name}` : ''}</div>
  `;
  el.appendChild(center);
}

function iconEl(text, cls) {
  const d = document.createElement('div');
  d.className = `space-icon ${cls}`;
  d.textContent = text;
  return d;
}

export function renderPlayers(state, mySelf) {
  const el = playersEl();
  el.innerHTML = '';
  for (const p of state.players) {
    const card = document.createElement('div');
    card.className = `player-card ${p.bankrupt ? 'bankrupt' : ''} ${currentPlayer(state)?.id === p.id ? 'turn' : ''}`;
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

export function renderTurn(state, mySelf) {
  const cp = currentPlayer(state);
  const t = turnEl();
  if (state.winner) {
    const w = state.players.find(p => p.id === state.winner);
    t.textContent = `🏆 ${w?.name || 'Winner'} won!`;
    return;
  }
  if (!cp) { t.textContent = ''; return; }
  t.textContent = (cp.id === mySelf)
    ? `Your turn (${state.phase})`
    : `${cp.name}'s turn (${state.phase})`;
}

export function renderLog(state) {
  const el = logEl();
  el.innerHTML = '';
  for (const line of state.log.slice(-50)) {
    const d = document.createElement('div');
    d.className = 'log-line';
    d.textContent = line;
    el.appendChild(d);
  }
  el.scrollTop = el.scrollHeight;
}

export function renderActions(state, mySelf, send) {
  const el = actionEl();
  el.innerHTML = '';
  const cp = currentPlayer(state);
  const me = state.players.find(p => p.id === mySelf);

  // Auction (anyone can bid)
  if (state.pendingAuction) {
    const sp = BOARD[state.pendingAuction.spaceIndex];
    el.innerHTML = `
      <div class="ah">Auction: ${sp.name}</div>
      <div>High bid: $${state.pendingAuction.currentBid} ${state.pendingAuction.highBidder ? `(${state.players.find(p => p.id === state.pendingAuction.highBidder)?.name})` : ''}</div>
      <div class="row">
        <input type="number" id="bid-input" placeholder="Your bid" min="${state.pendingAuction.currentBid + 1}" />
        <button id="bid-btn">Bid</button>
        <button id="pass-btn" class="ghost">Pass</button>
      </div>
    `;
    document.getElementById('bid-btn').onclick = () => {
      const v = parseInt(document.getElementById('bid-input').value, 10);
      if (!isNaN(v)) send('bid', { amount: v });
    };
    document.getElementById('pass-btn').onclick = () => send('passAuction', {});
    return;
  }

  // Trade response (the target player can accept/decline)
  if (state.pendingTrade && state.pendingTrade.to === mySelf) {
    const from = state.players.find(p => p.id === state.pendingTrade.from);
    const offer = state.pendingTrade.offer, ask = state.pendingTrade.ask;
    el.innerHTML = `
      <div class="ah">Trade offer from ${from.name}</div>
      <div>They give: $${offer.cash} + ${offer.props.map(i => BOARD[i].name).join(', ') || '—'}</div>
      <div>They ask: $${ask.cash} + ${ask.props.map(i => BOARD[i].name).join(', ') || '—'}</div>
      <div class="row">
        <button id="trade-accept">Accept</button>
        <button id="trade-decline" class="ghost">Decline</button>
      </div>
    `;
    document.getElementById('trade-accept').onclick  = () => send('respondTrade', { accept: true });
    document.getElementById('trade-decline').onclick = () => send('respondTrade', { accept: false });
    return;
  }

  if (state.winner) {
    el.innerHTML = `<div class="ah">Game over.</div>`;
    return;
  }

  if (!cp || cp.id !== mySelf) {
    el.innerHTML = `<div class="muted">Waiting for ${cp?.name || '...'}.</div>`;
    return;
  }

  // My turn
  if (state.phase === 'roll') {
    if (me.inJail) {
      el.innerHTML = `
        <div class="ah">You're in Jail (turn ${me.jailTurns + 1}/3)</div>
        <div class="row">
          <button id="roll-btn">Roll for doubles</button>
          <button id="pay-jail-btn" ${me.cash < 50 ? 'disabled' : ''}>Pay $50</button>
          <button id="card-jail-btn" ${me.jailCards <= 0 ? 'disabled' : ''}>Use card</button>
        </div>
      `;
      document.getElementById('roll-btn').onclick      = () => send('roll', {});
      document.getElementById('pay-jail-btn').onclick  = () => send('payJail', {});
      document.getElementById('card-jail-btn').onclick = () => send('useJailCard', {});
    } else {
      el.innerHTML = `
        <div class="row">
          <button id="roll-btn" class="big">🎲 Roll Dice</button>
        </div>
      `;
      document.getElementById('roll-btn').onclick = () => send('roll', {});
    }
  } else if (state.phase === 'action' && state.pendingPurchase) {
    const sp = BOARD[state.pendingPurchase.spaceIndex];
    el.innerHTML = `
      <div class="ah">${sp.name} — $${sp.price}</div>
      <div class="row">
        <button id="buy-btn" ${me.cash < sp.price ? 'disabled' : ''}>Buy for $${sp.price}</button>
        <button id="auction-btn" class="ghost">Auction it</button>
      </div>
    `;
    document.getElementById('buy-btn').onclick     = () => send('buy', {});
    document.getElementById('auction-btn').onclick = () => send('decline', {});
  } else if (state.phase === 'end') {
    el.innerHTML = `
      <div class="row">
        <button id="end-btn" class="big">End turn</button>
      </div>
    `;
    document.getElementById('end-btn').onclick = () => send('endTurn', {});
  }
}

export function renderMyProperties(state, mySelf, send) {
  const el = propsEl();
  el.innerHTML = '';
  const owned = BOARD.filter(sp => state.properties[sp.i]?.owner === mySelf);
  if (!owned.length) { el.innerHTML = '<div class="muted">No properties.</div>'; return; }
  for (const sp of owned) {
    const prop = state.properties[sp.i];
    const row = document.createElement('div');
    row.className = 'prop-row';
    const stripeCol = sp.type === 'prop' ? COLOR_GROUPS[sp.group].color : (sp.type === 'rr' ? '#333' : '#999');
    row.innerHTML = `
      <span class="dot" style="background:${stripeCol}"></span>
      <span class="nm">${sp.name}${prop.mortgaged ? ' (mortgaged)' : ''}</span>
      ${prop.hotel ? '🏨' : '🏠'.repeat(prop.houses)}
    `;
    const actions = document.createElement('div');
    actions.className = 'prop-actions';

    if (sp.type === 'prop') {
      const canBuild = !prop.mortgaged && !prop.hotel && ownsGroup(state, mySelf, sp.group);
      const buildBtn = document.createElement('button');
      buildBtn.textContent = prop.houses === 4 ? '🏨' : '+🏠';
      buildBtn.disabled = !canBuild;
      buildBtn.title = `Build ($${COLOR_GROUPS[sp.group].houseCost})`;
      buildBtn.onclick = () => send('build', { spaceIndex: sp.i });
      actions.appendChild(buildBtn);

      const sellBtn = document.createElement('button');
      sellBtn.textContent = '-🏠';
      sellBtn.disabled = !(prop.houses > 0 || prop.hotel);
      sellBtn.onclick = () => send('sellHouse', { spaceIndex: sp.i });
      actions.appendChild(sellBtn);
    }

    const mortBtn = document.createElement('button');
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

export function renderTradePanel(state, mySelf, send) {
  const el = tradeEl();
  if (!el) return;
  // Compose trade UI: choose a target, choose cash + props each way
  const others = state.players.filter(p => p.id !== mySelf && !p.bankrupt);
  if (!others.length) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="ah">Propose a trade</div>
    <label>To: <select id="trade-to">${others.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</select></label>
    <label>You give cash: <input type="number" id="offer-cash" value="0" min="0" /></label>
    <label>You want cash: <input type="number" id="ask-cash" value="0" min="0" /></label>
    <div class="trade-grid">
      <div>
        <div class="trade-sub">Your properties</div>
        <div id="offer-list">${tradeList(state, mySelf, 'offer')}</div>
      </div>
      <div>
        <div class="trade-sub">Their properties</div>
        <div id="ask-list"></div>
      </div>
    </div>
    <button id="trade-send">Send offer</button>
  `;
  const refreshAsk = () => {
    const to = document.getElementById('trade-to').value;
    document.getElementById('ask-list').innerHTML = tradeList(state, to, 'ask');
  };
  document.getElementById('trade-to').onchange = refreshAsk;
  refreshAsk();
  document.getElementById('trade-send').onclick = () => {
    const to = document.getElementById('trade-to').value;
    const offerCash = parseInt(document.getElementById('offer-cash').value, 10) || 0;
    const askCash   = parseInt(document.getElementById('ask-cash').value, 10) || 0;
    const offerProps = Array.from(document.querySelectorAll('#offer-list input:checked')).map(i => +i.value);
    const askProps   = Array.from(document.querySelectorAll('#ask-list   input:checked')).map(i => +i.value);
    send('proposeTrade', { to, offer: { cash: offerCash, props: offerProps }, ask: { cash: askCash, props: askProps } });
  };
}

function tradeList(state, playerId, prefix) {
  const owned = BOARD.filter(sp => state.properties[sp.i]?.owner === playerId);
  if (!owned.length) return '<div class="muted">None.</div>';
  return owned.map(sp => `
    <label class="trade-item"><input type="checkbox" value="${sp.i}" name="${prefix}-${sp.i}" /> ${sp.name}</label>
  `).join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function renderAll(state, mySelf, send) {
  renderBoard(state, mySelf);
  renderPlayers(state, mySelf);
  renderTurn(state, mySelf);
  renderLog(state);
  renderActions(state, mySelf, send);
  renderMyProperties(state, mySelf, send);
  renderTradePanel(state, mySelf, send);
}
