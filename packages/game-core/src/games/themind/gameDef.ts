import type { Ctx, Game } from 'boardgame.io';
import type { GameLogEntry, GameoverResult } from '../../types.js';
import { ActivePlayers, INVALID_MOVE } from '../../vendor.js';
import {
  beginRoundConfirm,
  confirmRoundReadyMove,
  forceAdvanceRoundMove,
  isRoundConfirmComplete,
  type RoundConfirmG,
} from '../../roundConfirm.js';

export interface TheMindShurikenVote {
  proposerID: string;
  /** One entry per active seat -- true once that seat has voted yes. */
  votes: Record<string, boolean>;
}

export interface TheMindG extends RoundConfirmG {
  /**
   * Every seat actually claimed by a real user at match-start time, fixed
   * for the whole match -- same pattern and same reason as Love Letter's
   * field of the same name: the platform always creates a match with
   * gameModule.maxPlayers (4) engine seats regardless of how many are
   * actually claimed, so every level/lives/stars number (which depends on
   * the REAL player count) and every hand-emptiness/mistake check must key
   * off this list, never off ctx.numPlayers or Object.keys(G.hands).
   */
  activeSeatIDs: string[];
  /** Fixed at setup from activeSeatIDs.length (12/10/8). */
  totalLevels: number;
  /** Current level, 1-indexed. */
  level: number;
  lives: number;
  stars: number;
  /** Per-player secret -- conformance suite secretKey. Sorted ascending. */
  hands: Record<string, number[]>;
  /** Public. This level's shared pile, in the order played. */
  playedCards: number[];
  /**
   * Public, per owning seat. Cards revealed by a misplay this level --
   * attributed to whichever seat was holding each card, not just pooled
   * anonymously, since knowing WHOSE card was revealed (not just its value)
   * is exactly the information the rulebook's own worked example conveys
   * ("Tim places his 26 aside, Linus does the same with his 30").
   */
  setAsideCards: Record<string, number[]>;
  /**
   * Public, per owning seat. Cards revealed by a resolved shuriken this
   * level -- attributed the same way as setAsideCards. This is the whole
   * point of the shuriken: it exists to let the team learn each other's
   * current lowest card, not merely to thin hands anonymously.
   */
  starDiscards: Record<string, number[]>;
  /** Public. Null when no shuriken proposal is pending. */
  shurikenVote: TheMindShurikenVote | null;
  log: GameLogEntry[];
  /** Set once the match is actually over; read by the top-level endIf. */
  matchResult: 'won' | 'lost' | null;
}

export interface TheMindView extends Omit<TheMindG, 'hands'> {
  /** Only the viewer's own hand (or none, for a spectator) -- see playerView. */
  hands: Record<string, number[]>;
  /** Every active seat's hand SIZE -- public, unlike the hand contents themselves. */
  handCounts: Record<string, number>;
}

export interface TheMindSetupData {
  /** Seats actually claimed when the match was started -- see TheMindG.activeSeatIDs. */
  claimedSeatIDs?: string[];
  /** The host's own seat, if any -- see RoundConfirmG.hostPlayerID. */
  hostPlayerID?: string | null;
}

interface LevelConfig {
  levels: number;
  startingLives: number;
  startingStars: number;
}

/** From the rulebook's "Preparing the game" table. */
const LEVEL_CONFIG: Record<number, LevelConfig> = {
  2: { levels: 12, startingLives: 2, startingStars: 1 },
  3: { levels: 10, startingLives: 3, startingStars: 1 },
  4: { levels: 8, startingLives: 4, startingStars: 1 },
};

/** Rewards trigger only on these levels; see plan.md for the icon-derived alternation. */
const LEVEL_REWARDS: Record<number, 'life' | 'star'> = {
  2: 'star',
  3: 'life',
  5: 'star',
  6: 'life',
  8: 'star',
  9: 'life',
};

/** Physical component counts -- a reward that would exceed these is simply not granted. */
const MAX_LIVES = 5;
const MAX_STARS = 3;

type ShuffleFn = { Shuffle<T>(deck: T[]): T[] };

function seatIDs(ctx: Ctx): string[] {
  return Array.from({ length: ctx.numPlayers }, (_, i) => String(i));
}

function buildDeck(): number[] {
  return Array.from({ length: 100 }, (_, i) => i + 1);
}

