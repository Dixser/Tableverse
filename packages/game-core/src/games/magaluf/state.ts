/**
 * State shape and the low-level primitives that operate on it.
 *
 * Split out from `gameDef.ts` so `events.ts` can use these primitives without
 * importing the game definition, which would create a cycle. Everything here
 * is plain JSON — no `Map`, `Set` or class instance ever enters `G`.
 */

import type { GameLogEntry, SoundCue } from '../../types.js';
import type { RoundConfirmG } from '../../roundConfirm.js';
import type { AlcoholCard, EventId, ItemId, PhaseId } from './cards.js';
import { ALCOHOL, CONTRABAND, PHASE_IDS } from './cards.js';
import type { PhaseRules } from './constants.js';
import { PHASE_RULES } from './constants.js';
import type { MagalufSettings } from './settings.js';
import type { Rng } from './rng.js';

export type PlayerStatus = 'partying' | 'withdrawn' | 'arrested' | 'dead';

export interface MagalufPlayer {
  /** Current intoxication. Resets each morning to `resaca`, not to zero. */
  intox: number;
  /**
   * Hangover floor: where tomorrow morning's intoxication starts. It used to
   * only ever grow, which made it the one number in the game nobody could
   * argue with — you took it from a card you did not choose and carried it to
   * Sunday. It can now be slept off, so choice cards have something real to
   * trade against. Still floored at zero.
   */
  resaca: number;
  bankedVP: number;
  /** Unbanked. Forfeited entirely if you go over the limit. */
  roundVP: number;
  items: ItemId[];
  status: PlayerStatus;
  drinksThisPhase: number;
  skipNextTurn: boolean;
  /** Pastis armed: next drink's VP is doubled. */
  pastisArmed: boolean;
  /** Spent a Red Bull. The only per-player secret in the game. */
  peekedLimit: boolean;
  itemUsedThisTurn: boolean;
  /** Order of leaving the current phase; -1 while still partying. */
  withdrawSeq: number;
  totalDrinks: number;
  /** Sum of end-of-day intoxication over nights survived. Tiebreak. */
  totalIntoxSurvived: number;
}

export interface JumpRecord {
  day: number;
  seatID: string;
  /** How far over the limit they were. */
  d: number;
  /** The limit that applied that night — by display time G.limit has moved on. */
  limit: number;
  /** What the die showed, and how many faces it had. Shown on the board. */
  roll: number;
  die: number;
  survived: boolean;
  legendVP: number;
  /** The round pool riding on the roll. Shown before the die is read. */
  poolVP: number;
  /** Unbanked VP forfeited. Only the concrete costs anything: 0 on a survival. */
  lostVP: number;
  /** Banked by a survivor: the pool at the day's rate, legend bonus excluded. */
  bankedVP: number;
}

/**
 * The cards face-up on the table from the most recent draw.
 *
 * Public, and kept in `G` rather than recovered from the log tail: a Ronda
 * appends one `drank` entry per player and a Chupito de la casa chains a
 * second for the same seat, so "the last entry" is not reliably "the draw
 * that just happened". Added by feature 033, which needs to render it.
 */
export interface LastDraw {
  seatID: string;
  alcohol: string;
  event: EventId | null;
  /**
   * What the event actually worked out to, for cards whose printed text is a
   * rule rather than a number — "+1 VP per drink this phase" does not tell you
   * what you got, and "whoever drank most" does not tell you who that was.
   *
   * An i18n key plus params rather than text, for the same reason the log is:
   * the engine runs on the server and must not hold display strings. Seat IDs
   * in `params` are resolved to names by the board, exactly as the chat feed
   * resolves the same keys.
   */
  outcome: EventOutcome | null;
}

/** A resolved event result, shaped like a log entry because it is one. */
export interface EventOutcome {
  key: string;
  params?: Record<string, string | number>;
}

/**
 * What a round-confirm wait is holding open.
 *
 * Stored rather than re-derived from `G.phase` when the wait completes: the
 * transition already knew whether it was opening the next venue or starting
 * the next day, and reconstructing that afterwards would be a second source
 * of truth for a question that had already been answered.
 */
export type PendingAdvance =
  | { kind: 'phase'; next: number }
  | { kind: 'day'; next: number };

/**
 * An event card drawn but not yet turned over.
 *
 * At a table you flip the alcohol card, everyone updates their numbers, and
 * only then do you turn the event and read it out. Resolving both in one
 * action asked players to absorb two cards at once, so the reveal is its own
 * step — the same cards in the same order, just with somewhere to breathe.
 */
export interface PendingEvent {
  /** Who owes the reveal. Always the seat that just drew. */
  seatID: string;
  /**
   * Whether resolving it also hands the turn on. A drink does; the extra draw
   * a Farlopa buys does not, because that player still has their own action.
   */
  endsTurn: boolean;
}

