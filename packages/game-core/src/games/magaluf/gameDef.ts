/**
 * Magaluf — turn, phase, day and weekend orchestration.
 *
 * There is deliberately **no boardgame.io phase machinery**. `G.day` and
 * `G.phase` are plain numbers and every transition happens inside the move
 * that causes it, the same way Cahoots keeps its whole turn in one move.
 * Nine sub-rounds modelled as engine phases would buy nothing and would fight
 * the framework over who owns the seat rotation.
 *
 * The framework owns only that rotation, and even then it just reads
 * `G.turnSeatID`: the move works out who is next (skipping the dead, the
 * withdrawn, the arrested and anyone who got lost) and writes it down, so the
 * `TurnOrderConfig` never has to re-derive the phase state.
 *
 * Item use does not end a turn, so `minMoves`/`maxMoves` cannot be used —
 * moves call `events.endTurn()` explicitly.
 */

import type { Ctx, Game, TurnOrderConfig } from 'boardgame.io';
import type { GameoverResult } from '../../types.js';
import { INVALID_MOVE } from '../../vendor.js';
import type { EventId, ItemId } from './cards.js';
import { DAY_IDS, ITEM_IDS, PHASE_IDS } from './cards.js';
import { ITEM_EFFECTS, LIMIT_DECKS, PHASE_RULES } from './constants.js';
import { resolveJump } from './balconing.js';
import { resolveEvent } from './events.js';
import type { Rng, BoardgameRandom } from './rng.js';
import { fromBoardgameRandom } from './rng.js';
import type { MagalufSettings } from './settings.js';
import { clampSettings, dayMultipliers } from './settings.js';
import type { MagalufG, MagalufPlayer } from './state.js';
import {
  addIntox,
  bankRound,
  buildDeck,
  consumeAlcohol,
  drawAlcohol,
  drawEvent,
  gainVP,
  leavePhase,
  log,
  newPlayer,
  partying,
  phaseRules,
  removeItem,
} from './state.js';

export type { MagalufG, MagalufPlayer, JumpRecord } from './state.js';
export type { MagalufSettings } from './settings.js';

export interface MagalufSetupData extends Partial<MagalufSettings> {
  /** Seats actually claimed when the match was started. */
  claimedSeatIDs?: string[];
}

/** What playerView leaves behind when the limit is still face-down. */
export const HIDDEN_LIMIT = -1;

function seatIDs(ctx: Ctx): string[] {
  return Array.from({ length: ctx.numPlayers }, (_, i) => String(i));
}

// ---------------------------------------------------------------------------
// Turn order
// ---------------------------------------------------------------------------

const turnOrder: TurnOrderConfig<MagalufG> = {
  first: ({ G, ctx }) => Math.max(0, ctx.playOrder.indexOf(G.turnSeatID)),
  next: ({ G, ctx }) => {
    const index = ctx.playOrder.indexOf(G.turnSeatID);
    return index === -1 ? undefined : index;
  },
};

/**
 * Walks to the next seat that can actually act, consuming one `skipNextTurn`
 * per seat passed. The second sweep is the guard for a table where every
 * remaining seat was skipping: their flags are cleared by the first sweep, so
 * taking the next partying seat outright terminates instead of looping.
 */
