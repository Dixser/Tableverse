/**
 * State shape and the low-level primitives that operate on it.
 *
 * Split out from `gameDef.ts` so `events.ts` can use these primitives without
 * importing the game definition, which would create a cycle. Everything here
 * is plain JSON — no `Map`, `Set` or class instance ever enters `G`.
 */

import type { GameLogEntry, SoundCue } from '../../types.js';
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
  /** Permanent hangover floor. Only ever grows. */
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
  survived: boolean;
  legendVP: number;
  /** Unbanked VP forfeited by jumping. */
  lostVP: number;
}

export interface MagalufG {
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
