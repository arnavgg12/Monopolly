// Pure game-state engine. No DOM, no network. Host runs this and broadcasts state.
// Every public method that mutates state returns the new state (and a log line array).
import {
  BOARD, COLOR_GROUPS, CHANCE_CARDS, CHEST_CARDS,
  STARTING_CASH, PASS_GO, JAIL_FEE, JAIL_INDEX, GO_TO_JAIL_INDEX, MAX_JAIL_TURNS, TOKENS,
} from './data.js';

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createInitialState(playerList, opts = {}) {
  // playerList: [{ id, name, token? }]
  const startingCash = opts.startingCash ?? STARTING_CASH;
  const usedTokens = new Set();
  const players = playerList.map((p, idx) => {
    let token = p.token;
    if (!token || usedTokens.has(token)) {
      token = TOKENS.find(t => !usedTokens.has(t)) || TOKENS[idx % TOKENS.length];
    }
    usedTokens.add(token);
    return {
      id: p.id,
      name: p.name,
      token,
      cash: startingCash,
      pos: 0,
      inJail: false,
      jailTurns: 0,
      jailCards: 0,
      bankrupt: false,
      order: idx,
    };
  });

  // properties keyed by board index
  const properties = {};
  BOARD.forEach((sp) => {
    if (sp.type === 'prop' || sp.type === 'rr' || sp.type === 'util') {
      properties[sp.i] = { owner: null, houses: 0, hotel: false, mortgaged: false };
    }
  });

  return {
    players,
    properties,
    turn: 0,                // index into players array
    phase: 'roll',          // roll | action | end | gameover
    lastRoll: null,         // [d1, d2]
    doublesCount: 0,
    chanceDeck: shuffle([...CHANCE_CARDS.keys()]),
    chestDeck: shuffle([...CHEST_CARDS.keys()]),
    pendingPurchase: null,  // { spaceIndex } if landed on unowned property
    pendingRent: null,      // { from, to, amount } not used (rent is auto)
    pendingAuction: null,   // { spaceIndex, currentBid, highBidder, passes:[] }
    pendingTrade: null,     // { from, to, offer:{cash, props[]}, ask:{cash, props[]} }
    log: ['Game started.'],
    winner: null,
  };
}

// ---------- helpers ----------
export function currentPlayer(state) { return state.players[state.turn]; }
export function playerById(state, id) { return state.players.find(p => p.id === id); }
export function activePlayers(state) { return state.players.filter(p => !p.bankrupt); }
export function nextTurnIndex(state) {
  let n = state.turn;
  for (let i = 0; i < state.players.length; i++) {
    n = (n + 1) % state.players.length;
    if (!state.players[n].bankrupt) return n;
  }
  return state.turn;
}

export function ownsGroup(state, playerId, group) {
  const owned = BOARD.filter(s => s.type === 'prop' && s.group === group)
    .every(s => state.properties[s.i].owner === playerId);
  return owned;
}

export function railroadsOwned(state, playerId) {
  return BOARD.filter(s => s.type === 'rr' && state.properties[s.i].owner === playerId).length;
}
export function utilitiesOwned(state, playerId) {
  return BOARD.filter(s => s.type === 'util' && state.properties[s.i].owner === playerId).length;
}

export function rentFor(state, spaceIndex, diceTotal) {
  const sp = BOARD[spaceIndex];
  const prop = state.properties[spaceIndex];
  if (!prop || !prop.owner || prop.mortgaged) return 0;
  if (sp.type === 'prop') {
    if (prop.hotel) return sp.rent[5];
    if (prop.houses > 0) return sp.rent[prop.houses];
    // No houses: doubled if owner has the whole group
    return ownsGroup(state, prop.owner, sp.group) ? sp.rent[0] * 2 : sp.rent[0];
  }
  if (sp.type === 'rr') {
    const n = railroadsOwned(state, prop.owner);
    return [0, 25, 50, 100, 200][n];
  }
  if (sp.type === 'util') {
    const n = utilitiesOwned(state, prop.owner);
    return diceTotal * (n === 2 ? 10 : 4);
  }
  return 0;
}

