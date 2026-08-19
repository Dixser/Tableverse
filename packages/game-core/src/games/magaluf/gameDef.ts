/**
 * Magaluf — turn, venue, day and weekend orchestration.
 *
 * **Naming, because two things are called a phase.** `G.phase` is the *venue*
 * — Tardeo, Noche, After. A boardgame.io phase is `party`, `balcony` or
 * `confirm`. They are not the same axis and the code never conflates them.
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
import { ITEM_EFFECTS, PHASE_RULES } from './constants.js';
import { resolveJump } from './balconing.js';
import { eventOptions, resolveEvent, resolveEventOption } from './events.js';
import type { Rng, BoardgameRandom } from './rng.js';
import { fromBoardgameRandom } from './rng.js';
import type { MagalufSettings } from './settings.js';
import { clampSettings, dayMultipliers } from './settings.js';
import { buildLimitDeck, limitRange } from './limitScale.js';
import type { JumpRecord, MagalufG, MagalufPlayer, PendingAdvance } from './state.js';
import {
  addIntox,
  addResaca,
  bankRound,
  bankVP,
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
 *
 * It used to detect round boundaries too, for Último en Pie. Cierrabares is
 * settled at closing time off a drink count, so the anchor, the lap arithmetic
 * and the once-per-phase latch it needed are all gone. Walking the turn is
 * once again the only thing this function does.
 */