function validateTheMindSetupData(
  setupData: TheMindSetupData | undefined,
  numPlayers: number,
): string | undefined {
  // The real seat count once claimedSeatIDs is known -- numPlayers alone is
  // the platform's fixed engine seat count (gameModule.maxPlayers), not how
  // many people are actually playing (see TheMindG.activeSeatIDs).
  const effectiveCount = setupData?.claimedSeatIDs?.length ?? numPlayers;
  if (!LEVEL_CONFIG[effectiveCount]) {
    return `themind-v1: supports 2-4 players, got ${effectiveCount}`;
  }
  return undefined;
}

function buildInitialG(activeSeatIDs: string[], ctx: Ctx, hostPlayerID: string | null): TheMindG {
  const seats = seatIDs(ctx);
  const config = LEVEL_CONFIG[activeSeatIDs.length]!;
  return {
    activeSeatIDs,
    roundConfirm: null,
    hostPlayerID,
    totalLevels: config.levels,
    level: 1,
    lives: config.startingLives,
    stars: config.startingStars,
    hands: Object.fromEntries(seats.map((id) => [id, []])),
    playedCards: [],
    setAsideCards: Object.fromEntries(seats.map((id) => [id, []])),
    starDiscards: Object.fromEntries(seats.map((id) => [id, []])),
    shurikenVote: null,
    log: [],
    matchResult: null,
  };
}

/**
 * Shuffles a fresh 1-100 deck and deals G.level cards to every active seat,
 * resetting this level's public zones -- shared between setup (level 1) and
 * every subsequent level transition (see checkLevelComplete). Phantom
 * (unclaimed) seats are dealt nothing, same convention as Love Letter's
 * dealNewRound.
 */
function dealLevel(G: TheMindG, ctx: Ctx, random: ShuffleFn): void {
  const seats = seatIDs(ctx);
  const deck = random.Shuffle(buildDeck());
  const hands: Record<string, number[]> = {};
  for (const id of seats) {
    if (!G.activeSeatIDs.includes(id)) {
      hands[id] = [];
      continue;
    }
    const hand: number[] = [];
    for (let i = 0; i < G.level; i++) hand.push(deck.pop()!);
    hand.sort((a, b) => a - b);
    hands[id] = hand;
  }
  G.hands = hands;
  G.playedCards = [];
  G.setAsideCards = Object.fromEntries(seats.map((id) => [id, []]));
  G.starDiscards = Object.fromEntries(seats.map((id) => [id, []]));
  G.shurikenVote = null;
}

function grantLevelReward(G: TheMindG): void {
  const reward = LEVEL_REWARDS[G.level];
  if (reward === 'life' && G.lives < MAX_LIVES) {
    G.lives += 1;
    G.log.push({ key: 'theMind.log.rewardLife', params: { level: G.level } });
  } else if (reward === 'star' && G.stars < MAX_STARS) {
    G.stars += 1;
    G.log.push({ key: 'theMind.log.rewardStar', params: { level: G.level } });
  }
}

/**
 * Called after any hand-emptying event (a normal play or a resolved
 * shuriken -- see spec.md AC5) -- advances to the next level or ends the
 * match in a win. A no-op if the match already ended (e.g. the same play
 * that emptied every hand also happened to be the one that lost the last
 * life -- loseLife runs first in playCard, so matchResult is already
 * 'lost' by the time this would otherwise declare a 'won').
 */
function checkLevelComplete(G: TheMindG, ctx: Ctx, random: ShuffleFn): void {
  if (G.matchResult) return;
  const allEmpty = G.activeSeatIDs.every((id) => G.hands[id]!.length === 0);
  if (!allEmpty) return;
  G.log.push({ key: 'theMind.log.levelComplete', params: { level: G.level } });
  grantLevelReward(G);
  if (G.level >= G.totalLevels) {
    G.matchResult = 'won';
    G.log.push({ key: 'theMind.log.matchWon' });
    return;
  }
  // Dealing is deferred until every active seat confirms (or the host
  // force-advances) -- see confirmRoundReady/forceAdvanceRound below,
  // which call dealLevel themselves once the wait resolves. Unlike Love
  // Letter, there's no phase machinery here to lean on (The Mind has none
  // at all -- flat ActivePlayers.ALL for the whole match), so the wait is
  // just a G-level flag every move already checks.
  G.level += 1;
  beginRoundConfirm(G, G.activeSeatIDs);
}

function loseLife(G: TheMindG): void {
  G.lives -= 1;
  if (G.lives <= 0) {
    G.matchResult = 'lost';
    G.log.push({ key: 'theMind.log.matchLost' });
  }
}