export function netWorth(state, playerId) {
  const p = playerById(state, playerId);
  if (!p) return 0;
  let total = p.cash;
  for (const sp of BOARD) {
    const prop = state.properties[sp.i];
    if (!prop || prop.owner !== playerId) continue;
    total += prop.mortgaged ? Math.floor(sp.mortgage / 1) : sp.price;
    if (sp.type === 'prop') {
      const houseCost = COLOR_GROUPS[sp.group].houseCost;
      const houses = prop.hotel ? 5 : prop.houses;
      total += Math.floor(houses * houseCost / 2);
    }
  }
  return total;
}

// ---------- actions (mutate state directly) ----------
function log(state, line) {
  state.log.push(line);
  if (state.log.length > 200) state.log.shift();
}

export function rollDice(state) {
  if (state.phase !== 'roll') return false;
  const p = currentPlayer(state);
  if (p.bankrupt) { endTurn(state); return true; }
  const d1 = 1 + Math.floor(Math.random() * 6);
  const d2 = 1 + Math.floor(Math.random() * 6);
  state.lastRoll = [d1, d2];
  const isDoubles = d1 === d2;
  log(state, `${p.name} rolled ${d1} + ${d2}` + (isDoubles ? ' (doubles)' : '') + '.');

  if (p.inJail) {
    if (isDoubles) {
      p.inJail = false; p.jailTurns = 0;
      log(state, `${p.name} rolls doubles and leaves Jail.`);
      movePlayer(state, p, d1 + d2, false);
      state.phase = 'end';
    } else {
      p.jailTurns += 1;
      if (p.jailTurns >= MAX_JAIL_TURNS) {
        log(state, `${p.name} served 3 turns in Jail, must pay $50.`);
        chargeOrBankrupt(state, p, JAIL_FEE, null);
        p.inJail = false; p.jailTurns = 0;
        movePlayer(state, p, d1 + d2, false);
      } else {
        log(state, `${p.name} stays in Jail.`);
      }
      state.phase = 'end';
    }
    state.doublesCount = 0;
    return true;
  }

  if (isDoubles) {
    state.doublesCount += 1;
    if (state.doublesCount === 3) {
      log(state, `${p.name} rolled 3 doubles — Go to Jail!`);
      sendToJail(state, p);
      state.phase = 'end';
      return true;
    }
  } else {
    state.doublesCount = 0;
  }

  movePlayer(state, p, d1 + d2, true);
  return true;
}

function movePlayer(state, p, n, allowDoublesRoll) {
  const old = p.pos;
  p.pos = (p.pos + n) % 40;
  if (p.pos < old && n > 0) {
    p.cash += PASS_GO;
    log(state, `${p.name} passed GO, collected $${PASS_GO}.`);
  }
  resolveLanding(state, p, n, allowDoublesRoll);
}

function resolveLanding(state, p, diceTotal, allowDoublesRoll) {
  const sp = BOARD[p.pos];
  log(state, `${p.name} landed on ${sp.name}.`);
  switch (sp.type) {
    case 'go':
    case 'jail':
    case 'parking':
      state.phase = allowDoublesRoll && state.doublesCount > 0 ? 'roll' : 'end';
      return;
    case 'gotojail':
      sendToJail(state, p);
      state.phase = 'end';
      return;
    case 'tax':
      chargeOrBankrupt(state, p, sp.amount, null);
      state.phase = allowDoublesRoll && state.doublesCount > 0 ? 'roll' : 'end';
      return;
    case 'chance':
      drawCard(state, p, 'chance', diceTotal, allowDoublesRoll);
      return;
    case 'chest':
      drawCard(state, p, 'chest', diceTotal, allowDoublesRoll);
      return;
    case 'prop':
    case 'rr':
    case 'util': {
      const prop = state.properties[p.pos];
      if (!prop.owner) {
        state.pendingPurchase = { spaceIndex: p.pos };
        state.phase = 'action';
      } else if (prop.owner === p.id) {
        state.phase = allowDoublesRoll && state.doublesCount > 0 ? 'roll' : 'end';
      } else if (prop.mortgaged) {
        log(state, `${BOARD[p.pos].name} is mortgaged — no rent.`);
        state.phase = allowDoublesRoll && state.doublesCount > 0 ? 'roll' : 'end';
      } else {
        const owner = playerById(state, prop.owner);
        const amount = rentFor(state, p.pos, diceTotal);
        log(state, `${p.name} pays ${owner.name} $${amount} rent.`);
        chargeOrBankrupt(state, p, amount, owner);
        state.phase = allowDoublesRoll && state.doublesCount > 0 ? 'roll' : 'end';
      }
      return;
    }
  }
}

