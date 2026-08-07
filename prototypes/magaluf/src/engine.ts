/**
 * The rules engine: turn, phase, day and weekend orchestration.
 *
 * Moves mutate the state in place and return it. That is deliberate rather
 * than lazy — boardgame.io hands each move an immer draft to mutate, so
 * mutating moves are the exact shape the port needs. The purity that matters
 * is elsewhere: no I/O, no clocks, no `Math.random()`, and the RNG's position
 * lives in the state tree, so a game is fully reproducible from its seed.
 */

import type { EventId, ItemId } from './cards.ts';
import { DAY_IDS, ITEMS, PHASE_IDS } from './cards.ts';
import type { Config } from './config.ts';
import { resolveJump } from './balconing.ts';
import { resolveEvent } from './events.ts';
import type { Random } from './rng.ts';
import { createRandom } from './rng.ts';
import type { GameState, PlayerState } from './state.ts';
import {
  addIntox,
  addResaca,
  bankRound,
  buildDeck,
  consumeAlcohol,
  drawAlcohol,
  drawEvent,
  emptyStats,
  gainVP,
  leavePhase,
  log,
  partying,
  phaseConfig,
  removeItem,
} from './state.ts';

export type Action =
  | { type: 'drink' }
  | { type: 'withdraw' }
  | { type: 'useItem'; item: ItemId };

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function createGame(config: Config, seed: number, names?: string[]): GameState {
  const players: PlayerState[] = [];
  for (let i = 0; i < config.playerCount; i++) {
    players.push({
      id: i,
      name: names?.[i] ?? `P${i + 1}`,
      intox: 0,
      resaca: 0,
      bankedVP: 0,
      roundVP: 0,
      items: [],
      status: 'partying',
      drinksThisPhase: 0,
      skipNextTurn: false,
      pastisArmed: false,
      peekedLimit: false,
      itemUsedThisTurn: false,
      withdrawSeq: -1,
      totalDrinks: 0,
      totalIntoxSurvived: 0,
    });
  }

  const state: GameState = {
    rngState: seed >>> 0,
    day: -1,
    phase: 0,
    limit: -1,
    limitRevealed: false,
    alcoholDeck: [],
    alcoholDiscard: [],
    eventDeck: [],
    eventDiscard: [],
    players,
    turnIndex: 0,
    startPlayer: 0,
    withdrawCounter: 0,
    log: [],
    jumps: [],
    over: false,
    stats: emptyStats(),
  };

  withRandom(state, (rng) => startDay(state, config, rng, 0));
  return state;
}

/**
 * Runs `fn` with a generator seeded from the state, then writes the
 * generator's new position back. Every entry point into the engine goes
 * through this, so no draw can ever escape the seed.
 */
