/**
 * Magaluf — turn, venue, day and weekend orchestration.
 *
 * **Naming, because two things are called a phase.** `G.phase` is the *venue*
 * — Tardeo, Noche, After. A boardgame.io phase is either `party` or `confirm`.
 * They are not the same axis and the code never conflates them.
 *
 * Feature 032 shipped with no boardgame.io phase machinery at all: every
 * transition happened inside the move that caused it. **Feature 033 reversed
 * that**, because the round-confirm gates between venues and between days
 * need every seat able to act at once, and this game has a real round-robin
 * turn order in which only the current seat may move. The Mind sidesteps that
 * by being turn-less; Love Letter, which has turn order like this game, uses a
 * dedicated phase with `activePlayers: ALL` for its wait. This follows Love
 * Letter.
 *
 * Within the `party` phase the framework still owns only the seat rotation,
 * and even then it just reads `G.turnSeatID`: the move works out who is next
 * (skipping the dead, the withdrawn, the arrested and anyone who got lost) and
 * writes it down, so the `TurnOrderConfig` never re-derives venue state.
 *
 * Item use does not end a turn, so `minMoves`/`maxMoves` cannot be used —
 * moves hand over explicitly, via `events.endTurn()` or `events.setPhase()`.
 */

import type { Ctx, Game, TurnOrderConfig } from 'boardgame.io';
import type { GameoverResult, GameoverStanding } from '../../types.js';
import {
  beginRoundConfirm,
  confirmRoundReadyMove,
  forceAdvanceRoundMove,
  isRoundConfirmComplete,
} from '../../roundConfirm.js';
// ActivePlayers/INVALID_MOVE come from the local shim, never from
// 'boardgame.io/core' directly: packages/server is a real Node process that
// imports this file through gamesCatalog, and that subpath fails under Node
// ESM resolution. See vendor.ts.
import { ActivePlayers, INVALID_MOVE } from '../../vendor.js';
import type { EventId, ItemId } from './cards.js';
import { DAY_IDS, ITEM_IDS, PHASE_IDS } from './cards.js';
import { ITEM_EFFECTS, LIMIT_DECKS, PHASE_RULES } from './constants.js';
import { resolveJump } from './balconing.js';
import { resolveEvent } from './events.js';
import type { Rng, BoardgameRandom } from './rng.js';
import { fromBoardgameRandom } from './rng.js';
import type { MagalufSettings } from './settings.js';
import { clampSettings, dayMultipliers } from './settings.js';
import type { MagalufG, MagalufPlayer, PendingAdvance } from './state.js';
import {
  addIntox,
  bankRound,
  buildDeck,
  confirmableSeats,
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
  /** The host's own seat, if any — see RoundConfirmG.hostPlayerID. */
  hostPlayerID?: string | null;
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
  // Nothing on the table when a new venue opens.
  G.lastDraw = null;
  G.pendingEvent = null;

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

/**
 * A venue closes. Nothing is dealt here any more — the transition is recorded
 * and handed to a round-confirm wait, so the table regroups before the next
 * venue opens. The night is resolved first when this was the After, so the
 * balconing rolls are already in `G.jumps` by the time the banner appears and
 * the board can play them inside the gate.
 */
function endPhase(G: MagalufG, rng: Rng): void {
  awardLastStanding(G);

  if (G.phase < PHASE_IDS.length - 1) {
    holdFor(G, { kind: 'phase', next: G.phase + 1 });
    return;
  }

  resolveNight(G, rng);
}

function holdFor(G: MagalufG, pending: PendingAdvance): void {
  G.pendingAdvance = pending;
  beginRoundConfirm(G, confirmableSeats(G));
  log(G, 'awaitingTable');
}

/** Runs the transition a completed wait was holding open. */
function performPendingAdvance(G: MagalufG, rng: Rng): void {
  const pending = G.pendingAdvance;
  G.pendingAdvance = null;
  G.roundConfirm = null;
  if (!pending) return;

  if (pending.kind === 'phase') startPhase(G, rng, pending.next);
  else startDay(G, rng, pending.next);
}

function startDay(G: MagalufG, rng: Rng, day: number): void {
  G.day = day;
  G.limitRevealed = false;

  // Shuffle the day's four limit cards and turn one face-down, exactly as a
  // table would. Not an index into an array with a random number.
  const deck = LIMIT_DECKS[DAY_IDS[day]!]!;
  G.limit = rng.shuffle(deck)[0]! + G.settings.limitShift;

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
    roll: outcome.roll,
    die: G.settings.balconyDie,
    survived: outcome.survived,
    legendVP: outcome.legendVP,
    lostVP,
  });

  if (outcome.survived) {
    player.bankedVP += outcome.legendVP;
    player.resaca += outcome.resaca;
    log(G, 'piscina', { actor: seatID, d, roll: outcome.roll, vp: outcome.legendVP }, 'special');
  } else {
    player.status = 'dead';
    log(G, 'cemento', { actor: seatID, d, roll: outcome.roll }, 'failure');
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

  // No gate after the final night — the match is over and the gameover banner
  // is what everyone is waiting to read.
  holdFor(G, { kind: 'day', next: G.day + 1 });
}