/**
 * Always plays the acting player's own lowest held card -- the rulebook
 * itself requires this ("each player must always play the lowest card they
 * are holding"), so there is no card-choice parameter; a player either has
 * a lowest card to play or doesn't (INVALID_MOVE).
 *
 * client: false -- every mistake check reads every OTHER active seat's
 * hidden hand, which a client's optimistic dry-run would run against its
 * own already-playerView-filtered copy of G and throw on (same reasoning
 * as Love Letter's playCard -- see its own gameDef.ts comment).
 */
function playCard({
  G,
  ctx,
  playerID,
  random,
}: {
  G: TheMindG;
  ctx: Ctx;
  playerID: string;
  random: ShuffleFn;
}): typeof INVALID_MOVE | void {
  if (G.matchResult) return INVALID_MOVE;
  // A pending shuriken proposal freezes normal play until it resolves or is
  // cancelled -- an engine-level simplification (not stated by the physical
  // rulebook, whose vote happens via a real-time hand-raise) that avoids a
  // play racing a vote's resolution against stale hand state.
  if (G.shurikenVote) return INVALID_MOVE;
  const hand = G.hands[playerID];
  if (!hand || hand.length === 0) return INVALID_MOVE;

  const card = hand.shift()!;
  G.playedCards.push(card);
  G.log.push({ key: 'theMind.log.cardPlayed', params: { actor: playerID, card } });

  const revealedBySeat: Record<string, number[]> = {};
  for (const seat of G.activeSeatIDs) {
    if (seat === playerID) continue;
    const seatHand = G.hands[seat]!;
    for (let i = seatHand.length - 1; i >= 0; i--) {
      if (seatHand[i]! < card) {
        (revealedBySeat[seat] ??= []).push(seatHand[i]!);
        seatHand.splice(i, 1);
      }
    }
  }
  const mistakeCount = Object.values(revealedBySeat).reduce((sum, cards) => sum + cards.length, 0);
  if (mistakeCount > 0) {
    // One life lost per erroneous play, regardless of how many lower cards
    // were revealed across however many seats (spec.md AC4).
    loseLife(G);
    for (const [seat, cards] of Object.entries(revealedBySeat)) {
      cards.sort((a, b) => a - b);
      G.setAsideCards[seat]!.push(...cards);
    }
    G.log.push({ key: 'theMind.log.mistake', params: { actor: playerID, card } });
  }

  if (!G.matchResult) checkLevelComplete(G, ctx, random);
}

function proposeShuriken({
  G,
  playerID,
}: {
  G: TheMindG;
  playerID: string;
}): typeof INVALID_MOVE | void {
  if (G.matchResult) return INVALID_MOVE;
  // No point proposing a shuriken for a level that's already over and
  // waiting to be confirmed -- every hand is empty, there's nothing left
  // to reveal.
  if (G.roundConfirm) return INVALID_MOVE;
  if (G.stars <= 0) return INVALID_MOVE;
  if (G.shurikenVote) return INVALID_MOVE;
  if (!G.activeSeatIDs.includes(playerID)) return INVALID_MOVE;
  // Proposing implicitly counts as that seat's own "yes" vote.
  G.shurikenVote = {
    proposerID: playerID,
    votes: Object.fromEntries(G.activeSeatIDs.map((id) => [id, id === playerID])),
  };
  G.log.push({ key: 'theMind.log.shurikenProposed', params: { actor: playerID } });
}

function cancelShurikenVote({
  G,
  playerID,
}: {
  G: TheMindG;
  playerID: string;
}): typeof INVALID_MOVE | void {
  if (!G.shurikenVote || G.shurikenVote.proposerID !== playerID) return INVALID_MOVE;
  G.shurikenVote = null;
  G.log.push({ key: 'theMind.log.shurikenCancelled', params: { actor: playerID } });
}

/**
 * client: false -- see playCard's own note; a resolved "yes" reads/mutates
 * every active seat's hidden hand.
 */
function voteShuriken(
  {
    G,
    ctx,
    playerID,
    random,
  }: { G: TheMindG; ctx: Ctx; playerID: string; random: ShuffleFn },
  agree: boolean,
): typeof INVALID_MOVE | void {
  if (!G.shurikenVote) return INVALID_MOVE;
  if (!G.activeSeatIDs.includes(playerID)) return INVALID_MOVE;

  if (!agree) {
    // Any single "no" cancels the whole proposal (rulebook: "If ALL the
    // players agree...").
    G.shurikenVote = null;
    G.log.push({ key: 'theMind.log.shurikenCancelled', params: { actor: playerID } });
    return;
  }

  G.shurikenVote.votes[playerID] = true;
  const allAgree = G.activeSeatIDs.every((id) => G.shurikenVote!.votes[id]);
  if (!allAgree) return;

  G.stars -= 1;
  for (const seat of G.activeSeatIDs) {
    const hand = G.hands[seat]!;
    if (hand.length === 0) continue;
    G.starDiscards[seat]!.push(hand.shift()!);
  }
  G.shurikenVote = null;
  G.log.push({ key: 'theMind.log.shurikenUsed' });

  // A shuriken can empty every hand just as a normal play can (spec.md AC5).
  checkLevelComplete(G, ctx, random);
}

