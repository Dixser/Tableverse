/**
 * State shape and the low-level primitives that operate on it.
 *
 * Split out from `gameDef.ts` so `events.ts` can use these primitives without
 * importing the game definition, which would create a cycle. Everything here
 * is plain JSON — no `Map`, `Set` or class instance ever enters `G`.
 */

import type { GameLogEntry, SoundCue } from '../../types.js';
import type { RoundConfirmG } from '../../roundConfirm.js';
import type { AlcoholCard, CardInstance, EventId, ItemId, PhaseId } from './cards.js';

/** A printed alcohol card; the deck holds these, not bare ids. */
export type AlcoholInstance = CardInstance<string>;
export type EventInstance = CardInstance<EventId>;
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
 * The balcony the whole table is stood at.
 *
 * The jump itself is already resolved and sitting in `G.jumps` — this is only
 * *when the table learns it*, and it lives in `G` rather than in each client's
 * head so that everyone learns it at the same moment. It used to be per-viewer
 * local state, which meant a player could watch every other seat's roll play
 * out at their own pace, and knew the whole night's death toll while the
 * jumpers were still deciding to click. The reveal is a shared moment or it is
 * not a moment at all.
 *
 * Only the jumper may move it along: it is their roll to read out.
 */
export interface BalconyView {
  /** Index into `G.jumps` of the jump the table is watching. */
  index: number;
  /** True once the jumper has jumped and the die is face-up for everyone. */
  revealed: boolean;
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
  /** The printed card, so the board shows the copy that was actually drawn. */
  alcohol: AlcoholInstance;
  event: EventInstance | null;
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
  /**
   * The drinks the *card* poured, in the order they came off the deck.
   *
   * A Ronda buys the whole venue a round and a Chupito de la casa buys the
   * drawer one more; those cards came off the same deck as the drink already
   * face-up on the table, and until now nobody could see them. "Everyone
   * drinks" told the table a rule, not what it cost them — the numbers only
   * showed up as intoxication that had already moved.
   *
   * Not the drawer's own chosen drink: that is `alcohol`, above, and it is on
   * the table before the event is even turned over.
   */
  pours: PouredDrink[];
}