function sendToJail(state, p) {
  p.pos = JAIL_INDEX;
  p.inJail = true;
  p.jailTurns = 0;
  state.doublesCount = 0;
  log(state, `${p.name} is sent to Jail.`);
}

function chargeOrBankrupt(state, p, amount, creditor) {
  if (p.cash >= amount) {
    p.cash -= amount;
    if (creditor) creditor.cash += amount;
    return;
  }
  // Insufficient cash — block on a pending payment so player can raise funds.
  if (netWorth(state, p.id) < amount) {
    log(state, `${p.name} cannot pay $${amount} and is bankrupt.`);
    bankruptPlayer(state, p, creditor);
    return;
  }
  state.pendingPayment = { playerId: p.id, amount, creditorId: creditor ? creditor.id : null };
  log(state, `${p.name} owes $${amount} but only has $${p.cash}. Raise funds or declare bankruptcy.`);
}

// Auto-math: figure out a plan that raises `needed` cash via mortgages + house sales.
// Returns { ok, plan: [{kind, spaceIndex, gain}], totalGain }
export function planRaiseCash(state, playerId, needed) {
  const p = playerById(state, playerId);
  if (!p) return { ok: false, plan: [], totalGain: 0 };
  let shortfall = needed - p.cash;
  if (shortfall <= 0) return { ok: true, plan: [], totalGain: 0 };

  // Shallow per-property simulation so we don't touch real state.
  const sim = {};
  for (const k in state.properties) sim[k] = { ...state.properties[k] };
  const plan = [];
  let gained = 0;

  const findMortgageable = () => BOARD
    .filter(sp => sim[sp.i] && sim[sp.i].owner === playerId && !sim[sp.i].mortgaged)
    .filter(sp => !(sp.type === 'prop' && (sim[sp.i].houses > 0 || sim[sp.i].hotel)))
    .sort((a, b) => a.mortgage - b.mortgage);

  // Step 1: mortgage unbuilt properties from cheapest up.
  for (const sp of findMortgageable()) {
    if (shortfall <= 0) break;
    sim[sp.i].mortgaged = true;
    plan.push({ kind: 'mortgage', spaceIndex: sp.i, gain: sp.mortgage });
    shortfall -= sp.mortgage;
    gained   += sp.mortgage;
  }

  // Step 2: sell houses/hotels respecting even-sell, cheapest house-cost group first.
  while (shortfall > 0) {
    const candidates = BOARD
      .filter(sp => sp.type === 'prop' && sim[sp.i]?.owner === playerId
                && (sim[sp.i].houses > 0 || sim[sp.i].hotel))
      .filter(sp => {
        const prop = sim[sp.i];
        const myCount = prop.hotel ? 5 : prop.houses;
        const groupSpaces = BOARD.filter(s => s.type === 'prop' && s.group === sp.group);
        return groupSpaces.every(g => {
          const gp = sim[g.i];
          const gCount = gp.hotel ? 5 : gp.houses;
          return myCount >= gCount;
        });
      })
      .sort((a, b) => COLOR_GROUPS[a.group].houseCost - COLOR_GROUPS[b.group].houseCost);
    if (!candidates.length) break;
    const sp = candidates[0];
    const refund = Math.floor(COLOR_GROUPS[sp.group].houseCost / 2);
    if (sim[sp.i].hotel) { sim[sp.i].hotel = false; sim[sp.i].houses = 4; }
    else sim[sp.i].houses -= 1;
    plan.push({ kind: 'sellHouse', spaceIndex: sp.i, gain: refund });
    shortfall -= refund;
    gained   += refund;
  }

  // Step 3: mortgage anything that's now houseless.
  for (const sp of findMortgageable()) {
    if (shortfall <= 0) break;
    sim[sp.i].mortgaged = true;
    plan.push({ kind: 'mortgage', spaceIndex: sp.i, gain: sp.mortgage });
    shortfall -= sp.mortgage;
    gained   += sp.mortgage;
  }

  return { ok: shortfall <= 0, plan, totalGain: gained };
}