/**
 * Closing time, then work out how the move should hand over.
 *
 * Returns what the caller must do, rather than doing it: `events` are only
 * available inside a move, and this runs from three of them.
 */
type HandOver = 'turn' | 'confirm' | 'finished';

function finishTurn(G: MagalufG, rng: Rng): HandOver {
  const rules = phaseRules(G);
  for (const id of G.activeSeatIDs) {
    const player = G.players[id]!;
    if (player.status === 'partying' && player.drinksThisPhase >= rules.maxDrinks) {
      leavePhase(G, id, 'closingTime');
    }
  }

  if (partying(G).length > 0) {
    advanceTurn(G);
    return 'turn';
  }

  endPhase(G, rng);
  if (G.finished) return 'finished';
  return 'confirm';
}

// ---------------------------------------------------------------------------
// Drinking
// ---------------------------------------------------------------------------

/**
 * Turns the alcohol card face-up and applies it — and stops there.
 *
 * The event card is drawn but left face-down (`G.pendingEvent`) for a separate
 * `revealEvent` move, because that is what happens at a table: you flip the
 * drink, everyone updates their numbers, and only then does somebody turn the
 * event over and read it out. Resolving both in one action asked players to
 * absorb two cards at once and track the arithmetic in their heads.
 *
 * Returns false only when there was no card left to draw at all.
 */
function takeDrink(
  G: MagalufG,
  rng: Rng,
  seatID: string,
  options: { halveIntox?: boolean; drawsEvent?: boolean; endsTurn?: boolean } = {},
): boolean {
  const card = drawAlcohol(G, rng);
  if (!card) return false;
  consumeAlcohol(G, seatID, card, { halveIntox: options.halveIntox });

  // Set here rather than after the event, so the drink is on the table for
  // everyone to read while the event is still face-down. A Ronda's knock-on
  // drinks cannot overwrite it: those go through consumeAlcohol, never here.
  G.lastDraw = { seatID, alcohol: card.id, event: null };

  if (options.drawsEvent !== false) {
    G.pendingEvent = { seatID, endsTurn: options.endsTurn ?? true };
  }
  return true;
}

/** Turns the pending event face-up and resolves it. */
function revealPendingEvent(G: MagalufG, rng: Rng): void {
  const pending = G.pendingEvent;
  if (!pending) return;
  G.pendingEvent = null;

  const eventId = drawEvent(G, rng);
  if (!eventId) return;
  if (G.lastDraw) G.lastDraw = { ...G.lastDraw, event: eventId };
  resolveEvent(G, pending.seatID, eventId as EventId, rng);
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
      // endsTurn: false -- the extra drink still owes an event reveal, but once
      // that is turned over the player has their own action left to take.
      takeDrink(G, rng, seatID, {
        halveIntox: true,
        drawsEvent: ITEM_EFFECTS.farlopaDrawsEvent,
        endsTurn: false,
      });
      // Never ends the turn here: either an event is pending and revealing it
      // decides, or nothing was drawn and the player simply carries on.
      return false;
  }
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

interface MoveCtx {
  G: MagalufG;
  playerID: string;
  random: BoardgameRandom;
  events: { endTurn(): void; setPhase(phase: string): void };
}

function canAct(G: MagalufG, playerID: string): boolean {
  return (
    !G.finished &&
    // A wait blocks every party move. Without this a click already in flight
    // when the venue closed could land a drink into the next one.
    G.roundConfirm === null &&
    // So does a face-down event: the only thing you may do while one is owed
    // is turn it over. Otherwise a player could drink again, or leave, without
    // ever finding out what the first drink brought with it.
    G.pendingEvent === null &&
    G.turnSeatID === playerID &&
    G.players[playerID]?.status === 'partying'
  );
}

/** Every party move ends the same way: hand on the turn, or open the gate. */
function handOver(handOver: HandOver, events: MoveCtx['events']): void {
  if (handOver === 'turn') events.endTurn();
  else if (handOver === 'confirm') events.setPhase('confirm');
  // 'finished' needs nothing: the top-level endIf ends the match.
}

function drink({ G, playerID, random, events }: MoveCtx): typeof INVALID_MOVE | void {
  if (!canAct(G, playerID)) return INVALID_MOVE;
  const rng = fromBoardgameRandom(random);

  // Stops with the event still face-down. The turn is handed on by
  // revealEvent, not here -- unless there was no card to draw at all.
  if (!takeDrink(G, rng, playerID)) handOver(finishTurn(G, rng), events);
}