function advanceTurn(G: MagalufG): void {
  const seats = G.activeSeatIDs;
  const start = seats.indexOf(G.turnSeatID);

  const take = (index: number): void => {
    const id = seats[index]!;
    G.turnSeatID = id;
    G.players[id]!.itemUsedThisTurn = false;
  };

  for (let step = 1; step <= seats.length * 2; step++) {
    const index = (start + step) % seats.length;
    const player = G.players[seats[index]!]!;
    if (player.status !== 'partying') continue;
    if (player.skipNextTurn) {
      player.skipNextTurn = false;
      log(G, 'skipped', { actor: seats[index]! });
      continue;
    }
    take(index);
    return;
  }

  for (let step = 1; step <= seats.length; step++) {
    const index = (start + step) % seats.length;
    if (G.players[seats[index]!]!.status === 'partying') {
      take(index);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Who opens the next one
// ---------------------------------------------------------------------------
//
// Three different questions with three different answers, and none of them is
// a fixed rotation. The weekend opens on a seat drawn by lot; a venue passes
// the lead on round the table from whoever shut the place; a new day hands it
// to whoever is losing.

/** The next seat clockwise from `seatID` that is still alive. */
function nextLivingSeat(G: MagalufG, seatID: string): number {
  const seats = G.activeSeatIDs;
  const start = seats.indexOf(seatID);
  for (let step = 1; step <= seats.length; step++) {
    const index = (start + step) % seats.length;
    if (G.players[seats[index]!]!.status !== 'dead') return index;
  }
  // Unreachable while anybody is alive, and the weekend is over if nobody is.
  return Math.max(0, start);
}

/**
 * Opens the next venue: the seat after whoever was last out of the last one.
 *
 * Only the dead are stepped over. Everybody else is 'withdrawn' at the moment
 * this is asked — the venue closed because the last of them left — so skipping
 * anyone who is not partying would skip the whole table.
 *
 * Being last out is not necessarily a choice: closing time, an ambulance and
 * the police all count, because all of them are the same fact about the room.
 *
 * MUST be read before `startPhase` clears `withdrawSeq`, which is why the
 * caller works it out rather than `startPhase` doing it for itself.
 */
function openerAfterLastOut(G: MagalufG): number {
  let lastOut: string | null = null;
  let latest = -1;
  for (const id of G.activeSeatIDs) {
    const player = G.players[id]!;
    // The dead never left this venue; they were not in it. Their withdrawSeq
    // is whatever it was on the night they stopped playing.
    if (player.status === 'dead') continue;
    if (player.withdrawSeq > latest) {
      latest = player.withdrawSeq;
      lastOut = id;
    }
  }
  // A venue nobody could attend closes without anybody leaving it. Walking on
  // from whoever was up keeps the lead moving rather than pinning it.
  return nextLivingSeat(G, lastOut ?? G.turnSeatID);
}

/**
 * Opens the weekend: a seat drawn out of the hat.
 *
 * Friday morning is the one day `openerByLowestBanked` cannot answer — nobody
 * has banked anything yet, so its seat-order tie-break would hand the opening
 * turn to seat 0 in every match ever played. Since going first into a fresh
 * limit is worth something, that is a standing advantage handed out by where
 * you happened to sit down, which is not a thing this game pays for anywhere
 * else.
 *
 * Drawn with a shuffle rather than a die, because that is a table cutting for
 * the deal — and because it is the same `Rng` the decks use, so a replayed
 * match reproduces the same opener.
 */
function openerByLot(G: MagalufG, rng: Rng): number {
  const seats = G.activeSeatIDs;
  const eligible = seats
    .map((_, index) => index)
    .filter((index) => G.players[seats[index]!]!.status !== 'dead');
  return rng.shuffle(eligible)[0] ?? 0;
}

/**
 * Opens the new day: whoever is furthest behind on banked points.
 *
 * Deliberately not a rotation. Going first into a fresh limit is worth
 * something — you drink before anybody has shown you how close the line is —
 * and giving it to the seat that needs it is the only place in the weekend the
 * game hands anything to the player who is losing.
 *
 * Banked only: the round pool was just settled by the night, so it is zero for
 * everybody, and a tie goes to the earlier seat.
 */
function openerByLowestBanked(G: MagalufG): number {
  const seats = G.activeSeatIDs;
  let best = -1;
  for (let index = 0; index < seats.length; index++) {
    const player = G.players[seats[index]!]!;
    if (player.status === 'dead') continue;
    if (best === -1 || player.bankedVP < G.players[seats[best]!]!.bankedVP) best = index;
  }
  return best === -1 ? 0 : best;
}

// ---------------------------------------------------------------------------
// Day / phase lifecycle
// ---------------------------------------------------------------------------

/** `opener` is the seat index that leads off; see the two rules above. */
function startPhase(G: MagalufG, rng: Rng, phaseIndex: number, opener: number): void {
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
  G.pendingChoice = null;
  // Last venue's Cierrabares comes off the board when this one opens.
  G.cierrabares = null;

  if (G.settings.limitRevealAt === PHASE_IDS[phaseIndex]) G.limitRevealed = true;

  // How long the cell holds you is the host's call; 'day' is the shipped rule.
  // 'dead' survives either way -- the concrete is not a setting.
  const releasesArrested = G.settings.arrestLasts === 'phase';

  for (const id of G.activeSeatIDs) {
    const player = G.players[id]!;
    if (player.status === 'withdrawn') player.status = 'partying';
    if (releasesArrested && player.status === 'arrested') {
      player.status = 'partying';
      log(G, 'released', { actor: id });
    }
    // Cleared for everybody, the arrested and the dead included, because the
    // counter restarts at zero each venue: a seat still carrying last venue's
    // sequence number would outrank this venue's real last-out.
    player.withdrawSeq = -1;
    // Above the `continue`, unlike the resets below it. Cierrabares counts
    // every seat, so a seat that sat the last venue out in a cell must not
    // carry that venue's drink count into this one and win a bar it was never
    // in.
    player.drinksThisPhase = 0;
    if (player.status !== 'partying') continue;
    player.skipNextTurn = false;
    player.itemUsedThisTurn = false;
  }

  log(G, 'phaseStart', { descriptionKey: `magaluf.phase.${PHASE_IDS[phaseIndex]}` }, 'round');

  if (partying(G).length === 0) {
    endPhase(G, rng);
    return;
  }

  G.turnSeatID = G.activeSeatIDs[opener]!;
  if (G.players[G.turnSeatID]!.status !== 'partying') advanceTurn(G);
  else G.players[G.turnSeatID]!.itemUsedThisTurn = false;
}

/**
 * **Cierrabares** — the one who closes the bar. Settled at closing time and
 * paid to whoever drank strictly more than anybody else this phase.
 *
 * This replaces Último en Pie, which paid for being alone in the venue at a
 * round boundary. That rule had two problems the playtest found. It paid for
 * *endurance measured in turns* rather than in drinks, so a player who nursed
 * a Porro through a solo lap collected while the player who had actually
 * out-drunk them did not. And it fired invisibly, mid-phase, off lap
 * arithmetic nobody at the table could follow — the log line was the first
 * anyone knew of it.
 *
 * A drink count fixes both. It is the number already printed on every player
 * panel, so the race is legible while it is being run, and it is settled once,
 * in the open, when the venue closes.
 *
 * **Ties pay nobody.** With `maxDrinks` capping the phase at 4/5/4 a contested
 * bar will often end level, and that is the rule working rather than a hole in
 * it: the bonus is for out-drinking the table, and matching it is not
 * out-drinking it. It makes the last drink of a tied phase worth taking.
 *
 * **The `minDrinks` gate survives**, for a new reason. The Aguafiestas penalty
 * already punishes leaving under the minimum, and paying the bonus to somebody
 * who took that penalty would punish and reward one act at once. There is no
 * ambiguity about where the gate applies: the top count is by definition at
 * least everyone else's, so if it fails the minimum then nobody met it and no
 * runner-up is waiting underneath.
 *
 * Every seat is counted, however its phase ended — withdrawn, arrested, at the
 * cap. What you drank is what you drank.
 */
function awardCierrabares(G: MagalufG): void {
  const rules = phaseRules(G);
  const counts = G.activeSeatIDs.map((id) => G.players[id]!.drinksThisPhase);
  const top = Math.max(...counts, 0);

  if (top < rules.minDrinks || counts.filter((n) => n === top).length !== 1) {
    G.cierrabares = null;
    log(G, 'cierrabaresNobody', {}, 'round');
    return;
  }

  const seatID = G.activeSeatIDs[counts.indexOf(top)]!;
  // Into the round pool, not the bank: this was earned tonight, so it rides on
  // tonight's limit check like everything else earned tonight.
  gainVP(G.players[seatID]!, rules.cierrabaresBonus);
  G.cierrabares = { seatID, drinks: top, vp: rules.cierrabaresBonus };
  log(G, 'cierrabares', { actor: seatID, drinks: top, vp: rules.cierrabaresBonus }, 'success');
}

/**
 * A venue closes. Nothing is dealt here any more — the transition is recorded
 * and handed to a round-confirm wait, so the table regroups before the next
 * venue opens. When this was the After the night is resolved instead, which
 * may stand the whole table at a balcony before any gate opens.
 */
function endPhase(G: MagalufG, rng: Rng): void {
  // Before the branch, because the After has no round-confirm wait to fall
  // into — it goes straight to the balcony — and the bar still closed. The
  // drink counts are intact here: they are cleared by the next `startPhase`,
  // never by this one.
  awardCierrabares(G);

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

  // Worked out here, before startPhase clears the sequence it reads.
  if (pending.kind === 'phase') startPhase(G, rng, pending.next, openerAfterLastOut(G));
  else startDay(G, rng, pending.next);
}

function startDay(G: MagalufG, rng: Rng, day: number): void {
  G.day = day;
  G.limitRevealed = false;

  // Shuffle the limit cards and turn one face-down, exactly as a table would.
  // Not an index into an array with a random number. The deck is every integer
  // in the host's band, so it is thirteen cards at the default 16–28.
  G.limit = rng.shuffle(buildLimitDeck(limitRange(G.settings)))[0]!;

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
  // After the resets, so a seat that just came out of a cell counts as alive.
  // Friday is drawn for; every day after it goes to whoever is furthest behind.
  startPhase(G, rng, 0, day === 0 ? openerByLot(G, rng) : openerByLowestBanked(G));
}

/**
 * The jump.
 *
 * **Forfeiting the night is the price of dying, not the price of jumping.**
 * A player who reaches the pool is a survivor in every respect: they bank the
 * round pool at the day's rate exactly as somebody who stayed under the limit
 * would, keep their items, and take the Leyenda bonus on top. Only the
 * concrete costs the pool.
 *
 * That makes the die the whole penalty, and turns the limit from a cliff into
 * a graded one — at `d = 1` on a d6 you keep the night five times out of six.
 */
function jump(G: MagalufG, rng: Rng, seatID: string, multiplier: number): void {
  const player = G.players[seatID]!;
  const d = player.intox - G.limit;
  const poolVP = player.roundVP;

  const outcome = resolveJump(d, G.settings, rng);
  let bankedVP = 0;

  if (outcome.survived) {
    // A survived night counts as survived for the tiebreak too — and it is the
    // drunkest night anybody will ever bring to it.
    player.totalIntoxSurvived += player.intox;
    bankedVP = bankRound(G, seatID, multiplier);
    bankVP(player, outcome.legendVP);
    addResaca(player, outcome.resaca);
  } else {
    player.roundVP = 0;
    player.items = [];
    player.status = 'dead';
  }

  // Nothing is logged here. See `logJump`.

  G.jumps.push({
    day: G.day,
    seatID,
    d,
    limit: G.limit,
    roll: outcome.roll,
    die: G.settings.balconyDie,
    survived: outcome.survived,
    legendVP: outcome.legendVP,
    poolVP,
    lostVP: outcome.survived ? 0 : poolVP,
    bankedVP,
  });
}

function resolveNight(G: MagalufG, rng: Rng): void {
  const multiplier = dayMultipliers(G.settings)[G.day] ?? 1;
  const firstJump = G.jumps.length;

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
      jump(G, rng, id, multiplier);
    } else {
      player.totalIntoxSurvived += player.intox;
      const banked = bankRound(G, id, multiplier);
      log(G, 'survived', { actor: id, vp: banked }, 'success');
    }
  }

  // Every die is already cast — but the table is stood at the first balcony
  // and nothing else happens until it has watched them all. Deliberately
  // *before* `finished`: on the final night the gameover banner would
  // otherwise announce the winner over the top of the roll deciding them, and
  // that ordering is now the engine's job rather than a presentation-side hold.
  if (G.jumps.length > firstJump) {
    G.balcony = { index: firstJump, revealed: false };
    return;
  }

  settleNight(G);
}

/**
 * What the night was holding open: the weekend ends, or tomorrow's gate opens.
 *
 * Re-derived here rather than decided in `resolveNight` and stashed, because
 * neither input can move while the table is at the balcony — no move in that
 * phase touches a player's status or the day — so there is nothing to stash.
 */
function settleNight(G: MagalufG): void {
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
type HandOver = 'turn' | 'balcony' | 'confirm' | 'finished';

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
  // Checked first: a night with jumps in it settles later, from the balcony,
  // so neither `finished` nor the gate is set yet.
  if (G.balcony) return 'balcony';
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
  G.lastDraw = { seatID, alcohol: card.id, event: null, outcome: null, pours: [] };

  if (options.drawsEvent !== false) {
    G.pendingEvent = { seatID, endsTurn: options.endsTurn ?? true };
  }
  return true;
}

/**
 * Turns the pending event face-up.
 *
 * Resolves it outright unless the card asks a question, in which case it is
 * left face-up in `G.pendingChoice` for the drawer to answer. The card is
 * always in `G.lastDraw` before that happens, so the table can read what is
 * being decided rather than watching somebody deliberate over a blank.
 */
function revealPendingEvent(G: MagalufG, rng: Rng): void {
  const pending = G.pendingEvent;
  if (!pending) return;
  G.pendingEvent = null;

  const eventId = drawEvent(G, rng);
  if (!eventId) return;
  if (G.lastDraw) G.lastDraw = { ...G.lastDraw, event: eventId };

  const id = eventId as EventId;
  if (eventOptions(id)) {
    // Logged here rather than in resolveEventOption, so the log reads "drew
    // the card, then picked a branch" in the order it happened at the table.
    log(G, 'event', { actor: pending.seatID, descriptionKey: `magaluf.event.${id}` });
    G.pendingChoice = { seatID: pending.seatID, eventId: id, endsTurn: pending.endsTurn };
    return;
  }

  resolveEvent(G, pending.seatID, id, rng);
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
      addResaca(player, ITEM_EFFECTS.farlopaResaca);
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
    // And so does a face-up one still waiting on its branch. Same argument one
    // step later: an unanswered question is not a free action.
    G.pendingChoice === null &&
    G.turnSeatID === playerID &&
    G.players[playerID]?.status === 'partying'
  );
}