export function executeRaisePlan(state, playerId, needed) {
  const { ok, plan } = planRaiseCash(state, playerId, needed);
  for (const a of plan) {
    if (a.kind === 'mortgage')  mortgage(state, playerId, a.spaceIndex);
    if (a.kind === 'sellHouse') sellHouse(state, playerId, a.spaceIndex);
  }
  return ok;
}

// Try to settle a pendingPayment if the player now has enough cash. Called after
// any mortgage/sell/etc. so the UI never gets stuck.
function tryCompletePayment(state) {
  const pp = state.pendingPayment;
  if (!pp) return;
  const p = playerById(state, pp.playerId);
  if (!p) { state.pendingPayment = null; return; }
  if (p.cash >= pp.amount) {
    p.cash -= pp.amount;
    if (pp.creditorId) {
      const c = playerById(state, pp.creditorId);
      if (c) c.cash += pp.amount;
    }
    log(state, `${p.name} paid $${pp.amount}.`);
    state.pendingPayment = null;
  }
}

export function settlePending(state, playerId) {
  // Player-initiated: try to auto-raise, then settle.
  const pp = state.pendingPayment;
  if (!pp || pp.playerId !== playerId) return false;
  executeRaisePlan(state, playerId, pp.amount);
  tryCompletePayment(state);
  return true;
}

export function declareBankruptcy(state, playerId) {
  const pp = state.pendingPayment;
  if (!pp || pp.playerId !== playerId) return false;
  const p = playerById(state, playerId);
  const creditor = pp.creditorId ? playerById(state, pp.creditorId) : null;
  log(state, `${p.name} declares bankruptcy.`);
  bankruptPlayer(state, p, creditor);
  state.pendingPayment = null;
  // Advance turn if the bankrupt player was current.
  if (state.phase !== 'gameover' && currentPlayer(state).id === playerId) {
    state.phase = 'end';
  }
  return true;
}

function bankruptPlayer(state, p, creditor) {
  p.bankrupt = true;
  // Transfer holdings
  for (const sp of BOARD) {
    const prop = state.properties[sp.i];
    if (!prop || prop.owner !== p.id) continue;
    if (creditor) {
      prop.owner = creditor.id;
    } else {
      prop.owner = null;
      prop.houses = 0;
      prop.hotel = false;
      prop.mortgaged = false;
    }
  }
  if (creditor) creditor.cash += p.cash;
  p.cash = 0;
  // Check win
  const remaining = activePlayers(state);
  if (remaining.length === 1) {
    state.phase = 'gameover';
    state.winner = remaining[0].id;
    log(state, `${remaining[0].name} wins the game!`);
  }
}

function drawCard(state, p, deckName, diceTotal, allowDoublesRoll) {
  const deck = deckName === 'chance' ? state.chanceDeck : state.chestDeck;
  const cards = deckName === 'chance' ? CHANCE_CARDS : CHEST_CARDS;
  const idx = deck.shift();
  deck.push(idx);
  const card = cards[idx];
  log(state, `Card: ${card.text}`);
  applyCard(state, p, card, diceTotal, allowDoublesRoll);
}

