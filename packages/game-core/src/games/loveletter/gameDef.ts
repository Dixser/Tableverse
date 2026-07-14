import type { Ctx, Game, TurnOrderConfig } from 'boardgame.io';
import type { GameLogEntry, GameoverResult } from '../../types.js';
import { INVALID_MOVE } from '../../vendor.js';
import { buildDeck, type CardRank, type LoveLetterEdition } from './deck.js';

export type { CardRank, LoveLetterEdition } from './deck.js';

export interface LoveLetterG {
  edition: LoveLetterEdition;

  /**
   * Hidden from EVERY player and spectator, always -- not a per-owner
   * secret (nobody has looked at these), so playerView strips these two
   * fields unconditionally rather than filtering them per-viewer the way
   * hands/privateReveals are (see spec.md AC9).
   */
  _deck: CardRank[];
  _setAsideFacedown: CardRank | null;

  /** Public (2-player games only) -- permanently out of the round. */
  setAsideFaceup: CardRank[];

  /** Per-player secret -- conformance suite secretKey. */
  hands: Record<string, CardRank[]>;
  /** Per-player secret -- conformance suite secretKey. Baron/Priest results. */
  privateReveals: Record<string, GameLogEntry[]>;
  /**
   * Per-player secret -- conformance suite secretKey. The Chancellor's own
   * card plus the 0-2 freshly drawn candidates, populated by playCard and
   * awaiting the player's own chancellorKeep move to resolve; empty outside
   * that window. See feature 015's plan.md/BoardComponent for why this is a
   * separate move rather than a single-call `playCard` param: the drawn
   * cards don't exist yet at the moment a client would need to choose among
   * them, so "draw" and "keep" must be two atomic moves, not one.
   */
  chancellorDraw: Record<string, CardRank[]>;

  /** All public. */
  eliminated: Record<string, boolean>;
  handmaidProtected: Record<string, boolean>;
  playedCards: Record<string, CardRank[]>;
  roundWins: Record<string, number>;
  log: GameLogEntry[];

  /** Set only between concludeRound and the next round's dealNewRound. */
  nextRoundStartPlayerID: string | null;
  /** Set once the match is actually over; read by the top-level endIf. */
  matchWinners: string[] | null;
  /** True once a turn's draw failed because the deck ran out -- ends the round. */
  deckExhausted: boolean;

  /**
   * Every seat actually claimed by a real user at match-start time, fixed
   * for the whole match. The platform always creates a match with
   * `gameModule.maxPlayers` engine seats regardless of how many users
   * actually claimed one (roomService.startMatch never shrinks
   * `numPlayers` to the real seat count -- renumbering claimed seats to a
   * contiguous range would be a much bigger platform change). Without this,
   * every seat NOT in this list is a permanent phantom that nobody can
   * ever act for: it would never get eliminated, so `isRoundOver` could
   * never trigger once real players are down to one, and turn order would
   * eventually hand a turn to a seat no client holds credentials for,
   * stalling the match outright. `buildInitialG`/`dealNewRound` instead
   * pre-eliminate every non-active seat from round 1 onward, and
   * `concludeRound`'s token threshold and the 2-player set-aside rule key
   * off this list's length, not `ctx.numPlayers`.
   */
  activeSeatIDs: string[];
}

export interface LoveLetterView extends Omit<LoveLetterG, '_deck' | '_setAsideFacedown'> {
  /** The only thing about the deck's remaining contents anyone may know. */
  deckCount: number;
}

export interface LoveLetterSetupData {
  edition?: LoveLetterEdition; // defaults to 'normal'
  /** Seats actually claimed when the match was started -- see LoveLetterG.activeSeatIDs. */
  claimedSeatIDs?: string[];
}

/** The subset of boardgame.io's EventsAPI playCard/chancellorKeep actually use. */
interface ChancellorEvents {
  endTurn(): void;
  setStage(stage: string): void;
  endStage(): void;
}

interface PlayCardParams {
  /** Guard, Priest, Baron, Prince, King. */
  target?: string;
  /** Guard only. */
  guessRank?: CardRank;
  /**
   * True to discard the card instead of playing it -- it's still
   * publicly revealed (goes to playedCards, logged) exactly like a play,
   * but its effect never resolves. Rank 9 (Princess) is the one
   * exception in name only, not behavior: discarding it still eliminates
   * the player, because the real card text ("discarded for any reason")
   * already covers this -- see the discard branch in playCard below.
   * Mutually exclusive with `target`/`guessRank`: a discard never takes
   * either, by construction (nothing to target when no effect resolves).
   */
  discard?: boolean;
}