/**
 * An event card turned face-up whose branch the drawer has not picked yet.
 *
 * Deliberately the same shape as PendingEvent, one step further along: the
 * reveal already proved that "the table waits on one seat for one decision"
 * works with this game's turn order, so a choice is that pattern again rather
 * than a boardgame.io stage. It also means `canAct` stays a single readable
 * expression instead of splitting across stage definitions.
 */
export interface PendingChoice {
  /** Who owes the decision. Always the seat that drew the card. */
  seatID: string;
  eventId: EventId;
  /** Carried through from the PendingEvent that produced it. */
  endsTurn: boolean;
}

export interface MagalufG extends RoundConfirmG {
  /** Seats claimed by a real user at match start; the platform always creates maxPlayers engine seats. */
  activeSeatIDs: string[];
  settings: MagalufSettings;
  day: number;
  phase: number;
  /** The day's limit. Hidden by playerView until revealed or peeked at. */
  limit: number;
  limitRevealed: boolean;
  /** Whose turn it is. The TurnOrderConfig reads this rather than computing it. */
  turnSeatID: string;
  alcoholDeck: string[];
  alcoholDiscard: string[];
  eventDeck: EventId[];
  eventDiscard: EventId[];
  players: Record<string, MagalufPlayer>;
  withdrawCounter: number;
  /** Most recent draw, for the board's reveal. Cleared at each phase start. */
  lastDraw: LastDraw | null;
  /** Non-null while a drawn event card is still face-down. */
  pendingEvent: PendingEvent | null;
  /** Non-null while a face-up choice card is waiting on its drawer. */
  pendingChoice: PendingChoice | null;
  /**
   * Index of the seat that opened the current phase. The lap boundary Último
   * en Pie is measured against — see `advanceTurn`.
   */
  roundAnchor: number;
  /** Último en Pie is paid at most once per phase. */
  lastStandingAwarded: boolean;
  /** Non-null only while a round-confirm wait is holding a transition open. */
  pendingAdvance: PendingAdvance | null;
  /** Every jump resolved this match, oldest first. Drives the board's balcony moment. */
  jumps: JumpRecord[];
  log: GameLogEntry[];
  /** Set once the weekend is over, so endIf stays a pure read. */
  finished: boolean;
}

export function newPlayer(): MagalufPlayer {
  return {
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
  };
}

export function phaseId(G: MagalufG): PhaseId {
  return PHASE_IDS[G.phase]!;
}

export function phaseRules(G: MagalufG): PhaseRules {
  return PHASE_RULES[phaseId(G)];
}

export function partying(G: MagalufG): string[] {
  return G.activeSeatIDs.filter((id) => G.players[id]?.status === 'partying');
}

/**
 * Seats a round-confirm wait is allowed to wait on.
 *
 * The dead are excluded deliberately. Their weekend is over, so holding the
 * table open until an eliminated player who has wandered off clicks a button
 * would punish the living for someone else's death. They still see the banner;
 * they are simply not counted.
 */
export function confirmableSeats(G: MagalufG): string[] {
  return G.activeSeatIDs.filter((id) => G.players[id]?.status !== 'dead');
}

export function log(
  G: MagalufG,
  key: string,
  params?: Record<string, string | number>,
  sound?: SoundCue,
): void {
  const entry: GameLogEntry = { key: `magaluf.log.${key}` };
  if (params) entry.params = params;
  if (sound) entry.sound = sound;
  G.log.push(entry);
}

/**
 * Logs an event's worked-out result AND pins it to the drawn card.
 *
 * One call rather than two because the two must never disagree: the card on
 * the table and the line in the feed are the same sentence, and a card that
 * said one thing while the log said another would be worse than either alone.
 */
export function logOutcome(
  G: MagalufG,
  key: string,
  params?: Record<string, string | number>,
  sound?: SoundCue,
): void {
  log(G, key, params, sound);
  if (G.lastDraw) {
    const outcome: EventOutcome = { key: `magaluf.log.${key}` };
    if (params) outcome.params = params;
    G.lastDraw = { ...G.lastDraw, outcome };
  }
}

/** Seats ranked by a public number, highest first; ties broken by seat order. */
export function rankSeats(
  G: MagalufG,
  value: (player: MagalufPlayer) => number,
): { seatID: string; value: number }[] {
  return G.activeSeatIDs
    .map((seatID) => ({ seatID, value: value(G.players[seatID]!) }))
    .sort((a, b) => b.value - a.value || Number(a.seatID) - Number(b.seatID));
}

/** A ranking as the two parallel params the chat feed zips into a leaderboard. */
export function rankingParams(
  ranked: { seatID: string; value: number }[],
): { ranking: string; rankingValues: string } {
  return {
    ranking: ranked.map((r) => r.seatID).join(','),
    rankingValues: ranked.map((r) => r.value).join(','),
  };
}

// ---------------------------------------------------------------------------
// Decks
// ---------------------------------------------------------------------------