function applyCard(state, p, card, diceTotal, allowDoublesRoll) {
  const endPhaseDefault = allowDoublesRoll && state.doublesCount > 0 ? 'roll' : 'end';
  switch (card.kind) {
    case 'collect':
      p.cash += card.amount;
      state.phase = endPhaseDefault;
      return;
    case 'pay':
      chargeOrBankrupt(state, p, card.amount, null);
      state.phase = endPhaseDefault;
      return;
    case 'payEach':
      for (const op of state.players) {
        if (op.id === p.id || op.bankrupt) continue;
        chargeOrBankrupt(state, p, card.amount, op);
      }
      state.phase = endPhaseDefault;
      return;
    case 'collectEach':
      for (const op of state.players) {
        if (op.id === p.id || op.bankrupt) continue;
        chargeOrBankrupt(state, op, card.amount, p);
      }
      state.phase = endPhaseDefault;
      return;
    case 'jailFree':
      p.jailCards += 1;
      state.phase = endPhaseDefault;
      return;
    case 'gotoJail':
      sendToJail(state, p);
      state.phase = 'end';
      return;
    case 'moveTo': {
      if (card.to < p.pos) { p.cash += PASS_GO; log(state, `${p.name} passed GO, collected $${PASS_GO}.`); }
      p.pos = card.to;
      resolveLanding(state, p, diceTotal, allowDoublesRoll);
      return;
    }
    case 'backThree': {
      p.pos = (p.pos - 3 + 40) % 40;
      resolveLanding(state, p, diceTotal, allowDoublesRoll);
      return;
    }
    case 'moveNearest': {
      const targets = BOARD.filter(s => s.type === card.target).map(s => s.i);
      let dest = targets.find(t => t > p.pos);
      if (dest === undefined) { dest = targets[0]; p.cash += PASS_GO; log(state, `${p.name} passed GO, collected $${PASS_GO}.`); }
      p.pos = dest;
      // Special rents handled by resolveLanding using diceTotal; double rent for rr handled in rentFor (we approximate by passing a marker)
      // We pass diceTotal as-is. For "pay 10x" utility, we'd need to override — simplification: standard utility rule applies on the 4x/10x ladder.
      resolveLanding(state, p, diceTotal, allowDoublesRoll);
      return;
    }
    case 'repairs': {
      let houses = 0, hotels = 0;
      for (const sp of BOARD) {
        const prop = state.properties[sp.i];
        if (!prop || prop.owner !== p.id || sp.type !== 'prop') continue;
        if (prop.hotel) hotels++; else houses += prop.houses;
      }
      const due = houses * card.perHouse + hotels * card.perHotel;
      if (due > 0) {
        log(state, `${p.name} owes $${due} in repairs.`);
        chargeOrBankrupt(state, p, due, null);
      }
      state.phase = endPhaseDefault;
      return;
    }
  }
}

// ---------- pending purchase / auction ----------
export function buyPending(state) {
  if (!state.pendingPurchase) return false;
  const p = currentPlayer(state);
  const sp = BOARD[state.pendingPurchase.spaceIndex];
  if (p.cash < sp.price) {
    log(state, `${p.name} cannot afford $${sp.price}.`);
    return false;
  }
  p.cash -= sp.price;
  state.properties[sp.i].owner = p.id;
  log(state, `${p.name} bought ${sp.name} for $${sp.price}.`);
  state.pendingPurchase = null;
  state.phase = state.doublesCount > 0 && !p.inJail ? 'roll' : 'end';
  return true;
}

export function declinePending(state) {
  if (!state.pendingPurchase) return false;
  const sp = BOARD[state.pendingPurchase.spaceIndex];
  log(state, `${currentPlayer(state).name} declined ${sp.name}. Auction starts.`);
  state.pendingAuction = {
    spaceIndex: sp.i,
    currentBid: 0,
    highBidder: null,
    passes: [],
  };
  state.pendingPurchase = null;
  return true;
}