/**
 * Turns the face-down event over and resolves it.
 *
 * Only the seat that drew it may do this, and it is the only move available to
 * them until they do -- so the table always sees the drink land before the
 * event that came with it.
 */
function revealEvent({ G, playerID, random, events }: MoveCtx): typeof INVALID_MOVE | void {
  const pending = G.pendingEvent;
  if (G.finished || !pending || pending.seatID !== playerID) return INVALID_MOVE;

  const rng = fromBoardgameRandom(random);
  revealPendingEvent(G, rng);

  // A drink hands the turn on; a Farlopa's extra draw does not, unless the
  // event it brought pushed the player to closing time.
  const atCap = G.players[playerID]!.drinksThisPhase >= phaseRules(G).maxDrinks;
  if (pending.endsTurn || atCap) handOver(finishTurn(G, rng), events);
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

  handOver(finishTurn(G, rng), events);
}

function useItem({ G, playerID, random, events }: MoveCtx, item: ItemId): typeof INVALID_MOVE | void {
  if (!canAct(G, playerID)) return INVALID_MOVE;
  const player = G.players[playerID]!;
  if (player.itemUsedThisTurn) return INVALID_MOVE;
  if (!ITEM_IDS.includes(item)) return INVALID_MOVE;
  if (!removeItem(player, item)) return INVALID_MOVE;

  player.itemUsedThisTurn = true;
  const rng = fromBoardgameRandom(random);
  if (applyItem(G, rng, playerID, item)) handOver(finishTurn(G, rng), events);
}

// --- Round-confirm moves ---------------------------------------------------
//
// client: false on both. The completion handler deals a whole new venue --
// fresh decks for everyone -- and boardgame.io's optimistic client-side dry
// run would otherwise predict that deal locally against a G the server is
// about to shuffle differently. Same reason The Mind marks its own pair.

function confirmRoundReady(context: {
  G: MagalufG;
  playerID: string;
}): typeof INVALID_MOVE | void {
  if (context.G.finished) return INVALID_MOVE;
  return confirmRoundReadyMove(context);
}

function forceAdvanceRound(context: {
  G: MagalufG;
  playerID: string;
}): typeof INVALID_MOVE | void {
  if (context.G.finished) return INVALID_MOVE;
  return forceAdvanceRoundMove(context);
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

  // The whole table, best first. Magaluf's death toll is the point of the
  // game, so who did not make it home belongs in the result rather than only
  // in the log.
  const standings = ranked.map((id) => {
    const player = G.players[id]!;
    const row: GameoverStanding = { playerID: id, score: player.bankedVP };
    if (player.status === 'dead') row.labelKey = 'magaluf.status.dead';
    return row;
  });

  return {
    winner: winners.length === 1 ? winners[0]! : winners,
    standings,
  };
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
      lastDraw: null,
      pendingEvent: null,
      pendingAdvance: null,
      roundConfirm: null,
      hostPlayerID: setupData?.hostPlayerID ?? null,
      jumps: [],
      log: [],
      finished: false,
    };

    startDay(G, fromBoardgameRandom(random), 0);
    return G;
  },

  validateSetupData: (setupData, numPlayers) => validateMagalufSetupData(setupData, numPlayers),

  phases: {
    // The weekend itself. No minMoves/maxMoves: using an item is a free action
    // that must not end the turn, so the moves hand over explicitly.
    party: {
      start: true,
      turn: { order: turnOrder },
      moves: { drink, revealEvent, withdraw, useItem },
      onBegin: ({ G, events }) => {
        // A venue nobody can attend -- everyone arrested, or dead -- closes on
        // arrival and opens another gate. Bouncing straight back keeps that
        // from stranding the table in a phase where nothing is playable.
        if (G.roundConfirm) events.setPhase('confirm');
      },
    },

    // Everybody regroups. ActivePlayers.ALL because a confirm has to be
    // callable by every seat, not just whichever one happened to be up.
    confirm: {
      turn: { activePlayers: ActivePlayers.ALL },
      moves: { confirmRoundReady, forceAdvanceRound },
      endIf: ({ G }) => isRoundConfirmComplete(G.roundConfirm),
      onEnd: ({ G, random }) => {
        performPendingAdvance(G, fromBoardgameRandom(random));
      },
      next: 'party',
    },
  },

  endIf: ({ G }) => matchGameoverResult(G),

  playerView: ({ G, playerID }) => {
    const canSee = G.limitRevealed || (playerID != null && G.players[playerID]?.peekedLimit === true);
    return canSee ? G : { ...G, limit: HIDDEN_LIMIT };
  },
};