export function buildDeck<T extends string>(counts: Partial<Record<T, number>>): T[] {
  const out: T[] = [];
  for (const id of Object.keys(counts) as T[]) {
    for (let i = 0; i < (counts[id] ?? 0); i++) out.push(id);
  }
  return out;
}

/**
 * Reshuffling the discard should never actually happen: every phase deck is
 * larger than the maximum possible draws at `maxPlayers`. It is handled
 * rather than asserted because a deck running dry mid-phase would otherwise
 * deadlock the match.
 */
export function drawAlcohol(G: MagalufG, rng: Rng): AlcoholCard | null {
  if (G.alcoholDeck.length === 0) {
    if (G.alcoholDiscard.length === 0) return null;
    G.alcoholDeck = rng.shuffle(G.alcoholDiscard);
    G.alcoholDiscard = [];
  }
  const id = G.alcoholDeck.pop()!;
  G.alcoholDiscard.push(id);
  return ALCOHOL[id]!;
}

export function drawEvent(G: MagalufG, rng: Rng): EventId | null {
  if (G.eventDeck.length === 0) {
    if (G.eventDiscard.length === 0) return null;
    G.eventDeck = rng.shuffle(G.eventDiscard);
    G.eventDiscard = [];
  }
  const id = G.eventDeck.pop()!;
  G.eventDiscard.push(id);
  return id;
}

// ---------------------------------------------------------------------------
// Player primitives
// ---------------------------------------------------------------------------

export function gainVP(player: MagalufPlayer, amount: number): void {
  player.roundVP += amount;
}

export function addIntox(player: MagalufPlayer, amount: number): void {
  player.intox = Math.max(0, player.intox + amount);
}

/** Signed, unlike the `+=` this replaced: negative sleeps some of it off. */
export function addResaca(player: MagalufPlayer, amount: number): void {
  player.resaca = Math.max(0, player.resaca + amount);
}

export function hasContraband(player: MagalufPlayer): boolean {
  return player.items.some((id) => CONTRABAND.includes(id));
}

export function dropContraband(player: MagalufPlayer): void {
  player.items = player.items.filter((id) => !CONTRABAND.includes(id));
}

export function removeItem(player: MagalufPlayer, item: ItemId): boolean {
  const index = player.items.indexOf(item);
  if (index === -1) return false;
  player.items.splice(index, 1);
  return true;
}

/** The most intoxicated seat still partying; ties broken by seat order. */
export function drunkestSeat(G: MagalufG): string | null {
  const candidates = partying(G);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, id) =>
    G.players[id]!.intox > G.players[best]!.intox ? id : best,
  );
}

// ---------------------------------------------------------------------------
// Drinking, leaving, banking
// ---------------------------------------------------------------------------

/**
 * Applies one alcohol card to a player.
 *
 * Also used for drinks a player did not choose — a Ronda, a Chupito de la
 * casa — which deliberately still count toward their phase drink total. If
 * somebody buys you a shot, you drank it.
 */
export function consumeAlcohol(
  G: MagalufG,
  seatID: string,
  card: AlcoholCard,
  options: { halveIntox?: boolean } = {},
): void {
  const player = G.players[seatID]!;
  const intox = options.halveIntox ? Math.floor(card.intox / 2) : card.intox;

  let vp = card.vp;
  if (player.pastisArmed) {
    vp *= 2;
    player.pastisArmed = false;
  }

  addIntox(player, intox);
  gainVP(player, vp);
  player.drinksThisPhase += 1;
  player.totalDrinks += 1;

  log(G, 'drank', { actor: seatID, descriptionKey: `magaluf.alcohol.${card.id}`, intox, vp }, 'play');
}

export type LeaveReason = 'withdrew' | 'closingTime' | 'ambulance' | 'bouncer';

/**
 * Removes a seat from the current phase without judgement about why. The
 * Aguafiestas penalty is applied by the caller and only for a voluntary
 * withdrawal — being carried out by an ambulance or thrown out by a bouncer
 * is not cowardice.
 */
export function leavePhase(G: MagalufG, seatID: string, reason: LeaveReason): void {
  const player = G.players[seatID]!;
  player.status = 'withdrawn';
  player.withdrawSeq = G.withdrawCounter++;
  log(G, reason, { actor: seatID });
}

/** Moves the round's unbanked VP into the permanent pile, at the day's rate. */
export function bankRound(G: MagalufG, seatID: string, multiplier: number): number {
  const player = G.players[seatID]!;
  const banked = Math.round(player.roundVP * multiplier);
  player.bankedVP += banked;
  player.roundVP = 0;
  return banked;
}

/**
 * A night in the cells. Banks the round's VP immediately and permanently,
 * ends the seat's day, and — crucially — means no limit check tonight.
 */
export function arrest(G: MagalufG, seatID: string, multiplier: number): void {
  bankRound(G, seatID, multiplier);
  const player = G.players[seatID]!;
  player.status = 'arrested';
  player.withdrawSeq = G.withdrawCounter++;
  log(G, 'arrested', { actor: seatID }, 'special');
}