/** Tokens needed to win the match, keyed by seated player count. */
const TOKENS_TO_WIN: Record<number, number> = { 2: 6, 3: 5, 4: 4, 5: 3, 6: 3 };

function seatIDs(ctx: Ctx): string[] {
  return Array.from({ length: ctx.numPlayers }, (_, i) => String(i));
}

function validateLoveLetterSetupData(
  setupData: LoveLetterSetupData | undefined,
  numPlayers: number,
): string | undefined {
  const edition = setupData?.edition ?? 'normal';
  // The real seat count once claimedSeatIDs is known -- numPlayers alone
  // is the platform's fixed engine seat count (gameModule.maxPlayers),
  // not how many people are actually playing (see LoveLetterG.activeSeatIDs).
  const effectiveCount = setupData?.claimedSeatIDs?.length ?? numPlayers;
  if (edition === 'classic' && effectiveCount > 4) {
    return `loveletter-v1: classic edition supports at most 4 players, got ${effectiveCount}`;
  }
  return undefined;
}

function buildInitialG(
  edition: LoveLetterEdition,
  ctx: Ctx,
  activeSeatIDs: string[],
): LoveLetterG {
  const seats = seatIDs(ctx);
  return {
    edition,
    _deck: [],
    _setAsideFacedown: null,
    setAsideFaceup: [],
    hands: Object.fromEntries(seats.map((id) => [id, []])),
    privateReveals: Object.fromEntries(seats.map((id) => [id, []])),
    chancellorDraw: Object.fromEntries(seats.map((id) => [id, []])),
    // Phantom (unclaimed) seats start -- and, per dealNewRound, always
    // stay -- eliminated, so they never count toward isRoundOver's
    // remaining-players check and turn order never hands them a turn.
    eliminated: Object.fromEntries(seats.map((id) => [id, !activeSeatIDs.includes(id)])),
    handmaidProtected: Object.fromEntries(seats.map((id) => [id, false])),
    playedCards: Object.fromEntries(seats.map((id) => [id, []])),
    roundWins: Object.fromEntries(seats.map((id) => [id, 0])),
    log: [],
    nextRoundStartPlayerID: null,
    matchWinners: null,
    deckExhausted: false,
    activeSeatIDs,
  };
}

/**
 * Shuffles a fresh deck, sets aside the facedown (and, at 2 *active*
 * players, the faceup) cards, and deals one card to every active seat --
 * shared between setup (the match's first round) and concludeRound (every
 * subsequent round), per plan.md, to avoid duplicating this logic. Phantom
 * seats (see LoveLetterG.activeSeatIDs) are skipped entirely -- no card
 * dealt, and re-pinned to eliminated on every call, since this also runs
 * at the start of round 2+, which would otherwise reset G.eliminated back
 * to all-false and revive them.
 */
function dealNewRound(
  G: LoveLetterG,
  ctx: Ctx,
  random: { Shuffle<T>(deck: T[]): T[] },
): void {
  const seats = seatIDs(ctx);
  const isActive = (id: string) => G.activeSeatIDs.includes(id);
  const deck = random.Shuffle(buildDeck(G.edition));

  G._setAsideFacedown = deck.pop() ?? null;
  G.setAsideFaceup = G.activeSeatIDs.length === 2 ? [deck.pop()!, deck.pop()!, deck.pop()!] : [];

  const hands: Record<string, CardRank[]> = {};
  for (const id of seats) hands[id] = isActive(id) ? [deck.pop()!] : [];
  G.hands = hands;
  G._deck = deck;

  G.privateReveals = Object.fromEntries(seats.map((id) => [id, []]));
  G.chancellorDraw = Object.fromEntries(seats.map((id) => [id, []]));
  G.eliminated = Object.fromEntries(seats.map((id) => [id, !isActive(id)]));
  G.handmaidProtected = Object.fromEntries(seats.map((id) => [id, false]));
  G.playedCards = Object.fromEntries(seats.map((id) => [id, []]));
  G.deckExhausted = false;
}

function isRoundOver(G: LoveLetterG): boolean {
  const remaining = Object.keys(G.eliminated).filter((id) => !G.eliminated[id]);
  return remaining.length <= 1 || G.deckExhausted;
}

