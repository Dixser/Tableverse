import type { Ctx, Game, TurnOrderConfig } from 'boardgame.io';
import type { GameLogEntry, GameoverResult } from '../../types.js';
import { INVALID_MOVE } from '../../vendor.js';
import { buildDeck, isLegalPlacement, type Card } from './deck.js';
import {
  buildGoalCatalog,
  goalDescriptionParams,
  resolveGoals as resolveGoalsState,
  type GoalDefinition,
} from './goals.js';
import { DIFFICULTIES, targetGoalCount, type Difficulty } from './difficulty.js';

export type { Card, Color } from './deck.js';
export type { GoalDefinition, GoalKind } from './goals.js';
export type { Difficulty } from './difficulty.js';

export interface CahootsG {
  /**
   * Every seat actually claimed by a real user at match-start time -- same
   * pattern as Regicide/Love Letter/Crew: the platform always creates
   * gameModule.maxPlayers (4) engine seats regardless of how many are
   * actually claimed.
   */
  activeSeatIDs: string[];
  difficulty: Difficulty;
  /** completedGoals.length reaching this value wins the match -- fixed at setup from the difficulty x active-seat-count table. */
  targetGoalCount: number;
  /** The randomly-chosen seat that goes first -- input to the custom turn order's `first`. */
  firstSeatID: string;
  /** Per-player secret -- conformance suite secretKey. */
  hands: Record<string, Card[]>;
  /** 4 piles, left to right. Each pile is its FULL stack (bottom to top), not just the top card -- the rulebook allows looking through a pile at any time. */
  piles: Card[][];
  drawPile: Card[];
  /** Face-down goal cards not yet revealed, for this match's sliced pool only (not the whole 54-entry catalog). */
  goalDeck: GoalDefinition[];
  /** Up to 4 currently showing; fewer once goalDeck runs dry. */
  activeGoals: GoalDefinition[];
  /** The rulebook's "wins pile". */
  completedGoals: GoalDefinition[];
  log: GameLogEntry[];
}

export interface CahootsView extends Omit<CahootsG, 'hands'> {
  /** Every active seat's hand SIZE -- public, unlike the hand contents themselves. */
  handCounts: Record<string, number>;
  hands: Record<string, Card[]>;
}

export interface CahootsSetupData {
  /** Seats actually claimed when the match was started -- see CahootsG.activeSeatIDs. */
  claimedSeatIDs?: string[];
  /** From room.gameSettings (the settingsSchema's `difficulty` field). */
  difficulty?: Difficulty;
}

function seatIDs(ctx: Ctx): string[] {
  return Array.from({ length: ctx.numPlayers }, (_, i) => String(i));
}

function validateCahootsSetupData(setupData: CahootsSetupData | undefined, numPlayers: number): string | undefined {
  const effectiveCount = setupData?.claimedSeatIDs?.length ?? numPlayers;
  if (effectiveCount < 2 || effectiveCount > 4) {
    return `cahoots-v1: supports 2-4 players, got ${effectiveCount}`;
  }
  const difficulty = setupData?.difficulty ?? 'beginner';
  if (!DIFFICULTIES.includes(difficulty)) {
    return `cahoots-v1: difficulty must be one of ${DIFFICULTIES.join(', ')}, got ${difficulty}`;
  }
  return undefined;
}

function removeFromHand(hand: Card[], cardID: string): Card | undefined {
  const index = hand.findIndex((c) => c.id === cardID);
  if (index === -1) return undefined;
  return hand.splice(index, 1)[0];
}

/** Plain clockwise among active seats, looping past any inactive phantom seat -- same pattern as Crew/Regicide's own turn order. */
function nextActiveSeatIndex({ G, ctx }: { G: CahootsG; ctx: Ctx }): number | undefined {
  const order = ctx.playOrder;
  for (let step = 1; step <= order.length; step++) {
    const candidateIdx = (ctx.playOrderPos + step) % order.length;
    if (G.activeSeatIDs.includes(order[candidateIdx]!)) return candidateIdx;
  }
  return undefined;
}

const turnOrder: TurnOrderConfig<CahootsG> = {
  first: ({ G, ctx }) => ctx.playOrder.indexOf(G.firstSeatID),
  next: nextActiveSeatIndex,
};