export function placeBid(state, playerId, amount) {
  const a = state.pendingAuction;
  if (!a) return false;
  if (amount <= a.currentBid) return false;
  const p = playerById(state, playerId);
  if (!p || p.bankrupt || p.cash < amount) return false;
  a.currentBid = amount;
  a.highBidder = playerId;
  a.passes = a.passes.filter(id => id !== playerId);
  log(state, `${p.name} bids $${amount}.`);
  return true;
}

export function passAuction(state, playerId) {
  const a = state.pendingAuction;
  if (!a) return false;
  if (!a.passes.includes(playerId)) a.passes.push(playerId);
  const active = activePlayers(state).map(p => p.id);
  const stillIn = active.filter(id => !a.passes.includes(id) || id === a.highBidder);
  if (stillIn.length <= 1 || a.passes.length >= active.length - (a.highBidder ? 1 : 0)) {
    if (a.highBidder) {
      const winner = playerById(state, a.highBidder);
      winner.cash -= a.currentBid;
      state.properties[a.spaceIndex].owner = winner.id;
      log(state, `${winner.name} won the auction for ${BOARD[a.spaceIndex].name} at $${a.currentBid}.`);
    } else {
      log(state, `No bids on ${BOARD[a.spaceIndex].name}. It stays with the bank.`);
    }
    state.pendingAuction = null;
    state.phase = state.doublesCount > 0 && !currentPlayer(state).inJail ? 'roll' : 'end';
  }
  return true;
}

// ---------- jail actions on your turn ----------
export function payJail(state) {
  const p = currentPlayer(state);
  if (!p.inJail || state.phase !== 'roll') return false;
  if (p.cash < JAIL_FEE) return false;
  p.cash -= JAIL_FEE;
  p.inJail = false; p.jailTurns = 0;
  log(state, `${p.name} paid $50 to leave Jail.`);
  return true;
}
export function useJailCard(state) {
  const p = currentPlayer(state);
  if (!p.inJail || state.phase !== 'roll' || p.jailCards <= 0) return false;
  p.jailCards -= 1;
  p.inJail = false; p.jailTurns = 0;
  log(state, `${p.name} used a Get Out of Jail Free card.`);
  return true;
}

// ---------- houses / hotels ----------
export function canBuildOn(state, playerId, spaceIndex) {
  const sp = BOARD[spaceIndex];
  if (sp.type !== 'prop') return false;
  const prop = state.properties[spaceIndex];
  if (prop.owner !== playerId || prop.mortgaged) return false;
  if (!ownsGroup(state, playerId, sp.group)) return false;
  if (prop.hotel) return false;
  // Even-build rule: all in group must be within 1 of each other
  const groupSpaces = BOARD.filter(s => s.type === 'prop' && s.group === sp.group);
  for (const g of groupSpaces) {
    const gp = state.properties[g.i];
    if (gp.mortgaged) return false;
    const myCount = prop.hotel ? 5 : prop.houses;
    const gCount  = gp.hotel ? 5 : gp.houses;
    if (myCount > gCount) return false;
  }
  const houseCost = COLOR_GROUPS[sp.group].houseCost;
  const player = playerById(state, playerId);
  if (player.cash < houseCost) return false;
  return true;
}

export function buildHouse(state, playerId, spaceIndex) {
  if (!canBuildOn(state, playerId, spaceIndex)) return false;
  const sp = BOARD[spaceIndex];
  const prop = state.properties[spaceIndex];
  const p = playerById(state, playerId);
  const houseCost = COLOR_GROUPS[sp.group].houseCost;
  p.cash -= houseCost;
  if (prop.houses === 4) { prop.houses = 0; prop.hotel = true; log(state, `${p.name} built a hotel on ${sp.name}.`); }
  else { prop.houses += 1; log(state, `${p.name} built a house on ${sp.name}.`); }
  return true;
}

