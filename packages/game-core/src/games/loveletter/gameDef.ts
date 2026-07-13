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
}

export interface LoveLetterView extends Omit<LoveLetterG, '_deck' | '_setAsideFacedown'> {
  /** The only thing about the deck's remaining contents anyone may know. */
  deckCount: number;
}

export interface LoveLetterSetupData {
  edition?: LoveLetterEdition; // defaults to 'normal'
}

interface PlayCardParams {
  /** Guard, Priest, Baron, Prince, King. */
  target?: string;
  /** Guard only. */
  guessRank?: CardRank;
  /** Chancellor only -- index into [originalCard, ...drawnCards]. */
  chancellorKeep?: number;
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
  if (edition === 'classic' && numPlayers > 4) {
    return `loveletter-v1: classic edition supports at most 4 players, got ${numPlayers}`;
  }
  return undefined;
}

function buildInitialG(edition: LoveLetterEdition, ctx: Ctx): LoveLetterG {
  const seats = seatIDs(ctx);
  return {
    edition,
    _deck: [],
    _setAsideFacedown: null,
    setAsideFaceup: [],
    hands: Object.fromEntries(seats.map((id) => [id, []])),
    privateReveals: Object.fromEntries(seats.map((id) => [id, []])),
    eliminated: Object.fromEntries(seats.map((id) => [id, false])),
    handmaidProtected: Object.fromEntries(seats.map((id) => [id, false])),
    playedCards: Object.fromEntries(seats.map((id) => [id, []])),
    roundWins: Object.fromEntries(seats.map((id) => [id, 0])),
    log: [],
    nextRoundStartPlayerID: null,
    matchWinners: null,
    deckExhausted: false,
  };
}

/**
 * Shuffles a fresh deck, sets aside the facedown (and, at 2 players, the
 * faceup) cards, and deals one card to every seat -- shared between setup
 * (the match's first round) and concludeRound (every subsequent round), per
 * plan.md, to avoid duplicating this logic.
 */
function dealNewRound(
  G: LoveLetterG,
  ctx: Ctx,
  random: { Shuffle<T>(deck: T[]): T[] },
): void {
  const seats = seatIDs(ctx);
  const deck = random.Shuffle(buildDeck(G.edition));

  G._setAsideFacedown = deck.pop() ?? null;
  G.setAsideFaceup = ctx.numPlayers === 2 ? [deck.pop()!, deck.pop()!, deck.pop()!] : [];

  const hands: Record<string, CardRank[]> = {};
  for (const id of seats) hands[id] = [deck.pop()!];
  G.hands = hands;
  G._deck = deck;

  G.privateReveals = Object.fromEntries(seats.map((id) => [id, []]));
  G.eliminated = Object.fromEntries(seats.map((id) => [id, false]));
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

function resolveChancellor(
  G: LoveLetterG,
  actingID: string,
  chancellorKeep: number | undefined,
): typeof INVALID_MOVE | void {
  G.log.push({ key: 'loveLetter.log.chancellorUsed', params: { actor: actingID } });
  const hand = G.hands[actingID]!;
  const drawn: CardRank[] = [];
  for (let i = 0; i < 2 && G._deck.length > 0; i++) drawn.push(G._deck.pop()!);
  const combined = [...hand, ...drawn];
  if (
    chancellorKeep === undefined ||
    chancellorKeep < 0 ||
    chancellorKeep >= combined.length
  ) {
    return INVALID_MOVE;
  }
  const [kept] = combined.splice(chancellorKeep, 1);
  G.hands[actingID] = [kept!];
  G._deck.unshift(...combined); // returned to the bottom of the deck.
}

// --- The playCard move -------------------------------------------------

const TARGETED_RANKS = new Set<CardRank>([1, 2, 3, 5, 7]);

function playCard(
  { G, ctx, playerID }: { G: LoveLetterG; ctx: Ctx; playerID: string },
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

  const { target } = params;
  if (TARGETED_RANKS.has(rank)) {
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

  switch (rank) {
    case 0:
      G.log.push({ key: 'loveLetter.log.spyPlayed', params: { actor: playerID } });
      return;
    case 1:
      if (target === undefined) {
        G.log.push({
          key: 'loveLetter.log.cardPlayedNoTarget',
          params: { actor: playerID, card: rank },
        });
        return;
      }
      if (params.guessRank === undefined || params.guessRank === 1) return INVALID_MOVE;
      resolveGuard(G, playerID, target, params.guessRank);
      return;
    case 2:
      if (target === undefined) {
        G.log.push({
          key: 'loveLetter.log.cardPlayedNoTarget',
          params: { actor: playerID, card: rank },
        });
        return;
      }
      resolvePriest(G, playerID, target);
      return;
    case 3:
      if (target === undefined) {
        G.log.push({
          key: 'loveLetter.log.cardPlayedNoTarget',
          params: { actor: playerID, card: rank },
        });
        return;
      }
      resolveBaron(G, playerID, target);
      return;
    case 4:
      resolveHandmaid(G, playerID);
      return;
    case 5:
      resolvePrince(G, playerID, target!);
      return;
    case 6:
      return resolveChancellor(G, playerID, params.chancellorKeep);
    case 7:
      if (target === undefined) {
        G.log.push({
          key: 'loveLetter.log.cardPlayedNoTarget',
          params: { actor: playerID, card: rank },
        });
        return;
      }
      resolveKing(G, playerID, target);
      return;
    case 8:
      G.log.push({ key: 'loveLetter.log.countessPlayed', params: { actor: playerID } });
      return;
    case 9:
      G.log.push({ key: 'loveLetter.log.princessPlayed', params: { actor: playerID } });
      eliminate(G, playerID);
      return;
  }
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

  const threshold = TOKENS_TO_WIN[ctx.numPlayers]!;
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
    const G = buildInitialG(edition, ctx);
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
        minMoves: 1,
        maxMoves: 1,
      },
      moves: { playCard },
    },
  },

  // Only true once concludeRound has set G.matchWinners.
  endIf: ({ G }) => matchGameoverResult(G),

  playerView: ({ G, playerID }) => {
    // _setAsideFacedown is destructured only to exclude it from publicG --
    // it must never reach any viewer (spec.md AC9), unlike _deck which is
    // read just below to derive the one thing about it anyone may know.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _deck, _setAsideFacedown, hands, privateReveals, ...publicG } = G;
    const view: LoveLetterView = {
      ...publicG,
      deckCount: _deck.length,
      hands: playerID != null ? { [playerID]: hands[playerID] ?? [] } : {},
      privateReveals: playerID != null ? { [playerID]: privateReveals[playerID] ?? [] } : {},
    };
    return view;
  },
};