function drawIntoActiveHand(G: LoveLetterG, ctx: Ctx): void {
  const activePlayer = ctx.currentPlayer;
  // Protection lasts "until the start of your next turn" -- this IS that
  // start, so it clears here regardless of whether a draw is possible.
  G.handmaidProtected[activePlayer] = false;
  G.nextRoundStartPlayerID = null;

  if (G._deck.length === 0) {
    G.deckExhausted = true;
    return;
  }
  G.hands[activePlayer]!.push(G._deck.pop()!);
}

const skipEliminatedTurnOrder: TurnOrderConfig<LoveLetterG> = {
  first: ({ G, ctx }) => {
    const startID = G.nextRoundStartPlayerID ?? ctx.playOrder[0]!;
    return ctx.playOrder.indexOf(startID);
  },
  next: ({ G, ctx }) => {
    const order = ctx.playOrder;
    for (let step = 1; step <= order.length; step++) {
      const candidateIdx = (ctx.playOrderPos + step) % order.length;
      if (!G.eliminated[order[candidateIdx]!]) return candidateIdx;
    }
    return undefined; // no eligible player -- endIf will already have ended the round by now.
  },
};

// --- Card effect resolvers --------------------------------------------

function isValidTarget(G: LoveLetterG, targetID: string): boolean {
  return !G.eliminated[targetID] && !G.handmaidProtected[targetID];
}

function anyValidTarget(G: LoveLetterG, actingPlayerID: string, ctx: Ctx): boolean {
  return seatIDs(ctx).some((id) => id !== actingPlayerID && isValidTarget(G, id));
}

function eliminate(G: LoveLetterG, playerID: string): void {
  if (G.eliminated[playerID]) return;
  G.eliminated[playerID] = true;
  const remainingCards = G.hands[playerID]!.splice(0, G.hands[playerID]!.length);
  G.playedCards[playerID]!.push(...remainingCards);
  G.log.push({ key: 'loveLetter.log.eliminated', params: { player: playerID } });
}

/** Prince's forced discard-and-redraw, shared by self- and other-targeting. */
function discardAndRedraw(G: LoveLetterG, targetID: string): void {
  const [discarded] = G.hands[targetID]!.splice(0, 1);
  if (discarded === undefined) return;
  G.playedCards[targetID]!.push(discarded);
  if (discarded === 9) {
    eliminate(G, targetID); // Princess discarded -- eliminated, no redraw.
    return;
  }
  if (G._deck.length > 0) {
    G.hands[targetID]!.push(G._deck.pop()!);
  } else if (G._setAsideFacedown !== null) {
    G.hands[targetID]!.push(G._setAsideFacedown);
    G._setAsideFacedown = null;
  }
}

function resolveGuard(
  G: LoveLetterG,
  actingID: string,
  targetID: string,
  guessRank: CardRank,
): void {
  G.log.push({
    key: 'loveLetter.log.guardGuess',
    params: { actor: actingID, target: targetID, rank: guessRank },
  });
  if (G.hands[targetID]![0] === guessRank) {
    eliminate(G, targetID);
  }
}

function resolvePriest(G: LoveLetterG, actingID: string, targetID: string): void {
  G.log.push({ key: 'loveLetter.log.priestUsed', params: { actor: actingID, target: targetID } });
  G.privateReveals[actingID]!.push({
    key: 'loveLetter.reveal.priestViewed',
    params: { opponent: targetID, opponentRank: G.hands[targetID]![0]! },
  });
}

function resolveBaron(G: LoveLetterG, actingID: string, targetID: string): void {
  const actingRank = G.hands[actingID]![0]!;
  const targetRank = G.hands[targetID]![0]!;
  G.log.push({ key: 'loveLetter.log.baronUsed', params: { actor: actingID, target: targetID } });
  if (actingRank !== targetRank) {
    eliminate(G, actingRank < targetRank ? actingID : targetID);
  }
  G.privateReveals[actingID]!.push({
    key: 'loveLetter.reveal.baronCompared',
    params: { opponent: targetID, opponentRank: targetRank, ownRank: actingRank },
  });
}

function resolveHandmaid(G: LoveLetterG, actingID: string): void {
  G.handmaidProtected[actingID] = true;
  G.log.push({ key: 'loveLetter.log.handmaidUsed', params: { actor: actingID } });
}

function resolvePrince(G: LoveLetterG, actingID: string, targetID: string): void {
  G.log.push({ key: 'loveLetter.log.princeUsed', params: { actor: actingID, target: targetID } });
  discardAndRedraw(G, targetID);
}