export function sellHouse(state, playerId, spaceIndex) {
  const sp = BOARD[spaceIndex];
  if (sp.type !== 'prop') return false;
  const prop = state.properties[spaceIndex];
  if (prop.owner !== playerId) return false;
  if (!prop.hotel && prop.houses === 0) return false;
  // Even-sell: my count must be >= other props in group
  const groupSpaces = BOARD.filter(s => s.type === 'prop' && s.group === sp.group);
  for (const g of groupSpaces) {
    const gp = state.properties[g.i];
    const myCount = prop.hotel ? 5 : prop.houses;
    const gCount  = gp.hotel ? 5 : gp.houses;
    if (myCount < gCount) return false;
  }
  const houseCost = COLOR_GROUPS[sp.group].houseCost;
  const refund = Math.floor(houseCost / 2);
  const p = playerById(state, playerId);
  p.cash += refund;
  if (prop.hotel) { prop.hotel = false; prop.houses = 4; log(state, `${p.name} sold the hotel on ${sp.name} for $${refund}.`); }
  else { prop.houses -= 1; log(state, `${p.name} sold a house on ${sp.name} for $${refund}.`); }
  tryCompletePayment(state);
  return true;
}

export function mortgage(state, playerId, spaceIndex) {
  const sp = BOARD[spaceIndex];
  const prop = state.properties[spaceIndex];
  if (!prop || prop.owner !== playerId || prop.mortgaged) return false;
  if (sp.type === 'prop' && (prop.houses > 0 || prop.hotel)) return false;
  prop.mortgaged = true;
  const p = playerById(state, playerId);
  p.cash += sp.mortgage;
  log(state, `${p.name} mortgaged ${sp.name} for $${sp.mortgage}.`);
  tryCompletePayment(state);
  return true;
}

export function unmortgage(state, playerId, spaceIndex) {
  const sp = BOARD[spaceIndex];
  const prop = state.properties[spaceIndex];
  if (!prop || prop.owner !== playerId || !prop.mortgaged) return false;
  const cost = Math.ceil(sp.mortgage * 1.1);
  const p = playerById(state, playerId);
  if (p.cash < cost) return false;
  p.cash -= cost;
  prop.mortgaged = false;
  log(state, `${p.name} unmortgaged ${sp.name} for $${cost}.`);
  return true;
}

// ---------- trades ----------
export function proposeTrade(state, fromId, toId, offer, ask) {
  // offer / ask: { cash:Number, props:[spaceIndex] }
  if (state.pendingTrade) return false;
  if (fromId === toId) return false;
  state.pendingTrade = { from: fromId, to: toId, offer, ask };
  const from = playerById(state, fromId), to = playerById(state, toId);
  log(state, `${from.name} proposed a trade to ${to.name}.`);
  return true;
}
export function respondTrade(state, accept) {
  const t = state.pendingTrade;
  if (!t) return false;
  if (accept) {
    const a = playerById(state, t.from), b = playerById(state, t.to);
    if (a.cash < t.offer.cash || b.cash < t.ask.cash) { state.pendingTrade = null; return false; }
    for (const i of t.offer.props) if (state.properties[i].owner !== a.id) { state.pendingTrade = null; return false; }
    for (const i of t.ask.props)   if (state.properties[i].owner !== b.id) { state.pendingTrade = null; return false; }
    a.cash -= t.offer.cash; b.cash += t.offer.cash;
    b.cash -= t.ask.cash;   a.cash += t.ask.cash;
    for (const i of t.offer.props) state.properties[i].owner = b.id;
    for (const i of t.ask.props)   state.properties[i].owner = a.id;
    log(state, `Trade accepted between ${a.name} and ${b.name}.`);
  } else {
    log(state, 'Trade declined.');
  }
  state.pendingTrade = null;
  return true;
}

// ---------- end turn ----------
export function endTurn(state) {
  if (state.phase !== 'end') return false;
  state.turn = nextTurnIndex(state);
  state.phase = 'roll';
  state.doublesCount = 0;
  state.lastRoll = null;
  log(state, `${currentPlayer(state).name}'s turn.`);
  return true;
}