/** One drink somebody did not choose, with the numbers actually applied. */
export interface PouredDrink {
  seatID: string;
  /** The printed card, so a poured drink shows the copy that came off the deck. */
  alcohol: AlcoholInstance;
  /** After halving, and after any Pastis doubling — what the seat really took. */
  intox: number;
  vp: number;
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

/**
 * A Duelo in progress: two seats taking turns to drink or back down.
 *
 * The first thing in the game a seat other than the turn seat has to answer,
 * which is why the exchange runs in its own boardgame.io phase rather than as
 * a third link in the `pendingEvent` → `pendingChoice` chain -- see the `duel`
 * phase in `gameDef.ts`. The opponent pick still happens in `party`, while
 * the challenger is the seat that is up, so `targetID` is null for that step.
 */
export interface PendingDuel {
  /** The drawer. Owes the opponent pick, then answers every other drink. */
  challengerID: string;
  /** Null while the challenger is still choosing. */
  targetID: string | null;
  /** Whose decision it is. The target answers first; null until picked. */
  toActID: string | null;
  /** Which printing, so the pot is read at the rate on the card. */
  eventId: EventId;
  /** Drinks poured in this duel, both sides. `d` in `duelPot`. */
  drinks: number;
  /**
   * Duelists who have reached `maxDrinks`, in the order they did. They drink
   * on past it and are sent home when the duel ends, in this order -- a sweep
   * in seat order would let where somebody sits decide who opens the next
   * venue.
   */
  overCap: string[];
  /** Carried through from the PendingChoice that produced it. */
  endsTurn: boolean;
}

/** What the board shows about the bar that just closed. */
export interface Cierrabares {
  seatID: string;
  /** The winning drink count, so the panel can show what it took. */
  drinks: number;
  vp: number;
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
  alcoholDeck: AlcoholInstance[];
  alcoholDiscard: AlcoholInstance[];
  eventDeck: EventInstance[];
  eventDiscard: EventInstance[];
  players: Record<string, MagalufPlayer>;
  withdrawCounter: number;
  /** Most recent draw, for the board's reveal. Cleared at each phase start. */
  lastDraw: LastDraw | null;
  /** Non-null while a drawn event card is still face-down. */
  pendingEvent: PendingEvent | null;
  /** Non-null while a face-up choice card is waiting on its drawer. */
  pendingChoice: PendingChoice | null;
  /** Non-null from a Duelo's `retar` until the duel is settled. */
  pendingDuel: PendingDuel | null;
  /**
   * Who closed the bar this phase, or `null` when the count tied or nobody met
   * the drink minimum. Set at closing time and cleared when the next venue
   * opens, so the board has something to show while the table regroups.
   */
  cierrabares: Cierrabares | null;
  /** Non-null only while a round-confirm wait is holding a transition open. */
  pendingAdvance: PendingAdvance | null;
  /** Every jump resolved this match, oldest first. Drives the board's balcony moment. */
  jumps: JumpRecord[];
  /**
   * Non-null while the table is stood at the balcony watching one of them.
   * The night does not settle — no gate, no gameover — until it is null again.
   */
  balcony: BalconyView | null;
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

/**
 * The tuned per-phase rules, with the host's `maxDrinksOverride` applied.
 *
 * `0` (the default) becomes `Infinity`, which every existing
 * `drinksThisPhase >= maxDrinks` comparison already handles correctly
 * (always false) without any other call site needing to know the cap can
 * be absent. `-1` opts back into the tuned cap for this phase, unchanged.
 */
export function phaseRules(G: MagalufG): PhaseRules {
  const rules = PHASE_RULES[phaseId(G)];
  const override = G.settings.maxDrinksOverride;
  if (override < 0) return rules;
  return { ...rules, maxDrinks: override === 0 ? Infinity : override };
}

export function partying(G: MagalufG): string[] {
  return G.activeSeatIDs.filter((id) => G.players[id]?.status === 'partying');
}

/**
 * Everyone whose weekend is not over yet.
 *
 * Wider than `partying`: a seat in a cell or on the sofa is out of the venue
 * but still in the running, and still has nights left to play. Only the dead
 * are gone for good. This is the field a card reaches when it is settling
 * something about the *match* rather than about the room.
 */
export function alive(G: MagalufG): string[] {
  return G.activeSeatIDs.filter((id) => G.players[id]?.status !== 'dead');
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
  return alive(G);
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

/**
 * Seats ranked by a public number, highest first; ties broken by seat order.
 *
 * `seats` narrows the field — a card that only reaches the people still in the
 * venue ranks `partying(G)` rather than the whole table. The seat-order
 * tiebreak is for display only: a caller that pays out reads the top *value*
 * and awards everyone holding it, so nobody wins for sitting in a low chair.
 */
export function rankSeats(
  G: MagalufG,
  value: (player: MagalufPlayer) => number,
  seats: readonly string[] = G.activeSeatIDs,
): { seatID: string; value: number }[] {
  return seats
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

export function buildDeck<T extends string>(
  counts: Partial<Record<T, number>>,
): CardInstance<T>[] {
  const out: CardInstance<T>[] = [];
  for (const id of Object.keys(counts) as T[]) {
    // Each copy is a different printed card: same title and effect, its own
    // picture and its own line underneath. See `CardInstance`.
    for (let i = 0; i < (counts[id] ?? 0); i++) out.push({ id, variant: i });
  }
  return out;
}

/**
 * The empty-deck rule, shared by both decks: shuffle the discard and carry on.
 *
 * Up to six players this never fired — every phase deck is larger than the
 * maximum possible draws at six seats, which is what the old comment here
 * claimed and what the AC21 test proved. Raising `maxPlayers` to 10 makes it a
 * real part of the game rather than a deadlock guard: the Tardeo deals 34
 * alcohol cards against a table that can drink 40 before closing time, so a
 * ten-seat venue runs the deck out and goes round again.
 *
 * It is logged for that reason. At a physical table somebody visibly sweeps the
 * discards up, and a phase where the same Pecera comes round twice should not
 * look like the app repeating itself.
 *
 * Returns null only if there is nothing anywhere — every card is in play, which
 * no deck in this game is small enough to allow.
 */
function refill<T>(
  G: MagalufG,
  deck: T[],
  discard: T[],
  rng: Rng,
  logKey: 'reshuffledAlcohol' | 'reshuffledEvent',
): { deck: T[]; discard: T[] } | null {
  if (deck.length > 0) return { deck, discard };
  if (discard.length === 0) return null;
  log(G, logKey, { n: discard.length });
  return { deck: rng.shuffle(discard), discard: [] };
}

export function drawAlcohol(G: MagalufG, rng: Rng): AlcoholInstance | null {
  const refilled = refill(G, G.alcoholDeck, G.alcoholDiscard, rng, 'reshuffledAlcohol');
  if (!refilled) return null;
  G.alcoholDeck = refilled.deck;
  G.alcoholDiscard = refilled.discard;

  const drawn = G.alcoholDeck.pop()!;
  G.alcoholDiscard.push(drawn);
  return drawn;
}

/** The numbers behind a drawn card. Separate lookup, so the deck stays data. */
export function alcoholCard(drawn: AlcoholInstance): AlcoholCard {
  return ALCOHOL[drawn.id]!;
}

export function drawEvent(G: MagalufG, rng: Rng): EventInstance | null {
  const refilled = refill(G, G.eventDeck, G.eventDiscard, rng, 'reshuffledEvent');
  if (!refilled) return null;
  G.eventDeck = refilled.deck;
  G.eventDiscard = refilled.discard;

  const drawn = G.eventDeck.pop()!;
  G.eventDiscard.push(drawn);
  return drawn;
}

// ---------------------------------------------------------------------------
// Player primitives
// ---------------------------------------------------------------------------

export function gainVP(player: MagalufPlayer, amount: number): void {
  player.roundVP += amount;
}

/**
 * VP straight into the bank: no limit check, no day multiplier.
 *
 * The balcony's leyenda bonus has always worked this way. The catch-up cards
 * need it for a harder reason — `resolveNight` zeroes an arrested player's
 * round pool, so anything handed to a seat in a cell through `gainVP` is
 * destroyed at midnight without ever being scored. A card meant to reach the
 * player having the worst weekend has to reach them where they actually are.
 *
 * Unmultiplied is the honest reading, not a nerf: the multiplier is the rate
 * at which the round pool converts to bank, so N banked directly is N final
 * points on any day of the weekend.
 */
export function bankVP(player: MagalufPlayer, amount: number): void {
  player.bankedVP += amount;
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

/**
 * How many contraband items a player is holding, duplicates counted
 * separately. `items` is a plain list with no hand limit anywhere in the game,
 * so two Porros really are two Porros — and since the Cacheo taxes per item,
 * the difference is six points.
 */
export function countContraband(player: MagalufPlayer): number {
  return player.items.filter((id) => CONTRABAND.includes(id)).length;
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
 *
 * Returns what was actually applied, which is not what is printed on the card:
 * a Farlopa halves the intoxication and an armed Pastis doubles the points.
 */
export function consumeAlcohol(
  G: MagalufG,
  seatID: string,
  drawn: AlcoholInstance,
  options: { halveIntox?: boolean } = {},
): { intox: number; vp: number } {
  const card = alcoholCard(drawn);
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

  log(G, 'drank', { actor: seatID, descriptionKey: `magaluf.alcohol.${card.id}.title`, intox, vp }, 'play');
  return { intox, vp };
}

/**
 * A drink the card poured, applied AND put face-up next to the card.
 *
 * The pair every "and then everybody drinks" event needs: without the second
 * half a Ronda moved three players' numbers with nothing on the table to
 * explain it, and the only record was three lines in the chat feed that the
 * drawer had already scrolled past.
 *
 * Not used for the drawer's own chosen drink — `takeDrink` puts that one in
 * `lastDraw.alcohol`, and it is face-up before the event is even turned over.
 */
export function pourDrink(
  G: MagalufG,
  seatID: string,
  drawn: AlcoholInstance,
  options: { halveIntox?: boolean } = {},
): void {
  const applied = consumeAlcohol(G, seatID, drawn, options);
  // Guarded because an event can only ever pour on top of a draw that is
  // already on the table; if there is none there is nothing to attach to.
  if (!G.lastDraw) return;
  G.lastDraw = {
    ...G.lastDraw,
    pours: [...G.lastDraw.pours, { seatID, alcohol: drawn, ...applied }],
  };
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