function resolveKing(G: LoveLetterG, actingID: string, targetID: string): void {
  G.log.push({ key: 'loveLetter.log.kingUsed', params: { actor: actingID, target: targetID } });
  const actingHand = G.hands[actingID]!;
  const targetHand = G.hands[targetID]!;
  const actingCards = actingHand.splice(0, actingHand.length);
  actingHand.push(...targetHand.splice(0, targetHand.length));
  targetHand.push(...actingCards);
}

/**
 * Draws up to 2 cards into a holding area (G.chancellorDraw) rather than
 * resolving the keep/return choice immediately -- the drawn cards don't
 * exist yet at move-call time, so the client can't supply a keep index in
 * the same call that triggers the draw (see LoveLetterG.chancellorDraw's
 * doc comment). The turn stays open, gated to the chancellorKeep move
 * only, until that follow-up move resolves it.
 */
function beginChancellorChoice(G: LoveLetterG, actingID: string): void {
  G.log.push({ key: 'loveLetter.log.chancellorUsed', params: { actor: actingID } });
  const hand = G.hands[actingID]!;
  const drawn: CardRank[] = [];
  for (let i = 0; i < 2 && G._deck.length > 0; i++) drawn.push(G._deck.pop()!);
  G.chancellorDraw[actingID] = [...hand, ...drawn];
  G.hands[actingID] = [];
}

/**
 * The chancellorChoice stage's only legal move -- resolves
 * beginChancellorChoice's draw. `returnOrder` is the player's own chosen
 * order for the non-kept candidates going to the bottom of the deck (the
 * real card's own text: "...in an order you choose"), expressed as
 * indices into `candidates` -- must be exactly a permutation of every
 * index other than `keepIndex`. `returnOrder[0]` ends up deepest in the
 * deck (index 0 of `_deck`, the very last card anyone could ever draw);
 * `returnOrder`'s last entry sits just above it.
 */
function chancellorKeep(
  { G, playerID, events }: { G: LoveLetterG; playerID: string; events: ChancellorEvents },
  keepIndex: number,
  returnOrder: number[],
): typeof INVALID_MOVE | void {
  const candidates = G.chancellorDraw[playerID]!;
  if (
    candidates.length === 0 ||
    keepIndex === undefined ||
    keepIndex < 0 ||
    keepIndex >= candidates.length
  ) {
    return INVALID_MOVE;
  }
  const expectedReturnIndices = candidates
    .map((_, i) => i)
    .filter((i) => i !== keepIndex);
  if (
    !Array.isArray(returnOrder) ||
    returnOrder.length !== expectedReturnIndices.length ||
    !expectedReturnIndices.every((i) => returnOrder.includes(i)) ||
    new Set(returnOrder).size !== returnOrder.length
  ) {
    return INVALID_MOVE;
  }
  const kept = candidates[keepIndex]!;
  const toReturn = returnOrder.map((i) => candidates[i]!);
  G.hands[playerID] = [kept];
  G._deck.unshift(...toReturn); // the rest, returned to the bottom of the deck in the chosen order.
  G.chancellorDraw[playerID] = [];
  events.endStage();
  events.endTurn();
}

// --- The playCard move -------------------------------------------------

const TARGETED_RANKS = new Set<CardRank>([1, 2, 3, 5, 7]);