function advanceTurn(G: MagalufG): void {
  const seats = G.activeSeatIDs;
  const start = seats.indexOf(G.turnSeatID);

  for (let step = 1; step <= seats.length * 2; step++) {
    const id = seats[(start + step) % seats.length]!;
    const player = G.players[id]!;
    if (player.status !== 'partying') continue;
    if (player.skipNextTurn) {
      player.skipNextTurn = false;
      log(G, 'skipped', { actor: id });
      continue;
    }
    G.turnSeatID = id;
    player.itemUsedThisTurn = false;
    return;
  }

  for (let step = 1; step <= seats.length; step++) {
    const id = seats[(start + step) % seats.length]!;
    if (G.players[id]!.status === 'partying') {
      G.turnSeatID = id;
      G.players[id]!.itemUsedThisTurn = false;
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Day / phase lifecycle
// ---------------------------------------------------------------------------

function startPhase(G: MagalufG, rng: Rng, phaseIndex: number): void {
  G.phase = phaseIndex;
  const rules = PHASE_RULES[PHASE_IDS[phaseIndex]!];

  G.alcoholDeck = rng.shuffle(buildDeck(rules.alcohol));
  G.alcoholDiscard = [];
  G.eventDeck = rng.shuffle(buildDeck<EventId>(rules.events));
  G.eventDiscard = [];
  G.withdrawCounter = 0;

  if (G.settings.limitRevealAt === PHASE_IDS[phaseIndex]) G.limitRevealed = true;

  for (const id of G.activeSeatIDs) {
    const player = G.players[id]!;
    // 'arrested' and 'dead' both survive the phase boundary: a cell holds you
    // until morning, and the concrete holds you rather longer.
    if (player.status === 'withdrawn') player.status = 'partying';
    if (player.status !== 'partying') continue;
    player.drinksThisPhase = 0;
    player.withdrawSeq = -1;
    player.skipNextTurn = false;
    player.itemUsedThisTurn = false;
  }

  log(G, 'phaseStart', { descriptionKey: `magaluf.phase.${PHASE_IDS[phaseIndex]}` }, 'round');

  if (partying(G).length === 0) {
    endPhase(G, rng);
    return;
  }

  // Rotate who opens each phase across the whole weekend.
  const opener = (G.day * PHASE_IDS.length + phaseIndex) % G.activeSeatIDs.length;
  G.turnSeatID = G.activeSeatIDs[opener]!;
  if (G.players[G.turnSeatID]!.status !== 'partying') advanceTurn(G);
  else G.players[G.turnSeatID]!.itemUsedThisTurn = false;
}

/**
 * The last seat to leave takes the bonus — but only if it met the phase's
 * drink minimum. Without that gate a player could hold two Porros and idle
 * their way to the bonus without drinking anything.
 */
function awardLastStanding(G: MagalufG): void {
  const rules = phaseRules(G);
  const eligible = G.activeSeatIDs.filter((id) => G.players[id]!.status === 'withdrawn');
  if (eligible.length === 0) return;

  const maxSeq = Math.max(...eligible.map((id) => G.players[id]!.withdrawSeq));
  for (const id of eligible) {
    const player = G.players[id]!;
    if (player.withdrawSeq !== maxSeq) continue;
    if (player.drinksThisPhase < rules.minDrinks) continue;
    gainVP(player, rules.lastStandingBonus);
    log(G, 'ultimoEnPie', { actor: id, vp: rules.lastStandingBonus }, 'success');
  }
}

function endPhase(G: MagalufG, rng: Rng): void {
  awardLastStanding(G);
  if (G.phase < PHASE_IDS.length - 1) startPhase(G, rng, G.phase + 1);
  else resolveNight(G, rng);
}

function startDay(G: MagalufG, rng: Rng, day: number): void {
  G.day = day;
  G.limitRevealed = false;

  const deck = LIMIT_DECKS[DAY_IDS[day]!]!;
  G.limit = deck[rng.int(deck.length)]! + G.settings.limitShift;

  for (const id of G.activeSeatIDs) {
    const player = G.players[id]!;
    if (player.status === 'dead') continue;
    player.status = 'partying';
    player.intox = player.resaca; // the morning starts where your hangover left it
    player.roundVP = 0;
    player.drinksThisPhase = 0;
    player.withdrawSeq = -1;
    player.skipNextTurn = false;
    player.pastisArmed = false;
    player.peekedLimit = false;
    player.itemUsedThisTurn = false;
  }

  log(G, 'dayStart', { descriptionKey: `magaluf.day.${DAY_IDS[day]}` }, 'round');
  startPhase(G, rng, 0);
}

function jump(G: MagalufG, rng: Rng, seatID: string): void {
  const player = G.players[seatID]!;
  const d = player.intox - G.limit;

  // Forfeited either way. You are in a swimming pool with a fractured pelvis.
  const lostVP = player.roundVP;
  player.roundVP = 0;
  player.items = [];

  const outcome = resolveJump(d, G.settings, rng);
  G.jumps.push({
    day: G.day,
    seatID,
    d,
    limit: G.limit,
    survived: outcome.survived,
    legendVP: outcome.legendVP,
    lostVP,
  });

  if (outcome.survived) {
    player.bankedVP += outcome.legendVP;
    player.resaca += outcome.resaca;
    log(G, 'piscina', { actor: seatID, d, vp: outcome.legendVP }, 'special');
  } else {
    player.status = 'dead';
    log(G, 'cemento', { actor: seatID, d }, 'failure');
  }
}

function resolveNight(G: MagalufG, rng: Rng): void {
  const multiplier = dayMultipliers(G.settings)[G.day] ?? 1;

  for (const id of G.activeSeatIDs) {
    const player = G.players[id]!;
    if (player.status === 'dead') continue;

    if (player.status === 'arrested') {
      // Banked at the moment of arrest, and no limit check tonight.
      player.roundVP = 0;
      log(G, 'sleptInCell', { actor: id });
      continue;
    }

    if (player.intox > G.limit) {
      jump(G, rng, id);
    } else {
      player.totalIntoxSurvived += player.intox;
      const banked = bankRound(G, id, multiplier);
      log(G, 'survived', { actor: id, vp: banked }, 'success');
    }
  }

  // Check for a wiped-out table before advancing, so the weekend does not tick
  // over to a day nobody is alive to play.
  const allDead = G.activeSeatIDs.every((id) => G.players[id]!.status === 'dead');
  if (G.day >= DAY_IDS.length - 1 || allDead) {
    G.finished = true;
    return;
  }

  startDay(G, rng, G.day + 1);
}

/**
 * Closing time, then either hand on the turn or close out the phase.
 * Returns nothing — callers follow it with `events.endTurn()`.
 */
function finishTurn(G: MagalufG, rng: Rng): void {
  const rules = phaseRules(G);
  for (const id of G.activeSeatIDs) {
    const player = G.players[id]!;
    if (player.status === 'partying' && player.drinksThisPhase >= rules.maxDrinks) {
      leavePhase(G, id, 'closingTime');
    }
  }

  if (partying(G).length === 0) endPhase(G, rng);
  else advanceTurn(G);
}

// ---------------------------------------------------------------------------
// Drinking
// ---------------------------------------------------------------------------

function takeDrink(
  G: MagalufG,
  rng: Rng,
  seatID: string,
  options: { halveIntox?: boolean; drawEventCard?: boolean } = {},
): void {
  const card = drawAlcohol(G, rng);
  if (!card) return;
  consumeAlcohol(G, seatID, card, { halveIntox: options.halveIntox });

  if (options.drawEventCard !== false) {
    const eventId = drawEvent(G, rng);
    if (eventId) resolveEvent(G, seatID, eventId, rng);
  }
}

/** Returns true when using the item consumed the player's turn. */
function applyItem(G: MagalufG, rng: Rng, seatID: string, item: ItemId): boolean {
  const player = G.players[seatID]!;
  log(G, 'usedItem', { actor: seatID, descriptionKey: `magaluf.item.${item}` }, 'play');

  switch (item) {
    case 'kebab':
      addIntox(player, -ITEM_EFFECTS.kebabRelief);
      return false;
    case 'botella':
      addIntox(player, -ITEM_EFFECTS.botellaRelief);
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
      // decide next turn. Deliberately not a drink, which is why Ultimo en Pie
      // has its own drink-minimum gate.
      return true;
    case 'farlopa':
      player.resaca += ITEM_EFFECTS.farlopaResaca;
      takeDrink(G, rng, seatID, {
        halveIntox: true,
        drawEventCard: ITEM_EFFECTS.farlopaDrawsEvent,
      });
      // The extra turn is spent; the player still has their own action, unless
      // that extra drink just took them to closing time.
      return player.drinksThisPhase >= phaseRules(G).maxDrinks;
  }
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

interface MoveCtx {
  G: MagalufG;
  playerID: string;
  random: BoardgameRandom;
  events: { endTurn(): void };
}

function canAct(G: MagalufG, playerID: string): boolean {
  return (
    !G.finished &&
    G.turnSeatID === playerID &&
    G.players[playerID]?.status === 'partying'
  );
}

function drink({ G, playerID, random, events }: MoveCtx): typeof INVALID_MOVE | void {
  if (!canAct(G, playerID)) return INVALID_MOVE;
  const rng = fromBoardgameRandom(random);
  takeDrink(G, rng, playerID);
  finishTurn(G, rng);
  events.endTurn();
}

function withdraw({ G, playerID, random, events }: MoveCtx): typeof INVALID_MOVE | void {
  if (!canAct(G, playerID)) return INVALID_MOVE;
  const rng = fromBoardgameRandom(random);
  const rules = phaseRules(G);
  const player = G.players[playerID]!;

  if (player.drinksThisPhase < rules.minDrinks) {
    gainVP(player, -rules.earlyExitPenalty);
    log(G, 'aguafiestas', { actor: playerID, vp: rules.earlyExitPenalty }, 'failure');
  }
  leavePhase(G, playerID, 'withdrew');

  finishTurn(G, rng);
  events.endTurn();
}

function useItem({ G, playerID, random, events }: MoveCtx, item: ItemId): typeof INVALID_MOVE | void {
  if (!canAct(G, playerID)) return INVALID_MOVE;
  const player = G.players[playerID]!;
  if (player.itemUsedThisTurn) return INVALID_MOVE;
  if (!ITEM_IDS.includes(item)) return INVALID_MOVE;
  if (!removeItem(player, item)) return INVALID_MOVE;

  player.itemUsedThisTurn = true;
  const rng = fromBoardgameRandom(random);
  const endsTurn = applyItem(G, rng, playerID, item);

  if (endsTurn) {
    finishTurn(G, rng);
    events.endTurn();
  }
}

// ---------------------------------------------------------------------------
// Gameover
// ---------------------------------------------------------------------------

function matchGameoverResult(G: MagalufG): GameoverResult | undefined {
  if (!G.finished) return undefined;

  const ranked = [...G.activeSeatIDs].sort((a, b) => {
    const pa = G.players[a]!;
    const pb = G.players[b]!;
    if (pb.bankedVP !== pa.bankedVP) return pb.bankedVP - pa.bankedVP;
    return pb.totalIntoxSurvived - pa.totalIntoxSurvived;
  });

  const best = G.players[ranked[0]!]!;
  const winners = ranked.filter((id) => {
    const p = G.players[id]!;
    return p.bankedVP === best.bankedVP && p.totalIntoxSurvived === best.totalIntoxSurvived;
  });

  return winners.length === 1 ? { winner: winners[0]! } : { winner: winners };
}

// ---------------------------------------------------------------------------
// Game definition
// ---------------------------------------------------------------------------

function validateMagalufSetupData(
  setupData: MagalufSetupData | undefined,
  numPlayers: number,
): string | undefined {
  const claimed = setupData?.claimedSeatIDs;
  if (claimed === undefined) return undefined;
  if (!Array.isArray(claimed) || claimed.length < 3) {
    return 'magaluf-v1: needs at least 3 claimed seats';
  }
  if (claimed.length > numPlayers) {
    return `magaluf-v1: ${claimed.length} claimed seats exceeds ${numPlayers} engine seats`;
  }
  return undefined;
}

export const magalufGameDef: Game<MagalufG, Record<string, unknown>, MagalufSetupData> = {
  setup: ({ ctx, random }, setupData) => {
    const error = validateMagalufSetupData(setupData, ctx.numPlayers);
    if (error) throw new Error(error);

    const activeSeatIDs = setupData?.claimedSeatIDs ?? seatIDs(ctx);
    const players: Record<string, MagalufPlayer> = {};
    for (const id of seatIDs(ctx)) players[id] = newPlayer();

    const G: MagalufG = {
      activeSeatIDs,
      // Clamped here, on the way in, before any value can reach game logic —
      // the platform validator checks types but not ranges. See settings.ts.
      settings: clampSettings(setupData),
      day: 0,
      phase: 0,
      limit: HIDDEN_LIMIT,
      limitRevealed: false,
      turnSeatID: activeSeatIDs[0]!,
      alcoholDeck: [],
      alcoholDiscard: [],
      eventDeck: [],
      eventDiscard: [],
      players,
      withdrawCounter: 0,
      jumps: [],
      log: [],
      finished: false,
    };

    startDay(G, fromBoardgameRandom(random), 0);
    return G;
  },

  validateSetupData: (setupData, numPlayers) => validateMagalufSetupData(setupData, numPlayers),

  // No minMoves/maxMoves: using an item is a free action that must not end the
  // turn, so the moves call events.endTurn() themselves.
  turn: { order: turnOrder },

  moves: { drink, withdraw, useItem },

  endIf: ({ G }) => matchGameoverResult(G),

  playerView: ({ G, playerID }) => {
    const canSee = G.limitRevealed || (playerID != null && G.players[playerID]?.peekedLimit === true);
    return canSee ? G : { ...G, limit: HIDDEN_LIMIT };
  },
};