/** Every party move ends the same way: hand on the turn, or leave the venue. */
function handOver(handOver: HandOver, events: MoveCtx['events']): void {
  if (handOver === 'turn') events.endTurn();
  else if (handOver === 'balcony') events.setPhase('balcony');
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
/**
 * How a turn ends once the event is finally done with.
 *
 * Shared by `revealEvent` and `chooseEventOption` because a choice card
 * finishes in the second of those: the turn cannot be handed on at reveal time
 * when the card has not actually happened yet.
 *
 * The `atCap` re-check earns its keep here. A drink hands the turn on; a
 * Farlopa's extra draw does not — but Doble o nada can pour a fourth drink
 * into a player who had a free action left, and somebody at closing time has
 * nothing to spend it on.
 */
function settleAfterEvent(
  G: MagalufG,
  rng: Rng,
  playerID: string,
  endsTurn: boolean,
  events: MoveCtx['events'],
): void {
  const player = G.players[playerID]!;
  const atCap = player.drinksThisPhase >= phaseRules(G).maxDrinks;
  // A branch that walked the player out of the venue always hands on, whatever
  // the drink that started it was going to do.
  const left = player.status !== 'partying';
  if (endsTurn || atCap || left) handOver(finishTurn(G, rng), events);
}

function revealEvent({ G, playerID, random, events }: MoveCtx): typeof INVALID_MOVE | void {
  const pending = G.pendingEvent;
  if (G.finished || !pending || pending.seatID !== playerID) return INVALID_MOVE;

  const rng = fromBoardgameRandom(random);
  revealPendingEvent(G, rng);

  // A choice card is not finished yet -- chooseEventOption settles the turn.
  if (G.pendingChoice) return;

  settleAfterEvent(G, rng, playerID, pending.endsTurn, events);
}

/**
 * Picks one branch of a face-up choice card.
 *
 * Only the seat that drew it may answer, and until they do it is the only move
 * anyone has -- exactly the contract `revealEvent` already established.
 */
function chooseEventOption(
  { G, playerID, random, events }: MoveCtx,
  index: number,
): typeof INVALID_MOVE | void {
  const pending = G.pendingChoice;
  if (G.finished || !pending || pending.seatID !== playerID) return INVALID_MOVE;

  const options = eventOptions(pending.eventId);
  if (!options) return INVALID_MOVE;
  if (!Number.isInteger(index) || index < 0 || index >= options.length) return INVALID_MOVE;

  G.pendingChoice = null;
  const rng = fromBoardgameRandom(random);
  resolveEventOption(G, playerID, options[index]!, rng);

  settleAfterEvent(G, rng, playerID, pending.endsTurn, events);
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

// --- Balcony moves ---------------------------------------------------------
//
// The whole table is looking at one balcony at a time and only the jumper has
// the buttons. Everyone else is watching, which is the point: the outcome of
// somebody else's roll is not yours to read ahead.

interface BalconyCtx {
  G: MagalufG;
  playerID: string;
  events: { setPhase(phase: string): void };
}

/**
 * Writes a resolved jump into the log — at the moment the table finds out,
 * which is not the moment the die was cast.
 *
 * `resolveNight` rolls every jump of the night up front and then stands the
 * table at the first balcony to walk through them one at a time. That is the
 * right order for the engine (the outcome cannot drift while the overlay is
 * open) and it was the wrong order for the feed: the log narrated all of it
 * before the first roll had been turned face-up, so anybody glancing at the
 * chat already knew who was dead. The overlay was ceremony over a spoiler.
 *
 * So the record is written from `leaveBalcony`, as each jump is left behind,
 * and it reads from the `JumpRecord` rather than from live player state —
 * which is why it can be written late at all: the record is a snapshot, and
 * nothing between the roll and the reveal can change what it says.
 */
function logJump(G: MagalufG, jump: JumpRecord): void {
  if (jump.survived) {
    log(G, 'piscina', { actor: jump.seatID, d: jump.d, roll: jump.roll, vp: jump.legendVP }, 'special');
    // The ordinary survivor's line, reused: from here the night reads the same
    // as anybody else's, which is exactly the claim the rule now makes.
    log(G, 'survived', { actor: jump.seatID, vp: jump.bankedVP }, 'success');
  } else {
    log(G, 'cemento', { actor: jump.seatID, d: jump.d, roll: jump.roll }, 'failure');
  }
}

/** The jump on screen, or null if the table is not at a balcony. */
function balconyJump(G: MagalufG) {
  if (!G.balcony) return null;
  return G.jumps[G.balcony.index] ?? null;
}

/**
 * Steps the table to `nextIndex`, or leaves the balcony if that is past the
 * end — at which point the night finally settles into a gate or the gameover.
 */
function leaveBalcony(G: MagalufG, nextIndex: number, events: BalconyCtx['events']): void {
  // Everything being stepped past goes into the log now, in order. Written
  // here rather than in `revealJump` because this is the one path both the
  // ordinary walk and the host's skip go through, which makes "exactly once
  // per jump" fall out of the control flow instead of needing a flag.
  for (let i = G.balcony?.index ?? 0; i < Math.min(nextIndex, G.jumps.length); i++) {
    logJump(G, G.jumps[i]!);
  }

  if (nextIndex < G.jumps.length) {
    G.balcony = { index: nextIndex, revealed: false };
    return;
  }

  G.balcony = null;
  settleNight(G);
  // 'finished' needs no phase change: the top-level endIf ends the match.
  if (!G.finished) events.setPhase('confirm');
}

/**
 * Turns the die face-up — for everybody at once.
 *
 * Only the seat doing the jumping, which is the whole of the fix: the roll was
 * made by the engine before any of this rendered, so the only thing left to
 * own is the moment of finding out, and it belongs to the person on the rail.
 */
function revealJump({ G, playerID }: BalconyCtx): typeof INVALID_MOVE | void {
  const jump = balconyJump(G);
  if (!G.balcony || G.balcony.revealed || !jump || jump.seatID !== playerID) {
    return INVALID_MOVE;
  }
  G.balcony = { ...G.balcony, revealed: true };
}

/** Done reading it out; on to the next balcony, or off to bed. */
function advanceJump({ G, playerID, events }: BalconyCtx): typeof INVALID_MOVE | void {
  const jump = balconyJump(G);
  if (!G.balcony || !G.balcony.revealed || !jump || jump.seatID !== playerID) {
    return INVALID_MOVE;
  }
  leaveBalcony(G, G.balcony.index + 1, events);
}

/**
 * Drops the rest of the night's jumps in one go.
 *
 * Host-only, and for the same reason `forceAdvanceRoundMove` is: a jumper who
 * has closed the tab would otherwise hold the whole table on a balcony
 * forever. It is an escape hatch, not a way to skip your own roll — which is
 * why it is not the jumper's button.
 */
function skipBalcony({ G, playerID, events }: BalconyCtx): typeof INVALID_MOVE | void {
  // hostPlayerID === null must never authorize anyone -- see forceAdvanceRoundMove.
  if (!G.balcony || G.hostPlayerID === null || playerID !== G.hostPlayerID) {
    return INVALID_MOVE;
  }
  leaveBalcony(G, G.jumps.length, events);
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
  if (!Array.isArray(claimed) || claimed.length < 2) {
    return 'magaluf-v1: needs at least 2 claimed seats';
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
      pendingChoice: null,
      cierrabares: null,
      pendingAdvance: null,
      roundConfirm: null,
      hostPlayerID: setupData?.hostPlayerID ?? null,
      jumps: [],
      balcony: null,
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
      moves: { drink, revealEvent, chooseEventOption, withdraw, useItem },
      onBegin: ({ G, events }) => {
        // A venue nobody can attend -- everyone arrested, or dead -- closes on
        // arrival and ends the night on the spot. Bouncing straight back keeps
        // that from stranding the table in a phase where nothing is playable.
        // The balcony is checked first: a night that produced jumps has not
        // opened its gate yet.
        if (G.balcony) events.setPhase('balcony');
        else if (G.roundConfirm) events.setPhase('confirm');
      },
    },

    // The night's jumps, watched together. ActivePlayers.ALL because the seat
    // whose roll it is is almost never the one who happened to be up, and the
    // host needs the escape hatch from wherever they are sitting.
    balcony: {
      turn: { activePlayers: ActivePlayers.ALL },
      moves: { revealJump, advanceJump, skipBalcony },
      // Handed on explicitly by leaveBalcony, like every other transition here.
      next: 'confirm',
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