function playCard(
  { G, ctx, playerID, events }: { G: LoveLetterG; ctx: Ctx; playerID: string; events: ChancellorEvents },
  cardIndex: number,
  params: PlayCardParams = {},
): typeof INVALID_MOVE | void {
  const hand = G.hands[playerID]!;
  const rank = hand[cardIndex];
  if (rank === undefined) return INVALID_MOVE;

  const otherRank = hand[cardIndex === 0 ? 1 : 0];
  if (otherRank === 8 && (rank === 5 || rank === 7)) {
    return INVALID_MOVE; // Countess forced-play rule.
  }

  const { target, discard } = params;
  if (discard) {
    // A discard never carries a target -- nothing resolves, so nothing to
    // aim it at. A client sending one anyway is a bug, not a legal choice.
    if (target !== undefined) return INVALID_MOVE;
  } else if (TARGETED_RANKS.has(rank)) {
    const princeMayTargetSelf = rank === 5;
    const hasValidTarget = anyValidTarget(G, playerID, ctx) || princeMayTargetSelf;
    if (hasValidTarget) {
      if (target === undefined) return INVALID_MOVE;
      const targetingSelf = princeMayTargetSelf && target === playerID;
      if (target === playerID && !princeMayTargetSelf) return INVALID_MOVE;
      if (!targetingSelf && !isValidTarget(G, target)) return INVALID_MOVE;
    } else if (target !== undefined) {
      return INVALID_MOVE; // no valid targets exist; none should have been supplied.
    }
  }

  hand.splice(cardIndex, 1);
  G.playedCards[playerID]!.push(rank);

  if (discard) {
    // Publicly revealed exactly like a play (already pushed to
    // playedCards above), but no card effect ever resolves -- per the
    // house rule that any card may be discarded instead of played. Rank 9
    // is the one apparent exception: the Princess's own card text ("if you
    // discard this card for any reason, you're out") already covers a
    // deliberate discard, not just a Prince-forced one, so it still
    // eliminates here -- this isn't the Princess's "effect" resolving,
    // it's the same discard-triggered rule eliminate() enforces elsewhere.
    G.log.push({ key: 'loveLetter.log.cardDiscarded', params: { actor: playerID, card: rank } });
    if (rank === 9) eliminate(G, playerID);
    events.endTurn();
    return;
  }

  // Every branch below fully resolves the turn EXCEPT Chancellor (rank 6),
  // which instead opens the chancellorChoice stage and ends the turn itself
  // only once that follow-up move resolves -- see beginChancellorChoice's
  // doc comment.
  switch (rank) {
    case 0:
      G.log.push({ key: 'loveLetter.log.spyPlayed', params: { actor: playerID } });
      break;
    case 1:
      if (target === undefined) {
        G.log.push({
          key: 'loveLetter.log.cardPlayedNoTarget',
          params: { actor: playerID, card: rank },
        });
        break;
      }
      if (params.guessRank === undefined || params.guessRank === 1) return INVALID_MOVE;
      resolveGuard(G, playerID, target, params.guessRank);
      break;
    case 2:
      if (target === undefined) {
        G.log.push({
          key: 'loveLetter.log.cardPlayedNoTarget',
          params: { actor: playerID, card: rank },
        });
        break;
      }
      resolvePriest(G, playerID, target);
      break;
    case 3:
      if (target === undefined) {
        G.log.push({
          key: 'loveLetter.log.cardPlayedNoTarget',
          params: { actor: playerID, card: rank },
        });
        break;
      }
      resolveBaron(G, playerID, target);
      break;
    case 4:
      resolveHandmaid(G, playerID);
      break;
    case 5:
      resolvePrince(G, playerID, target!);
      break;
    case 6:
      beginChancellorChoice(G, playerID);
      events.setStage('chancellorChoice');
      return;
    case 7:
      if (target === undefined) {
        G.log.push({
          key: 'loveLetter.log.cardPlayedNoTarget',
          params: { actor: playerID, card: rank },
        });
        break;
      }
      resolveKing(G, playerID, target);
      break;
    case 8:
      G.log.push({ key: 'loveLetter.log.countessPlayed', params: { actor: playerID } });
      break;
    case 9:
      G.log.push({ key: 'loveLetter.log.princessPlayed', params: { actor: playerID } });
      eliminate(G, playerID);
      break;
  }
  events.endTurn();
}

// --- Round -> match handoff ---------------------------------------------

function highestRankWinners(G: LoveLetterG, remaining: string[]): string[] {
  const maxRank = Math.max(...remaining.map((id) => G.hands[id]![0]!));
  return remaining.filter((id) => G.hands[id]![0] === maxRank);
}

function concludeRound(
  G: LoveLetterG,
  ctx: Ctx,
  random: { Shuffle<T>(deck: T[]): T[] },
): void {
  const seats = seatIDs(ctx);
  const remaining = seats.filter((id) => !G.eliminated[id]);
  const winners = remaining.length > 1 ? highestRankWinners(G, remaining) : remaining;

  for (const winnerID of winners) {
    G.roundWins[winnerID] = (G.roundWins[winnerID] ?? 0) + 1;
  }
  G.log.push({ key: 'loveLetter.log.roundWinner', params: { winners: winners.join(',') } });

  const spyPlayers = seats.filter((id) => G.playedCards[id]!.includes(0));
  if (spyPlayers.length === 1) {
    const [spyID] = spyPlayers;
    G.roundWins[spyID!] = (G.roundWins[spyID!] ?? 0) + 1;
    G.log.push({ key: 'loveLetter.log.spyBonus', params: { player: spyID! } });
  }

  const threshold = TOKENS_TO_WIN[G.activeSeatIDs.length]!;
  const matchWinners = seats.filter((id) => G.roundWins[id]! >= threshold);

  if (matchWinners.length > 0) {
    G.matchWinners = matchWinners;
    G.log.push({ key: 'loveLetter.log.matchWinner', params: { winners: matchWinners.join(',') } });
    return;
  }

  G.nextRoundStartPlayerID = winners.length === 1 ? winners[0]! : random.Shuffle(winners)[0]!;
  dealNewRound(G, ctx, random);
}

