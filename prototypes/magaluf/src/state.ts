/**
 * State shape and the low-level primitives that operate on it.
 *
 * Split out from `engine.ts` so that `events.ts` can use these primitives
 * without importing the engine, which would create a cycle. Everything here
 * is plain JSON — no `Map`, `Set`, class instance or function ever enters the
 * state tree, because boardgame.io's `G` has exactly that constraint and the
 * port should not have to relitigate it.
 */

import type { AlcoholCard, EventId, ItemId, PhaseId } from './cards.ts';
import { ALCOHOL, ITEMS, PHASE_IDS } from './cards.ts';
import type { Config, PhaseConfig } from './config.ts';
import type { Random } from './rng.ts';

export type PlayerStatus = 'partying' | 'withdrawn' | 'arrested' | 'dead';

export interface PlayerState {
  id: number;
  name: string;
  /** Current intoxication. Resets each morning to `resaca`, not to zero. */
  intox: number;
  /** Permanent hangover floor. Only ever grows. */
  resaca: number;
  bankedVP: number;
  /** Unbanked. Lost entirely if you go over the limit. */
  roundVP: number;
  items: ItemId[];
  status: PlayerStatus;
  drinksThisPhase: number;
  skipNextTurn: boolean;
  /** Pastis armed: next drink's VP is doubled. */
  pastisArmed: boolean;
  /** Saw the day's limit via Red Bull — the only private knowledge in the game. */
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
  playerId: number;
  /** How far over the limit they were. */
  d: number;
  /**
   * The limit that applied that night. Recorded because by the time anything
   * displays a jump the engine has already moved on and drawn the next day's
   * card, so `state.limit` is the wrong number to show.
   */
  limit: number;
  survived: boolean;
  legendVP: number;
  /** Unbanked VP forfeited by jumping — what the gamble actually cost. */
  lostVP: number;
}

export interface LogEntry {
  kind: string;
  player?: number;
  card?: string;
  item?: ItemId;
  event?: EventId;
  n?: number;
}

export interface GameState {
  /** The RNG's position, kept in state so a game replays from JSON alone. */
  rngState: number;
  day: number;
  phase: number;
  /** The day's limit, drawn face-down each morning. -1 before the day starts. */
  limit: number;
  limitRevealed: boolean;
  alcoholDeck: string[];
  alcoholDiscard: string[];
  eventDeck: EventId[];
  eventDiscard: EventId[];
  players: PlayerState[];
  turnIndex: number;
  startPlayer: number;
  withdrawCounter: number;
  log: LogEntry[];
  jumps: JumpRecord[];
  over: boolean;
  /** Counters the simulator reads; not part of the rules. */
  stats: GameStats;
}

export interface GameStats {
  farlopaByDay: number[];
  earlyExits: number;
  totalExits: number;
  redadasDrawn: number;
  redadasThatDidNothing: number;
  /** Arrests that cancelled a limit check the player would have failed. */
  redadaRescues: number;
  turnsTaken: number;
  /**
   * Times a deck had to be rebuilt from its discard mid-phase. Should stay at
   * zero: the per-phase drink caps are meant to bound draws below deck size,
   * so a non-zero count means a deck is undersized for the player count.
   */
  reshuffles: number;
  /**
   * VP and intoxication actually banked per phase, drinks and their events
   * together. The ratio between them is what decides whether pushing into a
   * later, more dangerous phase is worth anything.
   */
  vpByPhase: number[];
  intoxByPhase: number[];
}

export function emptyStats(): GameStats {
  return {
    farlopaByDay: [0, 0, 0],
    earlyExits: 0,
    totalExits: 0,
    redadasDrawn: 0,
    redadasThatDidNothing: 0,
    redadaRescues: 0,
    turnsTaken: 0,
    reshuffles: 0,
    vpByPhase: [0, 0, 0],
    intoxByPhase: [0, 0, 0],
  };
}

export function phaseId(state: GameState): PhaseId {
  return PHASE_IDS[state.phase]!;
}

export function phaseConfig(state: GameState, config: Config): PhaseConfig {
  return config.phases[phaseId(state)];
}

export function partying(state: GameState): PlayerState[] {
  return state.players.filter((p) => p.status === 'partying');
}

export function log(state: GameState, entry: LogEntry): void {
  state.log.push(entry);
}

// ---------------------------------------------------------------------------
// Decks
// ---------------------------------------------------------------------------

export function buildDeck<T extends string>(counts: Partial<Record<T, number>>): T[] {
  const out: T[] = [];
  for (const id of Object.keys(counts) as T[]) {
    const n = counts[id] ?? 0;
    for (let i = 0; i < n; i++) out.push(id);
  }
  return out;
}

/**
 * Draws an alcohol card, reshuffling the discard back in when the deck runs
 * dry. Returns null only if there is genuinely no card anywhere, which ends
 * the phase.
 */