/**
 * client: false -- unlike the confirm/force-advance moves themselves
 * (which only touch G.roundConfirm/G.hostPlayerID, neither redacted by
 * playerView), dealLevel below writes a freshly dealt hand for every
 * active seat, not just the caller's own. boardgame.io's optimistic
 * client-side dry-run would otherwise run this against the caller's
 * already-playerView-filtered G and briefly render OTHER seats' hands
 * with locally-predicted (not the server's real) card values -- the same
 * category of leak client:false exists to prevent elsewhere in this file.
 * The Mind has no phase machinery to defer dealing into an onEnd hook the
 * way Love Letter's roundConfirm phase does (see its own gameDef.ts), so
 * dealLevel is called inline here once the wait resolves.
 */
function confirmRoundReady(
  context: { G: TheMindG; ctx: Ctx; playerID: string; random: ShuffleFn },
): typeof INVALID_MOVE | void {
  const result = confirmRoundReadyMove(context);
  if (result === INVALID_MOVE) return INVALID_MOVE;
  if (isRoundConfirmComplete(context.G.roundConfirm)) {
    context.G.roundConfirm = null;
    dealLevel(context.G, context.ctx, context.random);
  }
}

/** client: false -- see confirmRoundReady's own note just above. */
function forceAdvanceRound(
  context: { G: TheMindG; ctx: Ctx; playerID: string; random: ShuffleFn },
): typeof INVALID_MOVE | void {
  const result = forceAdvanceRoundMove(context);
  if (result === INVALID_MOVE) return INVALID_MOVE;
  context.G.roundConfirm = null;
  dealLevel(context.G, context.ctx, context.random);
}

function matchGameoverResult(G: TheMindG): GameoverResult | undefined {
  if (G.matchResult === 'won') return { winner: G.activeSeatIDs };
  // {} (no winner, not a draw) is a fully conforming GameoverResult -- see
  // plan.md's "GameoverResult encoding for a cooperative loss".
  if (G.matchResult === 'lost') return {};
  return undefined;
}

export const themindGameDef: Game<TheMindG, Record<string, unknown>, TheMindSetupData> = {
  setup: ({ ctx, random }, setupData) => {
    const error = validateTheMindSetupData(setupData, ctx.numPlayers);
    if (error) throw new Error(error);
    // Falls back to every engine seat when the caller doesn't supply
    // claimedSeatIDs (e.g. a headless test Client() with no room/seat
    // service in front of it) -- same convention as Love Letter's setup.
    const activeSeatIDs = setupData?.claimedSeatIDs ?? seatIDs(ctx);
    const G = buildInitialG(activeSeatIDs, ctx, setupData?.hostPlayerID ?? null);
    dealLevel(G, ctx, random);
    return G;
  },

  validateSetupData: (setupData, numPlayers) => validateTheMindSetupData(setupData, numPlayers),

  moves: {
    playCard: { move: playCard, client: false },
    proposeShuriken: { move: proposeShuriken, client: false },
    voteShuriken: { move: voteShuriken, client: false },
    cancelShurikenVote: { move: cancelShurikenVote, client: false },
    confirmRoundReady: { move: confirmRoundReady, client: false },
    forceAdvanceRound: { move: forceAdvanceRound, client: false },
  },

  // Every seat stays permanently active with nothing to yield -- the
  // simultaneous-action/turn-less pattern tech-stack.md names for The Mind
  // specifically. ctx.currentPlayer still exists (boardgame.io always
  // assigns one) but no move or the board ever reads it.
  turn: {
    activePlayers: ActivePlayers.ALL,
  },

  endIf: ({ G }) => matchGameoverResult(G),

  playerView: ({ G, playerID }) => {
    const { hands, ...publicG } = G;
    const handCounts = Object.fromEntries(
      Object.entries(hands).map(([id, hand]) => [id, hand.length]),
    );
    const view: TheMindView = {
      ...publicG,
      handCounts,
      hands: playerID != null ? { [playerID]: hands[playerID] ?? [] } : {},
    };
    return view;
  },
};