function matchGameoverResult(G: LoveLetterG): GameoverResult | undefined {
  if (!G.matchWinners || G.matchWinners.length === 0) return undefined;
  return { winner: G.matchWinners.length === 1 ? G.matchWinners[0] : G.matchWinners };
}

// --- Game definition -----------------------------------------------------

export const loveletterGameDef: Game<LoveLetterG, Record<string, unknown>, LoveLetterSetupData> = {
  setup: ({ ctx, random }, setupData) => {
    const error = validateLoveLetterSetupData(setupData, ctx.numPlayers);
    if (error) throw new Error(error);
    const edition = setupData?.edition ?? 'normal';
    // Falls back to every engine seat when the caller doesn't supply
    // claimedSeatIDs (e.g. a headless test Client() with no room/seat
    // service in front of it) -- preserves the old "every seat is real"
    // behavior for those callers instead of silently eliminating everyone.
    const activeSeatIDs = setupData?.claimedSeatIDs ?? seatIDs(ctx);
    const G = buildInitialG(edition, ctx, activeSeatIDs);
    dealNewRound(G, ctx, random);
    return G;
  },

  validateSetupData: (setupData, numPlayers) =>
    validateLoveLetterSetupData(setupData, numPlayers),

  phases: {
    round: {
      start: true,
      // Ends THIS round -- deck exhausted or one player left in the round.
      endIf: ({ G }) => isRoundOver(G),
      // Awards tokens, appends the round-winner G.log entry, decides
      // whether the match is now over.
      onEnd: ({ G, ctx, random }) => concludeRound(G, ctx, random),
      // Loop back into a fresh round unless the match is already decided --
      // otherwise a phantom round would be dealt only to be discarded the
      // instant the top-level endIf below catches G.matchWinners.
      next: ({ G }) => (G.matchWinners ? undefined : 'round'),
      turn: {
        order: skipEliminatedTurnOrder,
        onBegin: ({ G, ctx }) => drawIntoActiveHand(G, ctx),
        // No minMoves/maxMoves -- every playCard branch ends its own turn
        // explicitly via events.endTurn() (see playCard's switch), except
        // Chancellor, which instead opens this stage; a move-count-based
        // limit can't express "1 move normally, 2 for Chancellor" cleanly.
        stages: {
          chancellorChoice: {
            // client: false -- see playCard's own note just below; this
            // move reads G._deck too (via candidates already stashed by
            // beginChancellorChoice, but the bottom-of-deck return still
            // touches G._deck directly).
            moves: { chancellorKeep: { move: chancellorKeep, client: false } },
          },
        },
      },
      // client: false -- every branch of playCard reads either G._deck
      // (blanket-hidden from every viewer, always) or another player's
      // G.hands/handmaidProtected entry (narrowed to the acting viewer's
      // own entry only). boardgame.io's default optimistic client-side
      // move execution runs against exactly that filtered view, so without
      // this the local dry-run throws on the viewer's own already-redacted
      // copy before the move ever reaches the server -- discovered via
      // feature 015's manual browser verification (spec.md AC11), not
      // caught by feature 014's own (server-only, headless Client()) test
      // suite, which never exercises the multiplayer optimistic-execution
      // path at all.
      moves: { playCard: { move: playCard, client: false } },
    },
  },

  // Only true once concludeRound has set G.matchWinners.
  endIf: ({ G }) => matchGameoverResult(G),

  playerView: ({ G, playerID }) => {
    // _setAsideFacedown is destructured only to exclude it from publicG --
    // it must never reach any viewer (spec.md AC9), unlike _deck which is
    // read just below to derive the one thing about it anyone may know.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _deck, _setAsideFacedown, hands, privateReveals, chancellorDraw, ...publicG } = G;
    const view: LoveLetterView = {
      ...publicG,
      deckCount: _deck.length,
      hands: playerID != null ? { [playerID]: hands[playerID] ?? [] } : {},
      privateReveals: playerID != null ? { [playerID]: privateReveals[playerID] ?? [] } : {},
      chancellorDraw: playerID != null ? { [playerID]: chancellorDraw[playerID] ?? [] } : {},
    };
    return view;
  },
};