export function drawAlcohol(state: GameState, rng: Random): AlcoholCard | null {
  if (state.alcoholDeck.length === 0) {
    if (state.alcoholDiscard.length === 0) return null;
    state.alcoholDeck = rng.shuffle(state.alcoholDiscard);
    state.alcoholDiscard = [];
    state.stats.reshuffles += 1;
  }
  const id = state.alcoholDeck.pop()!;
  state.alcoholDiscard.push(id);
  return ALCOHOL[id]!;
}

export function drawEvent(state: GameState, rng: Random): EventId | null {
  if (state.eventDeck.length === 0) {
    if (state.eventDiscard.length === 0) return null;
    state.eventDeck = rng.shuffle(state.eventDiscard);
    state.eventDiscard = [];
    state.stats.reshuffles += 1;
  }
  const id = state.eventDeck.pop()!;
  state.eventDiscard.push(id);
  return id;
}

// ---------------------------------------------------------------------------
// Player primitives
// ---------------------------------------------------------------------------

export function gainVP(player: PlayerState, amount: number): void {
  player.roundVP += amount;
}

export function addIntox(player: PlayerState, amount: number): void {
  player.intox = Math.max(0, player.intox + amount);
}

export function addResaca(player: PlayerState, amount: number): void {
  player.resaca += amount;
}

export function hasContraband(player: PlayerState): boolean {
  return player.items.some((id) => ITEMS[id].contraband);
}

export function dropContraband(player: PlayerState): ItemId[] {
  const dropped = player.items.filter((id) => ITEMS[id].contraband);
  player.items = player.items.filter((id) => !ITEMS[id].contraband);
  return dropped;
}

export function giveItem(player: PlayerState, item: ItemId): void {
  player.items.push(item);
}

export function removeItem(player: PlayerState, item: ItemId): boolean {
  const idx = player.items.indexOf(item);
  if (idx === -1) return false;
  player.items.splice(idx, 1);
  return true;
}

/** The most intoxicated player still partying; ties broken by lowest id. */
export function drunkest(state: GameState): PlayerState | null {
  const candidates = partying(state);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, p) => (p.intox > best.intox ? p : best));
}

// ---------------------------------------------------------------------------
// Drinking and leaving
// ---------------------------------------------------------------------------

export interface ConsumeOptions {
  /** Farlopa's extra draw takes half intoxication. */
  halveIntox?: boolean;
}

/**
 * Applies one alcohol card to a player.
 *
 * Also used for drinks a player did not choose — a Ronda, a Chupito de la
 * casa — which deliberately still count toward their phase drink total. If
 * someone buys you a shot, you drank it.
 */
export function consumeAlcohol(
  state: GameState,
  config: Config,
  player: PlayerState,
  card: AlcoholCard,
  options: ConsumeOptions = {},
): void {
  let intox = card.intox;
  if (options.halveIntox) {
    const halved = card.intox / 2;
    intox = config.items.farlopaRounding === 'ceil' ? Math.ceil(halved) : Math.floor(halved);
  }

  let vp = card.vp;
  if (player.pastisArmed) {
    vp *= 2;
    player.pastisArmed = false;
  }

  addIntox(player, intox);
  gainVP(player, vp);
  player.drinksThisPhase += 1;
  player.totalDrinks += 1;

  log(state, { kind: 'drank', player: player.id, card: card.id, n: intox });
}

export type LeaveReason = 'withdrew' | 'closingTime' | 'ambulance' | 'bouncer';

/**
 * Removes a player from the current phase without judgement about why.
 *
 * The Aguafiestas penalty is applied by the caller, and only for a voluntary
 * withdrawal — being carried out by an ambulance or thrown out at closing
 * time is not cowardice.
 */
export function leavePhase(state: GameState, player: PlayerState, reason: LeaveReason): void {
  player.status = 'withdrawn';
  player.withdrawSeq = state.withdrawCounter++;
  log(state, { kind: reason, player: player.id });
}

/**
 * A night in the cells. Banks the round's VP immediately and permanently,
 * ends the player's day, and — crucially — means no limit check tonight.
 */
export function arrest(state: GameState, config: Config, player: PlayerState): void {
  bankRound(state, config, player);
  player.status = 'arrested';
  player.withdrawSeq = state.withdrawCounter++;
  log(state, { kind: 'arrested', player: player.id });
}

/** Moves the round's unbanked VP into the permanent pile, at the day's rate. */
export function bankRound(state: GameState, config: Config, player: PlayerState): number {
  const multiplier = config.dayVPMultiplier[state.day] ?? 1;
  const banked = Math.round(player.roundVP * multiplier);
  player.bankedVP += banked;
  player.roundVP = 0;
  return banked;
}
