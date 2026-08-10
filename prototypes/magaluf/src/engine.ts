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
import type { ChooseOption } from './events.ts';
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
    lastStandingAwarded: false,
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

/**
 * `chooseOption` is passed in rather than imported so `bots.ts` keeps owning
 * every decision a player makes. Omitting it takes the first branch, which is
 * enough for tests that do not care.
 */
export function applyAction(
  state: GameState,
  config: Config,
  action: Action,
  chooseOption?: ChooseOption,
): GameState {
  const player = currentPlayer(state);
  if (!player || state.over) return state;

  state.stats.turnsTaken += 1;

  withRandom(state, (rng) => {
    switch (action.type) {
      case 'drink':
        doDrink(state, config, rng, player, { chooseOption });
        endTurn(state, config, rng);
        break;

      case 'withdraw':
        voluntaryWithdraw(state, config, player);
        endTurn(state, config, rng);
        break;

      case 'useItem': {
        const endsTurn = useItem(state, config, rng, player, action.item, chooseOption);
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
  options: { halveIntox?: boolean; drawEventCard?: boolean; chooseOption?: ChooseOption } = {},
): void {
  const card = drawAlcohol(state, rng);
  if (!card) return;

  const vpBefore = player.roundVP;
  const intoxBefore = player.intox;

  consumeAlcohol(state, config, player, card, { halveIntox: options.halveIntox });

  if (options.drawEventCard !== false) {
    const eventId = drawEvent(state, rng);
    if (eventId) resolveEvent(state, config, rng, player, eventId as EventId, options.chooseOption);
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
  chooseOption?: ChooseOption,
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
        chooseOption,
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

  advanceTurn(state, config);
}

function advanceTurn(state: GameState, config: Config): void {
  const n = state.players.length;
  const start = state.turnIndex;

  const take = (idx: number): void => {
    // A lap is measured from the player who opened the phase. Walking is
    // always forward, so the round has turned over whenever the next seat's
    // distance from the anchor is not further along than the current one's —
    // including the equal case, a solo player handing to themselves.
    const offset = (i: number) => (i - state.startPlayer + n) % n;
    const newRound = offset(idx) <= offset(start);

    state.turnIndex = idx;
    state.players[idx]!.itemUsedThisTurn = false;
    if (newRound) awardLastStanding(state, config, state.players[idx]!);
  };

  for (let step = 1; step <= n * 2; step++) {
    const idx = (start + step) % n;
    const p = state.players[idx]!;
    if (p.status !== 'partying') continue;
    if (p.skipNextTurn) {
      p.skipNextTurn = false;
      log(state, { kind: 'skipped', player: p.id });
      continue;
    }
    take(idx);
    return;
  }
  // Everyone left was skipping; their skips are now cleared, so take the next
  // partying player outright rather than looping forever.
  for (let step = 1; step <= n; step++) {
    const idx = (start + step) % n;
    if (state.players[idx]!.status === 'partying') {
      take(idx);
      return;
    }
  }
}

function endPhase(state: GameState, config: Config, rng: Random): void {
  // Último en Pie is not settled here any more: it is paid the moment somebody
  // opens a round alone, which happens mid-phase or not at all.
  if (state.phase < PHASE_IDS.length - 1) {
    startPhase(state, config, rng, state.phase + 1);
  } else {
    resolveNight(state, config, rng);
  }
}

/**
 * The bonus for opening a round as the only person left in the venue.
 *
 * It used to go to whoever left last, which paid for seat position: a table
 * that all withdraws at the drink minimum leaves in turn order, so the last
 * player collected for free. Being alone at a *round boundary* has to be
 * bought with one more solo turn and the intoxication that comes with it.
 *
 * The drink-minimum gate survives from the old version for the old reason:
 * without it you could hold two joints and idle your way to the bonus.
 */
function awardLastStanding(state: GameState, config: Config, player: PlayerState): void {
  if (state.lastStandingAwarded) return;
  if (partying(state).length !== 1) return;

  const phase = phaseConfig(state, config);
  if (player.status !== 'partying') return;
  if (player.drinksThisPhase < phase.minDrinks) return;

  state.lastStandingAwarded = true;
  gainVP(player, phase.lastStandingBonus);
  log(state, { kind: 'ultimoEnPie', player: player.id, n: phase.lastStandingBonus });
}

function startPhase(state: GameState, config: Config, rng: Random, phaseIndex: number): void {
  state.phase = phaseIndex;
  const phase = config.phases[PHASE_IDS[phaseIndex]!];

  state.alcoholDeck = rng.shuffle(buildDeck(phase.alcohol));
  state.alcoholDiscard = [];
  state.eventDeck = rng.shuffle(buildDeck<EventId>(phase.events));
  state.eventDiscard = [];
  state.withdrawCounter = 0;
  state.lastStandingAwarded = false;

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
    advanceTurn(state, config);
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

/**
 * Forfeiting the night is the price of dying, not the price of jumping. Reach
 * the pool and you are a survivor in every respect — the round pool banks at
 * the day's rate, the items stay in your pocket, and the Leyenda bonus goes on
 * top. The die is the whole penalty.
 */
function jump(state: GameState, config: Config, rng: Random, player: PlayerState): void {
  const d = player.intox - state.limit;
  const poolVP = player.roundVP;

  const outcome = resolveJump(d, config, rng);
  let bankedVP = 0;

  if (outcome.survived) {
    player.totalIntoxSurvived += player.intox;
    bankedVP = bankRound(state, config, player);
    player.bankedVP += outcome.legendVP;
    addResaca(player, outcome.resaca);
    log(state, { kind: 'piscina', player: player.id, n: d });
    log(state, { kind: 'survived', player: player.id, n: bankedVP });
  } else {
    player.roundVP = 0;
    player.items = [];
    player.status = 'dead';
    log(state, { kind: 'cemento', player: player.id, n: d });
  }

  state.jumps.push({
    day: state.day,
    playerId: player.id,
    d,
    limit: state.limit,
    survived: outcome.survived,
    legendVP: outcome.legendVP,
    poolVP,
    lostVP: outcome.survived ? 0 : poolVP,
    bankedVP,
  });
}