// --- Setup -----------------------------------------------------------------

function buildInitialG(activeSeatIDs: string[], difficulty: Difficulty): CahootsG {
  return {
    activeSeatIDs,
    difficulty,
    targetGoalCount: targetGoalCount(difficulty, activeSeatIDs.length),
    firstSeatID: '',
    hands: {},
    piles: [[], [], [], []],
    drawPile: [],
    goalDeck: [],
    activeGoals: [],
    completedGoals: [],
    log: [],
  };
}

/**
 * Wraps goals.ts's resolveGoals with chat logging: one `goalCompleted` entry
 * per goal that newly lands in `completedGoals` this call, in the order
 * they completed -- including when a single play satisfies several at
 * once, each gets its own entry with its own running count. Diffing
 * `completedGoals.length` before/after is enough to find them, since
 * resolveGoalsState only ever appends to that array, never removes from it.
 */
function resolveGoals(G: CahootsG): void {
  const completedBefore = G.completedGoals.length;
  resolveGoalsState({
    piles: G.piles,
    activeGoals: G.activeGoals,
    goalDeck: G.goalDeck,
    completedGoals: G.completedGoals,
  });
  for (let completed = completedBefore + 1; completed <= G.completedGoals.length; completed++) {
    const goal = G.completedGoals[completed - 1]!;
    const { key: descriptionKey, params: descriptionParams } = goalDescriptionParams(goal);
    // `totalGoals`, not `target` -- ChatPanel's PLAYER_ID_PARAM_KEYS treats
    // any param literally named `target` as a seat id and resolves it to a
    // seat label (e.g. 15 -> "Seat 16"), which is not what this is.
    // `descriptionKey` (+ the goal's own raw params, spread in) is ChatPanel's
    // well-known convention for rendering a second, nested translation right
    // after this entry's own text -- see ChatPanel.tsx's `descriptionKey`
    // handling.
    G.log.push({
      key: 'cahoots.log.goalCompleted',
      params: { completed, totalGoals: G.targetGoalCount, descriptionKey, ...descriptionParams },
    });
  }
}

/**
 * Chat-visible announcement the instant every goal in this match's pool is
 * completed -- called right after resolveGoals(), both at setup (the
 * rulebook's own "completed by the starting cards" case) and after every
 * play. completedGoals only ever grows, so this threshold can be crossed
 * at most once per match; endIf (not this function) is what actually ends
 * the match, this only logs it for the chat feed.
 */
function logMissionCompleted(G: CahootsG): void {
  if (G.completedGoals.length >= G.targetGoalCount) {
    G.log.push({ key: 'cahoots.log.missionCompleted', params: { totalGoals: G.targetGoalCount } });
  }
}

type ShuffleFn = { Shuffle<T>(deck: T[]): T[] };

function setupGame(G: CahootsG, ctx: Ctx, random: ShuffleFn): void {
  const seats = seatIDs(ctx);
  const deck = random.Shuffle(buildDeck());

  const hands: Record<string, Card[]> = Object.fromEntries(seats.map((id) => [id, []]));
  for (const seatID of G.activeSeatIDs) {
    hands[seatID] = deck.splice(0, 4);
  }
  G.hands = hands;

  G.piles = [[deck.shift()!], [deck.shift()!], [deck.shift()!], [deck.shift()!]];
  G.drawPile = deck;

  const goalPool = random.Shuffle(buildGoalCatalog()).slice(0, G.targetGoalCount);
  G.activeGoals = goalPool.slice(0, 4);
  G.goalDeck = goalPool.slice(4);

  G.firstSeatID = random.Shuffle(G.activeSeatIDs)[0]!;

  // Rulebook's own "goals completed by the starting face-up cards" case.
  resolveGoals(G);
  logMissionCompleted(G);
}

// --- Moves -------------------------------------------------------------