function withRandom<T>(state: GameState, fn: (rng: Random) => T): T {
  const rng = createRandom(state.rngState);
  const result = fn(rng);
  state.rngState = rng.snapshot();
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function currentPlayer(state: GameState): PlayerState | null {
  if (state.over) return null;
  const p = state.players[state.turnIndex];
  return p && p.status === 'partying' ? p : null;
}

export function legalActions(state: GameState, config: Config): Action[] {
  const player = currentPlayer(state);
  if (!player) return [];

  const actions: Action[] = [{ type: 'drink' }, { type: 'withdraw' }];
  if (!player.itemUsedThisTurn) {
    const seen = new Set<ItemId>();
    for (const item of player.items) {
      if (seen.has(item)) continue;
      seen.add(item);
      actions.push({ type: 'useItem', item });
    }
  }
  return actions;
}

export function applyAction(state: GameState, config: Config, action: Action): GameState {
  const player = currentPlayer(state);
  if (!player || state.over) return state;

  state.stats.turnsTaken += 1;

  withRandom(state, (rng) => {
    switch (action.type) {
      case 'drink':
        doDrink(state, config, rng, player);
        endTurn(state, config, rng);
        break;

      case 'withdraw':
        voluntaryWithdraw(state, config, player);
        endTurn(state, config, rng);
        break;

      case 'useItem': {
        const endsTurn = useItem(state, config, rng, player, action.item);
        if (endsTurn) endTurn(state, config, rng);
        break;
      }
    }
  });

  return state;
}

/** Final standings, best first. Ties broken by intoxication survived. */
export function standings(state: GameState): PlayerState[] {
  return state.players.slice().sort((a, b) => {
    if (b.bankedVP !== a.bankedVP) return b.bankedVP - a.bankedVP;
    return b.totalIntoxSurvived - a.totalIntoxSurvived;
  });
}

// ---------------------------------------------------------------------------
// Turn actions
// ---------------------------------------------------------------------------

function doDrink(
  state: GameState,
  config: Config,
  rng: Random,
  player: PlayerState,
  options: { halveIntox?: boolean; drawEventCard?: boolean } = {},
): void {
  const card = drawAlcohol(state, rng);
  if (!card) return;

  const vpBefore = player.roundVP;
  const intoxBefore = player.intox;

  consumeAlcohol(state, config, player, card, { halveIntox: options.halveIntox });

  if (options.drawEventCard !== false) {
    const eventId = drawEvent(state, rng);
    if (eventId) resolveEvent(state, config, rng, player, eventId as EventId);
  }

  // Attribute the whole drink — card and its event — to the phase it happened
  // in, so the simulator can see each phase's VP-per-intoxication rate.
  state.stats.vpByPhase[state.phase] = (state.stats.vpByPhase[state.phase] ?? 0) + (player.roundVP - vpBefore);
  state.stats.intoxByPhase[state.phase] =
    (state.stats.intoxByPhase[state.phase] ?? 0) + (player.intox - intoxBefore);
}

function voluntaryWithdraw(state: GameState, config: Config, player: PlayerState): void {
  const phase = phaseConfig(state, config);
  state.stats.totalExits += 1;

  if (player.drinksThisPhase < phase.minDrinks) {
    gainVP(player, -phase.earlyExitPenalty);
    state.stats.earlyExits += 1;
    log(state, { kind: 'aguafiestas', player: player.id, n: phase.earlyExitPenalty });
  }

  leavePhase(state, player, 'withdrew');
}

/** Returns true if using the item consumed the player's turn. */
function useItem(
  state: GameState,
  config: Config,
  rng: Random,
  player: PlayerState,
  item: ItemId,
): boolean {
  if (!removeItem(player, item)) return false;
  player.itemUsedThisTurn = true;
  log(state, { kind: 'usedItem', player: player.id, item });

  switch (item) {
    case 'kebab':
      addIntox(player, -config.items.kebabRelief);
      return false;

    case 'botella':
      addIntox(player, -config.items.botellaRelief);
      return false;

    case 'redbull':
      // The only private knowledge in the game.
      player.peekedLimit = true;
      return false;

    case 'pastis':
      player.pastisArmed = true;
      return false;

    case 'porro':
      // Skip your draw without withdrawing: watch what everyone else does and
      // decide next turn. Deliberately does not count as a drink, which is why
      // Ultimo en Pie has its own drink-minimum gate.
      return true;

    case 'farlopa': {
      addResaca(player, config.resaca.farlopa);
      state.stats.farlopaByDay[state.day] = (state.stats.farlopaByDay[state.day] ?? 0) + 1;
      doDrink(state, config, rng, player, {
        halveIntox: true,
        drawEventCard: config.items.farlopaDrawsEvent,
      });
      // The extra turn is spent; the player still has their own action, unless
      // the extra drink just took them to closing time.
      return player.drinksThisPhase >= phaseConfig(state, config).maxDrinks;
    }
  }
}

// ---------------------------------------------------------------------------
// Turn / phase / day progression
// ---------------------------------------------------------------------------

function endTurn(state: GameState, config: Config, rng: Random): void {
  const phase = phaseConfig(state, config);

  // Closing time: anyone at the cap is thrown out.
  for (const p of state.players) {
    if (p.status === 'partying' && p.drinksThisPhase >= phase.maxDrinks) {
      leavePhase(state, p, 'closingTime');
    }
  }

  if (partying(state).length === 0) {
    endPhase(state, config, rng);
    return;
  }

  advanceTurn(state);
}

function advanceTurn(state: GameState): void {
  const n = state.players.length;
  for (let step = 1; step <= n * 2; step++) {
    const idx = (state.turnIndex + step) % n;
    const p = state.players[idx]!;
    if (p.status !== 'partying') continue;
    if (p.skipNextTurn) {
      p.skipNextTurn = false;
      log(state, { kind: 'skipped', player: p.id });
      continue;
    }
    state.turnIndex = idx;
    p.itemUsedThisTurn = false;
    return;
  }
  // Everyone left was skipping; their skips are now cleared, so take the next
  // partying player outright rather than looping forever.
  for (let step = 1; step <= n; step++) {
    const idx = (state.turnIndex + step) % n;
    const p = state.players[idx]!;
    if (p.status === 'partying') {
      state.turnIndex = idx;
      p.itemUsedThisTurn = false;
      return;
    }
  }
}

function endPhase(state: GameState, config: Config, rng: Random): void {
  awardLastStanding(state, config);

  if (state.phase < PHASE_IDS.length - 1) {
    startPhase(state, config, rng, state.phase + 1);
  } else {
    resolveNight(state, config, rng);
  }
}

/**
 * The last player to leave takes the bonus — but only if they met the phase's
 * drink minimum. Without that gate you could hold two joints and idle your way
 * to the bonus without drinking anything.
 */
function awardLastStanding(state: GameState, config: Config): void {
  const phase = phaseConfig(state, config);
  const eligible = state.players.filter((p) => p.status === 'withdrawn' || p.status === 'partying');
  if (eligible.length === 0) return;

  const maxSeq = Math.max(...eligible.map((p) => (p.status === 'partying' ? Infinity : p.withdrawSeq)));
  for (const p of eligible) {
    const seq = p.status === 'partying' ? Infinity : p.withdrawSeq;
    if (seq !== maxSeq) continue;
    if (p.drinksThisPhase < phase.minDrinks) continue;
    gainVP(p, phase.lastStandingBonus);
    log(state, { kind: 'ultimoEnPie', player: p.id, n: phase.lastStandingBonus });
  }
}

function startPhase(state: GameState, config: Config, rng: Random, phaseIndex: number): void {
  state.phase = phaseIndex;
  const phase = config.phases[PHASE_IDS[phaseIndex]!];

  state.alcoholDeck = rng.shuffle(buildDeck(phase.alcohol));
  state.alcoholDiscard = [];
  state.eventDeck = rng.shuffle(buildDeck<EventId>(phase.events));
  state.eventDiscard = [];
  state.withdrawCounter = 0;

  if (config.limitRevealAt === PHASE_IDS[phaseIndex]) state.limitRevealed = true;

  for (const p of state.players) {
    // 'arrested' and 'dead' both survive the phase boundary: a cell holds you
    // until morning, and the concrete holds you rather longer.
    if (p.status === 'withdrawn') p.status = 'partying';
    if (p.status !== 'partying') continue;
    p.drinksThisPhase = 0;
    p.withdrawSeq = -1;
    p.skipNextTurn = false;
    p.itemUsedThisTurn = false;
  }

  log(state, { kind: 'phaseStart', n: phaseIndex });

  if (partying(state).length === 0) {
    endPhase(state, config, rng);
    return;
  }

  // Rotate who opens each phase across the whole weekend.
  state.startPlayer = (state.day * PHASE_IDS.length + phaseIndex) % state.players.length;
  state.turnIndex = state.startPlayer;
  if (state.players[state.turnIndex]!.status !== 'partying') {
    advanceTurn(state);
  } else {
    state.players[state.turnIndex]!.itemUsedThisTurn = false;
  }
}

function startDay(state: GameState, config: Config, rng: Random, day: number): void {
  state.day = day;
  state.limitRevealed = false;

  const deck = config.limitDecks[DAY_IDS[day]!];
  state.limit = deck[rng.int(deck.length)]!;

  for (const p of state.players) {
    if (p.status === 'dead') continue;
    p.status = 'partying';
    p.intox = p.resaca; // the morning starts where your hangover left it
    p.roundVP = 0;
    p.drinksThisPhase = 0;
    p.withdrawSeq = -1;
    p.skipNextTurn = false;
    p.pastisArmed = false;
    p.peekedLimit = false;
    p.itemUsedThisTurn = false;
  }

  log(state, { kind: 'dayStart', n: day });

  if (state.players.every((p) => p.status === 'dead')) {
    state.over = true;
    return;
  }

  startPhase(state, config, rng, 0);
}

// ---------------------------------------------------------------------------
// The night's reckoning
// ---------------------------------------------------------------------------

function resolveNight(state: GameState, config: Config, rng: Random): void {
  for (const p of state.players) {
    if (p.status === 'dead') continue;

    if (p.status === 'arrested') {
      // Already banked at the moment of arrest, and no limit check tonight.
      p.roundVP = 0;
      log(state, { kind: 'sleptInCell', player: p.id });
      continue;
    }

    if (p.intox > state.limit) {
      jump(state, config, rng, p);
    } else {
      p.totalIntoxSurvived += p.intox;
      const banked = bankRound(state, config, p);
      log(state, { kind: 'survived', player: p.id, n: banked });
    }
  }

  // Check for a wiped-out table before advancing, so the weekend does not tick
  // over to a day nobody is alive to play.
  if (state.day >= DAY_IDS.length - 1 || state.players.every((p) => p.status === 'dead')) {
    state.over = true;
    log(state, { kind: 'weekendOver' });
    return;
  }

  startDay(state, config, rng, state.day + 1);
}

function jump(state: GameState, config: Config, rng: Random, player: PlayerState): void {
  const d = player.intox - state.limit;

  // Lost either way. You are in a swimming pool with a fractured pelvis.
  const lostVP = player.roundVP;
  player.roundVP = 0;
  player.items = [];

  const outcome = resolveJump(d, config, rng);
  state.jumps.push({
    day: state.day,
    playerId: player.id,
    d,
    limit: state.limit,
    survived: outcome.survived,
    legendVP: outcome.legendVP,
    lostVP,
  });

  if (outcome.survived) {
    player.bankedVP += outcome.legendVP;
    addResaca(player, outcome.resaca);
    log(state, { kind: 'piscina', player: player.id, n: d });
  } else {
    player.status = 'dead';
    log(state, { kind: 'cemento', player: player.id, n: d });
  }
}