function playCard(
  { G, playerID }: { G: CahootsG; playerID: string },
  pileIndex: number,
  cardID: string,
): typeof INVALID_MOVE | void {
  if (!G.activeSeatIDs.includes(playerID)) return INVALID_MOVE;
  if (!Number.isInteger(pileIndex) || pileIndex < 0 || pileIndex > 3) return INVALID_MOVE;
  const hand = G.hands[playerID];
  if (!hand) return INVALID_MOVE;
  const card = hand.find((c) => c.id === cardID);
  if (!card) return INVALID_MOVE;
  const pile = G.piles[pileIndex]!;
  const top = pile[pile.length - 1];
  if (!top || !isLegalPlacement(card, top)) return INVALID_MOVE;

  removeFromHand(hand, cardID);
  pile.push(card);
  // `color` here is never printed as a word -- ChatPanel treats it as a
  // well-known styling param (same convention as `actor`/`target` being
  // resolved to seat names) and colors the interpolated {{number}} itself.
  G.log.push({
    key: 'cahoots.log.cardPlayed',
    params: { actor: playerID, color: card.color, number: card.number, pile: pileIndex + 1 },
  });

  resolveGoals(G);
  logMissionCompleted(G);

  if (G.drawPile.length > 0) {
    hand.push(G.drawPile.shift()!);
  }
}

// --- Game definition -----------------------------------------------------

function hasLegalMove(hand: Card[], piles: Card[][]): boolean {
  return hand.some((card) =>
    piles.some((pile) => {
      const top = pile[pile.length - 1];
      return top !== undefined && isLegalPlacement(card, top);
    }),
  );
}

/**
 * Pure function of (G, ctx) -- unlike Crew/Regicide, there's no stored
 * `matchResult` flag, since Cahoots has no phase machinery whose
 * transition a mid-move mutation would need to avoid triggering.
 */
function matchGameoverResult(G: CahootsG, ctx: Ctx): GameoverResult | undefined {
  if (G.completedGoals.length >= G.targetGoalCount) {
    return { winner: G.activeSeatIDs };
  }

  const totalCardsInHands = G.activeSeatIDs.reduce((sum, id) => sum + (G.hands[id]?.length ?? 0), 0);
  if (G.drawPile.length === 0 && totalCardsInHands === 0) {
    return {};
  }

  // The seat currently up holds no card matching any pile -- also covers a
  // seat that's simply run out of cards early (hasLegalMove on an empty
  // hand is vacuously false), so this subsumes the "individual seat
  // stuck" case without a separate branch.
  //
  // `endIf` fires after every event, including the active seat's own
  // `playCard` move (before `maxMoves: 1` ends their turn) -- so without
  // the `numMoves === 0` guard this would check the mover's own
  // just-played hand and could end the match on their move even though
  // the *next* seat (whose turn hasn't started yet) still has a legal
  // play. `ctx.numMoves` resets to 0 exactly at turn start, before the
  // active seat has moved, which is the only point this check should run.
  const current = ctx.currentPlayer;
  if (
    (ctx.numMoves ?? 0) === 0 &&
    G.activeSeatIDs.includes(current) &&
    !hasLegalMove(G.hands[current] ?? [], G.piles)
  ) {
    return {};
  }

  return undefined;
}

export const cahootsGameDef: Game<CahootsG, Record<string, unknown>, CahootsSetupData> = {
  setup: ({ ctx, random }, setupData) => {
    const error = validateCahootsSetupData(setupData, ctx.numPlayers);
    if (error) throw new Error(error);
    const activeSeatIDs = setupData?.claimedSeatIDs ?? seatIDs(ctx);
    const difficulty = setupData?.difficulty ?? 'beginner';
    const G = buildInitialG(activeSeatIDs, difficulty);
    setupGame(G, ctx, random);
    return G;
  },

  validateSetupData: (setupData, numPlayers) => validateCahootsSetupData(setupData, numPlayers),

  // No `phases` block at all -- one flat turn order, one move, nothing in
  // this game needs a wait-for-everyone step (see spec.md's "Resolved
  // design decisions").
  turn: {
    order: turnOrder,
    minMoves: 1,
    maxMoves: 1,
  },

  moves: { playCard },

  endIf: ({ G, ctx }) => matchGameoverResult(G, ctx),

  playerView: ({ G, playerID }) => {
    const { hands, ...publicG } = G;
    const view: CahootsView = {
      ...publicG,
      handCounts: Object.fromEntries(Object.entries(hands).map(([id, hand]) => [id, hand.length])),
      hands: playerID != null ? { [playerID]: hands[playerID] ?? [] } : {},
    };
    return view;
  },
};
