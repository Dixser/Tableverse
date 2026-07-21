import type { Ctx, Game, TurnOrderConfig } from 'boardgame.io';
import type { GameLogEntry, GameoverResult } from '../../types.js';
import { ActivePlayers, INVALID_MOVE } from '../../vendor.js';
import {
  beginRoundConfirm,
  confirmRoundReadyMove,
  forceAdvanceRoundMove,
  isRoundConfirmComplete,
  type RoundConfirmG,
} from '../../roundConfirm.js';
import {
  buildPlayingDeck,
  buildTaskDeck,
  dealHands,
  taskTargetCardId,
  COMMANDER_CARD_ID,
  type Card,
  type TaskCard,
} from './deck.js';
import { isLegalTrickPlay, resolveTrick, type TrickPlay } from './trickResolution.js';
import {
  applyTaskFulfillment,
  checkAchievementSatisfied,
  checkLastOrderViolations,
  checkSickSeatViolation,
  checkTaskOrderViolations,
  checkTrickOutcomeViolations,
  hasAchievementConstraint,
  isEvenTaskDistribution,
  isSeatMuted,
  type Task,
} from './constraints.js';
import { isHighestOfSuit, isLowestOfSuit, isOnlyOfSuit } from './communication.js';
import { getLevel } from './levels.js';

export type { Card, Suit, ColorSuit, TaskCard } from './deck.js';
export type { Task } from './constraints.js';
export type { TrickPlay } from './trickResolution.js';

export type CommunicationPosition = 'highest' | 'only' | 'lowest';

export interface CommunicationState {
  /** True once this seat's one-per-mission radio token has been spent -- never resets (see CrewSetupData's doc: one match = one mission attempt). */
  used: boolean;
  /** The communicated card's id, cleared (but `used` stays true) once that exact card is played -- rulebook's "reminder card discarded when the communicated card is played". */
  cardId: string | null;
  position: CommunicationPosition | null;
}

export interface CrewG extends RoundConfirmG {
  /**
   * Every seat actually claimed by a real user at match-start time -- same
   * pattern as Regicide/Love Letter: the platform always creates
   * gameModule.maxPlayers (5) engine seats regardless of how many are
   * actually claimed.
   */
  activeSeatIDs: string[];
  /** 1-50, from room.gameSettings via CrewSetupData. */
  level: number;
  /** Whoever held the rocket 4 after dealing -- rulebook's commander. */
  commanderSeatID: string;
  /** Per-player secret -- conformance suite secretKey. */
  hands: Record<string, Card[]>;
  /** Public. The `level.taskCount` task cards drawn for this mission, in fixed draft-layout order -- index IS a task's permanent `taskIndex` for LevelConstraint purposes, independent of who ends up picking it or when. */
  taskLayout: TaskCard[];
  /** Public. Ids from `taskLayout` still available to pick during missionDraft. */
  unclaimedTaskCardIds: string[];
  /** Public. Every drafted task, owner, and fulfillment status. */
  tasks: Task[];
  /** Public -- the communicated card and its claimed highest/only/lowest position are exactly what's meant to be visible to everyone. */
  communications: Record<string, CommunicationState>;
  /** Public. Null only during missionDraft and while a trickConfirm wait is pending (the next one hasn't been dealt yet). */
  currentTrick: { leaderSeatID: string; plays: TrickPlay[] } | null;
  /** Public. Kept visible through the whole trickConfirm wait -- the same deferred-cleanup pattern Regicide uses for cardsInPlay/pendingEnemyDisposal -- so everyone can review the trick that just happened before it's replaced. Null before the first trick. */
  lastTrick: { plays: TrickPlay[]; winnerSeatID: string; winningCard: Card } | null;
  /**
   * Chronological history of which TOKENED tasks (ones with a `taskOrder`
   * LevelConstraint) were fulfilled together in the same trick -- one
   * entry ("batch") per trick that fulfilled at least one tokened task,
   * in trick order. Consumed by constraints.ts's checkTaskOrderViolations.
   */
  tokenFulfillmentBatches: number[][];
  /** 1-indexed once trick 1 begins; 0 during missionDraft/the pre-game trickConfirm wait. */
  trickNumber: number;
  /** floor(40 / activeSeatIDs.length) -- see deck.ts's dealHands doc comment for why this, not the max hand size, is the mission's fixed trick count. */
  totalTricks: number;
  /** Input to the trickConfirm phase's turn.order.first -- the commander before trick 1, otherwise the previous trick's winner. Consumed when trickConfirm ends and the next trick is dealt. */
  nextTrickLeaderSeatID: string | null;
  /**
   * Mission 5's runtime-chosen "sick" seat (see levels.ts's
   * `commanderChoosesSick`) -- null until the commander's `chooseSickSeat`
   * move, which is only legal before trick 1. Missions without that
   * constraint simply never have this set to anything but null.
   */
  sickSeatID: string | null;
  /**
   * Mission 11's runtime-chosen "muted" seat (see levels.ts's
   * `commanderChoosesMuted`) -- null until the commander's
   * `chooseMutedSeat` move, which (like `chooseSickSeat`) is only legal
   * before trick 1. That seat's `communicateCard` calls are rejected for
   * the rest of the mission.
   */
  mutedSeatID: string | null;
  /**
   * The rulebook's 5-player task-handover rule (see levels.ts's
   * `handoverAllowed` and gameDef.ts's `handoverTask` move): true once any
   * crew member has used the mission's single handover, for the rest of
   * the mission. Missions without that flag simply never see this
   * transition away from false.
   */
  handoverUsed: boolean;
  /**
   * Every trick's winning card id, in trick order, for the whole mission
   * -- consumed by constraints.ts's checkAchievementSatisfied (mission
   * 9's "win a trick with each 1"). Cheap to always track (at most
   * `totalTricks` entries) rather than only for missions that need it.
   */
  winningCardIdsSeen: string[];
  log: GameLogEntry[];
  matchResult: 'won' | 'lost' | null;
}

export interface CrewView extends Omit<CrewG, 'hands'> {
  /** Every active seat's hand SIZE -- public, unlike the hand contents themselves. */
  handCounts: Record<string, number>;
  hands: Record<string, Card[]>;
}

export interface CrewSetupData {
  /** Seats actually claimed when the match was started -- see CrewG.activeSeatIDs. */
  claimedSeatIDs?: string[];
  /** The host's own seat, if any -- see RoundConfirmG.hostPlayerID. */
  hostPlayerID?: string | null;
  /**
   * 1-50, from room.gameSettings (the settingsSchema's `level` field).
   * One boardgame.io match is one mission attempt at this level: a loss
   * ends the match (ctx.gameover, no winner) and the room's existing
   * Rematch button redeals a fresh attempt at the same level; a win ends
   * the match with every active seat as winner, and a generalized
   * Rematch (see feature 026) starts a fresh match one level higher with
   * the same seats. There is no in-match "retry the same attempt" loop.
   */
  level?: number;
}

interface CrewEvents {
  endTurn(): void;
}

type ShuffleFn = { Shuffle<T>(deck: T[]): T[] };

function seatIDs(ctx: Ctx): string[] {
  return Array.from({ length: ctx.numPlayers }, (_, i) => String(i));
}

function validateCrewSetupData(setupData: CrewSetupData | undefined, numPlayers: number): string | undefined {
  const effectiveCount = setupData?.claimedSeatIDs?.length ?? numPlayers;
  if (effectiveCount < 3 || effectiveCount > 5) {
    return `crew-v1: supports 3-5 players, got ${effectiveCount}`;
  }
  const level = setupData?.level ?? 1;
  if (!Number.isInteger(level) || level < 1 || level > 50) {
    return `crew-v1: level must be an integer 1-50, got ${level}`;
  }
  return undefined;
}

function removeFromHand(hand: Card[], cardID: string): Card | undefined {
  const index = hand.findIndex((c) => c.id === cardID);
  if (index === -1) return undefined;
  return hand.splice(index, 1)[0];
}

/** Plain clockwise among active seats, looping past any inactive phantom seat -- shared by every phase's turn order below. */
function nextActiveSeatIndex({ G, ctx }: { G: CrewG; ctx: Ctx }): number | undefined {
  const order = ctx.playOrder;
  for (let step = 1; step <= order.length; step++) {
    const candidateIdx = (ctx.playOrderPos + step) % order.length;
    if (G.activeSeatIDs.includes(order[candidateIdx]!)) return candidateIdx;
  }
  return undefined;
}

const draftTurnOrder: TurnOrderConfig<CrewG> = {
  first: ({ G, ctx }) => ctx.playOrder.indexOf(G.commanderSeatID),
  next: nextActiveSeatIndex,
};

const trickTurnOrder: TurnOrderConfig<CrewG> = {
  first: ({ G, ctx }) => ctx.playOrder.indexOf(G.currentTrick!.leaderSeatID),
  next: nextActiveSeatIndex,
};

const confirmTurnOrder: TurnOrderConfig<CrewG> = {
  first: ({ G, ctx }) => ctx.playOrder.indexOf(G.nextTrickLeaderSeatID ?? G.commanderSeatID),
  next: nextActiveSeatIndex,
};

// --- Setup ---------------------------------------------------------------

function buildInitialG(activeSeatIDs: string[], hostPlayerID: string | null, level: number): CrewG {
  return {
    activeSeatIDs,
    roundConfirm: null,
    hostPlayerID,
    level,
    commanderSeatID: '',
    hands: {},
    taskLayout: [],
    unclaimedTaskCardIds: [],
    tasks: [],
    communications: Object.fromEntries(
      activeSeatIDs.map((id) => [id, { used: false, cardId: null, position: null }]),
    ),
    currentTrick: null,
    lastTrick: null,
    tokenFulfillmentBatches: [],
    trickNumber: 0,
    totalTricks: 0,
    nextTrickLeaderSeatID: null,
    sickSeatID: null,
    mutedSeatID: null,
    handoverUsed: false,
    winningCardIdsSeen: [],
    log: [],
    matchResult: null,
  };
}

function setupGame(G: CrewG, ctx: Ctx, random: ShuffleFn): void {
  const seats = seatIDs(ctx);
  const deck = random.Shuffle(buildPlayingDeck());
  const dealt = dealHands(deck, G.activeSeatIDs);
  G.hands = Object.fromEntries(seats.map((id) => [id, dealt[id] ?? []]));
  G.totalTricks = Math.floor(40 / G.activeSeatIDs.length);

  const commanderSeatID = G.activeSeatIDs.find((id) => G.hands[id]!.some((c) => c.id === COMMANDER_CARD_ID));
  G.commanderSeatID = commanderSeatID!;
  G.nextTrickLeaderSeatID = commanderSeatID!;

  const levelDef = getLevel(G.level);
  const shuffledTaskDeck = random.Shuffle(buildTaskDeck());
  G.taskLayout = shuffledTaskDeck.slice(0, levelDef.taskCount);
  G.unclaimedTaskCardIds = G.taskLayout.map((t) => t.id);
}

// --- Trick resolution ------------------------------------------------------

/**
 * Runs once the trick's final card has been played. Mirrors Regicide's
 * playCards -- resolution happens directly in the move (not in a phase's
 * onEnd) specifically so a match-ending win/loss can skip the
 * trickConfirm wait entirely: it sets G.matchResult and returns without
 * calling beginRoundConfirm, so the `trick` phase's own endIf (`G.
 * roundConfirm !== null`) stays false and no phase transition is
 * attempted -- the top-level `endIf` ends the match on its own next
 * check, exactly like Regicide's 12th-enemy defeat.
 */
function resolveCompletedTrick(G: CrewG, random: ShuffleFn): void {
  const trick = G.currentTrick!;
  const { winnerSeatID, winningCard } = resolveTrick(trick.plays);
  const level = getLevel(G.level);
  G.winningCardIdsSeen.push(winningCard.id);

  const { violated: taskViolated, fulfilledDraftIndexes } = applyTaskFulfillment(G.tasks, {
    winnerSeatID,
    plays: trick.plays,
  });

  let violated = taskViolated;
  if (!violated) {
    const tokenedFulfilled = fulfilledDraftIndexes.filter((idx) =>
      level.constraints.some((c) => c.kind === 'taskOrder' && c.taskIndex === idx),
    );
    if (tokenedFulfilled.length > 0) G.tokenFulfillmentBatches.push(tokenedFulfilled);
    if (checkTaskOrderViolations(level.constraints, G.tokenFulfillmentBatches)) violated = true;
  }
  if (!violated && checkLastOrderViolations(level.constraints, G.tasks)) {
    violated = true;
  }
  if (!violated && checkSickSeatViolation(level.constraints, { winnerSeatID }, G.sickSeatID)) {
    violated = true;
  }
  if (!violated && checkTrickOutcomeViolations(level.constraints, { winnerSeatID, winningCard }, G.activeSeatIDs)) {
    violated = true;
  }

  G.log.push({
    key: 'crew.log.trickWon',
    params: { actor: winnerSeatID, card: winningCard.id, trickNumber: G.trickNumber },
  });

  if (violated) {
    G.matchResult = 'lost';
    G.log.push({ key: 'crew.log.matchLost' });
    return;
  }

  const allTasksFulfilled = G.tasks.length > 0 && G.tasks.every((t) => t.fulfilled);
  // An achievement-style mission (e.g. mission 9's "win a trick with each
  // 1", mission 13's "win a trick with each rocket") wins the instant
  // it's satisfied, same as tasks -- it doesn't need to wait for the
  // mission's last trick.
  const missionHasAchievement = hasAchievementConstraint(level.constraints);
  const achievementSatisfied = missionHasAchievement && checkAchievementSatisfied(level.constraints, G.winningCardIdsSeen);

  if (allTasksFulfilled || achievementSatisfied) {
    G.matchResult = 'won';
    G.log.push({ key: 'crew.log.matchWon' });
    return;
  }

  const isLastTrick = G.trickNumber >= G.totalTricks;
  if (isLastTrick) {
    // No violation ever fired, yet the mission isn't won either. For a
    // task-based mission, an unfulfilled task can only mean its target
    // card was the "extra" card a 3-player deal leaves permanently
    // unplayed (see deck.ts's dealHands doc comment) -- a loss. For an
    // achievement mission (mission 9/13) that never got there, also a
    // loss. A plain 0-task, constraint-only mission (no achievement to
    // reach, just something to avoid) reaching its last trick unscathed
    // is exactly what winning it means.
    const pureAvoidanceMission = G.tasks.length === 0 && !missionHasAchievement;
    G.matchResult = pureAvoidanceMission ? 'won' : 'lost';
    G.log.push({ key: G.matchResult === 'won' ? 'crew.log.matchWon' : 'crew.log.matchLost' });
    return;
  }

  // Mission 12's one-time post-trick-1 random card pass -- only once,
  // only when the mission is actually continuing past trick 1 (a
  // match-ending win/loss on trick 1 itself already returned above).
  if (G.trickNumber === 1 && level.constraints.some((c) => c.kind === 'randomCardPassAfterTrick1')) {
    performCardPass(G, random);
  }

  G.lastTrick = { plays: trick.plays, winnerSeatID, winningCard };
  G.currentTrick = null;
  G.nextTrickLeaderSeatID = winnerSeatID;
  beginRoundConfirm(G, G.activeSeatIDs);
}

/**
 * Mission 12: immediately after trick 1, every active seat simultaneously
 * takes one random card from the next seat's (clockwise, per
 * `activeSeatIDs` order -- same seating convention as
 * `seatNeverWinsTrick`) hand. "Simultaneous" means each seat's card is
 * picked from a snapshot of their PRE-pass hand, before any hand is
 * mutated, so a seat's own outgoing pick is never influenced by a card it
 * only just received from someone else. A seat's currently-communicated
 * (face-up, not really "in hand" anymore) card is never eligible to be
 * taken; falls back to the whole hand only if that would leave nothing
 * to pick from at all.
 */
function performCardPass(G: CrewG, random: ShuffleFn): void {
  const order = G.activeSeatIDs;
  const takenCards: Record<string, Card> = {};
  for (const seatID of order) {
    const hand = G.hands[seatID]!;
    const communicatedCardId = G.communications[seatID]?.cardId ?? null;
    const eligible = hand.filter((c) => c.id !== communicatedCardId);
    const pool = eligible.length > 0 ? eligible : hand;
    takenCards[seatID] = random.Shuffle(pool)[0]!;
  }
  for (let i = 0; i < order.length; i++) {
    const giverSeatID = order[i]!;
    const receiverSeatID = order[(i + 1) % order.length]!;
    const card = takenCards[giverSeatID]!;
    removeFromHand(G.hands[giverSeatID]!, card.id);
    G.hands[receiverSeatID]!.push(card);
  }
}

// --- Moves -----------------------------------------------------------------

function pickTask(
  { G, playerID, events }: { G: CrewG; playerID: string; events: CrewEvents },
  taskCardId: string,
): typeof INVALID_MOVE | void {
  if (!G.activeSeatIDs.includes(playerID)) return INVALID_MOVE;
  const level = getLevel(G.level);
  // Mission 20 (Commander's decision): the normal one-at-a-time draft
  // never applies -- chooseTaskRecipient is the only valid way tasks get
  // assigned on such a mission. Commander's distribution replaces it with
  // distributeTask instead, for the same reason.
  if (level.constraints.some((c) => c.kind === 'commanderAssignsTasks')) return INVALID_MOVE;
  if (level.commanderDistribution) return INVALID_MOVE;
  if (!G.unclaimedTaskCardIds.includes(taskCardId)) return INVALID_MOVE;
  const taskCard = G.taskLayout.find((t) => t.id === taskCardId);
  if (!taskCard) return INVALID_MOVE;

  G.unclaimedTaskCardIds = G.unclaimedTaskCardIds.filter((id) => id !== taskCardId);
  G.tasks.push({
    taskCardId: taskCard.id,
    targetCardId: taskTargetCardId(taskCard),
    ownerSeatID: playerID,
    fulfilled: false,
    draftIndex: G.taskLayout.indexOf(taskCard),
  });
  // Explicit, rather than a phase-level moveLimit, matching this
  // codebase's convention (see regicide/gameDef.ts's playCards/yieldTurn)
  // -- a draft "turn" is always exactly one pick. Skipped when this was
  // the last task card (the phase is about to end via endIf on its own)
  // -- same "don't endTurn into a transition" reasoning as Regicide's
  // playCards not calling endTurn() on an enemy-defeating play.
  if (G.unclaimedTaskCardIds.length > 0) {
    events.endTurn();
  }
}

/**
 * Mission 20 (Commander's decision): instead of the normal clockwise
 * draft, the commander blindly assigns EVERY task card in `taskLayout` to
 * one other seat at once, before anyone (including the commander) knows
 * what those tasks are. The rulebook's own yes/no poll preceding this has
 * no gameplay effect (the commander isn't bound by the answers), so it's
 * not modeled -- see levels.ts's `commanderAssignsTasks` doc comment.
 */
function chooseTaskRecipient(
  { G, playerID }: { G: CrewG; playerID: string },
  seatID: string,
): typeof INVALID_MOVE | void {
  if (playerID !== G.commanderSeatID) return INVALID_MOVE;
  if (seatID === G.commanderSeatID) return INVALID_MOVE;
  if (!G.activeSeatIDs.includes(seatID)) return INVALID_MOVE;
  if (!getLevel(G.level).constraints.some((c) => c.kind === 'commanderAssignsTasks')) return INVALID_MOVE;
  if (G.unclaimedTaskCardIds.length === 0) return INVALID_MOVE; // already assigned.

  for (const taskCard of G.taskLayout) {
    G.tasks.push({
      taskCardId: taskCard.id,
      targetCardId: taskTargetCardId(taskCard),
      ownerSeatID: seatID,
      fulfilled: false,
      draftIndex: G.taskLayout.indexOf(taskCard),
    });
  }
  G.unclaimedTaskCardIds = [];
}

/**
 * The rulebook's "Commander's distribution" symbol (mission logbook, p.18):
 * a different alternate task-assignment method from `chooseTaskRecipient`
 * above. Task cards are revealed ONE AT A TIME, in fixed `taskLayout`
 * order (`G.unclaimedTaskCardIds[0]` -- built from `taskLayout` and only
 * ever filtered, never reordered, so it always holds the next
 * lowest-`taskIndex` card), and the commander assigns each one to a seat
 * of their choice -- including themselves, unlike `chooseTaskRecipient`.
 * The rulebook's own yes/no poll before each assignment has no gameplay
 * effect (the commander isn't bound by the answers) and is not modeled,
 * same reasoning as `chooseTaskRecipient`. `isEvenTaskDistribution`
 * enforces the rulebook's "no one may end up with two tasks more than
 * another crew member" requirement on every single assignment.
 */
function distributeTask(
  { G, playerID }: { G: CrewG; playerID: string },
  seatID: string,
): typeof INVALID_MOVE | void {
  if (playerID !== G.commanderSeatID) return INVALID_MOVE;
  if (!getLevel(G.level).commanderDistribution) return INVALID_MOVE;
  if (!G.activeSeatIDs.includes(seatID)) return INVALID_MOVE;
  if (G.unclaimedTaskCardIds.length === 0) return INVALID_MOVE;
  if (!isEvenTaskDistribution(G.tasks, G.activeSeatIDs, seatID)) return INVALID_MOVE;

  const taskCardId = G.unclaimedTaskCardIds[0]!;
  const taskCard = G.taskLayout.find((t) => t.id === taskCardId)!;
  G.unclaimedTaskCardIds = G.unclaimedTaskCardIds.slice(1);
  G.tasks.push({
    taskCardId: taskCard.id,
    targetCardId: taskTargetCardId(taskCard),
    ownerSeatID: seatID,
    fulfilled: false,
    draftIndex: G.taskLayout.indexOf(taskCard),
  });
}

/**
 * The rulebook's 5-player task-handover rule (p.19): once, before trick 1,
 * any crew member (not just the commander) may hand one of their own
 * drafted tasks to another active seat -- the total task count never
 * changes, only ownership. Documented in the rulebook strictly as a
 * five-player rule, so this gates on `G.activeSeatIDs.length === 5`
 * directly rather than trusting `handoverAllowed` alone (a level could in
 * principle carry the flag while being played with fewer than 5 seats).
 * Order/position constraints reference tasks by their fixed `taskIndex`,
 * never by owner, so a handover cannot disturb any `taskOrder` bookkeeping.
 */
function handoverTask(
  { G, playerID }: { G: CrewG; playerID: string },
  taskCardId: string,
  toSeatID: string,
): typeof INVALID_MOVE | void {
  if (G.activeSeatIDs.length !== 5) return INVALID_MOVE;
  if (!getLevel(G.level).handoverAllowed) return INVALID_MOVE;
  if (G.trickNumber !== 0) return INVALID_MOVE;
  if (G.handoverUsed) return INVALID_MOVE;
  if (toSeatID === playerID) return INVALID_MOVE;
  if (!G.activeSeatIDs.includes(toSeatID)) return INVALID_MOVE;
  const task = G.tasks.find((t) => t.taskCardId === taskCardId);
  if (!task || task.ownerSeatID !== playerID) return INVALID_MOVE;

  task.ownerSeatID = toSeatID;
  G.handoverUsed = true;
}

function communicateCard(
  { G, playerID }: { G: CrewG; playerID: string },
  cardId: string,
  position: CommunicationPosition,
): typeof INVALID_MOVE | void {
  const level = getLevel(G.level);
  if (isSeatMuted(level.constraints, G.mutedSeatID, playerID)) return INVALID_MOVE;
  // Disruption: no crew member may communicate at all until the mission
  // reaches the trick this level names. `disruptionResumesAtTrick` is the
  // last BLOCKED trick number (confirmed against the user's own
  // transcription, e.g. mission 18's "Disruption: 2" + "can communicate
  // after trick 2") -- NOT "the first trick communication is allowed",
  // which is how the base rulebook's own single worked example phrases
  // it. G.trickNumber is the trick most recently played (0 before trick
  // 1), so this is exactly "communication resumes once trick N has been
  // played."
  if (level.disruptionResumesAtTrick !== undefined && G.trickNumber < level.disruptionResumesAtTrick) {
    return INVALID_MOVE;
  }
  const comm = G.communications[playerID];
  if (!comm || comm.used) return INVALID_MOVE;
  const hand = G.hands[playerID];
  if (!hand) return INVALID_MOVE;
  const card = hand.find((c) => c.id === cardId);
  if (!card || card.suit === 'rocket') return INVALID_MOVE;

  const claimHolds =
    position === 'highest'
      ? isHighestOfSuit(hand, card)
      : position === 'only'
        ? isOnlyOfSuit(hand, card)
        : position === 'lowest'
          ? isLowestOfSuit(hand, card)
          : false;
  if (!claimHolds) return INVALID_MOVE;

  comm.used = true;
  comm.cardId = cardId;
  comm.position = position;
}

/**
 * Mission 5's "sick" crewmate: the commander names one OTHER active seat
 * before trick 1 (see levels.ts's `commanderChoosesSick`). A fully public
 * choice -- there's nothing hidden about it -- so it's plain G state, not
 * threaded through any per-seat secret. Only legal once, only for the
 * commander, only before trick 1, and only on a mission that actually
 * uses this mechanic (checked here rather than only scoping the move to
 * a phase, since it must remain available through every trickConfirm
 * re-entry until trick 1 specifically, not just the first one).
 */
function chooseSickSeat({ G, playerID }: { G: CrewG; playerID: string }, seatID: string): typeof INVALID_MOVE | void {
  if (playerID !== G.commanderSeatID) return INVALID_MOVE;
  if (G.trickNumber !== 0) return INVALID_MOVE;
  if (G.sickSeatID !== null) return INVALID_MOVE;
  if (seatID === G.commanderSeatID) return INVALID_MOVE;
  if (!G.activeSeatIDs.includes(seatID)) return INVALID_MOVE;
  const level = getLevel(G.level);
  if (!level.constraints.some((c) => c.kind === 'commanderChoosesSick')) return INVALID_MOVE;
  G.sickSeatID = seatID;
}

/**
 * Mission 11's "muted" crewmate: same shape as `chooseSickSeat`, gating
 * `communicateCard` instead of trick outcomes (see constraints.ts's
 * `isSeatMuted`).
 */
function chooseMutedSeat({ G, playerID }: { G: CrewG; playerID: string }, seatID: string): typeof INVALID_MOVE | void {
  if (playerID !== G.commanderSeatID) return INVALID_MOVE;
  if (G.trickNumber !== 0) return INVALID_MOVE;
  if (G.mutedSeatID !== null) return INVALID_MOVE;
  if (seatID === G.commanderSeatID) return INVALID_MOVE;
  if (!G.activeSeatIDs.includes(seatID)) return INVALID_MOVE;
  const level = getLevel(G.level);
  if (!level.constraints.some((c) => c.kind === 'commanderChoosesMuted')) return INVALID_MOVE;
  G.mutedSeatID = seatID;
}

function playCard(
  { G, playerID, events, random }: { G: CrewG; playerID: string; events: CrewEvents; random: ShuffleFn },
  cardId: string,
): typeof INVALID_MOVE | void {
  if (G.matchResult) return INVALID_MOVE;
  const trick = G.currentTrick;
  if (!trick) return INVALID_MOVE;
  if (trick.plays.some((p) => p.seatID === playerID)) return INVALID_MOVE;
  const hand = G.hands[playerID];
  if (!hand) return INVALID_MOVE;
  const card = hand.find((c) => c.id === cardId);
  if (!card) return INVALID_MOVE;
  const ledSuit = trick.plays[0]?.card.suit ?? null;
  if (!isLegalTrickPlay(hand, ledSuit, card)) return INVALID_MOVE;

  removeFromHand(hand, cardId);
  trick.plays.push({ seatID: playerID, card });

  const comm = G.communications[playerID]!;
  if (comm.cardId === cardId) {
    comm.cardId = null;
    comm.position = null;
  }

  if (trick.plays.length < G.activeSeatIDs.length) {
    events.endTurn();
    return;
  }

  resolveCompletedTrick(G, random);
}

// --- Game definition -----------------------------------------------------

function matchGameoverResult(G: CrewG): GameoverResult | undefined {
  if (G.matchResult === 'won') return { winner: G.activeSeatIDs };
  if (G.matchResult === 'lost') return {};
  return undefined;
}

export const crewGameDef: Game<CrewG, Record<string, unknown>, CrewSetupData> = {
  setup: ({ ctx, random }, setupData) => {
    const error = validateCrewSetupData(setupData, ctx.numPlayers);
    if (error) throw new Error(error);
    const activeSeatIDs = setupData?.claimedSeatIDs ?? seatIDs(ctx);
    const level = setupData?.level ?? 1;
    const G = buildInitialG(activeSeatIDs, setupData?.hostPlayerID ?? null, level);
    setupGame(G, ctx, random);
    return G;
  },

  validateSetupData: (setupData, numPlayers) => validateCrewSetupData(setupData, numPlayers),

  phases: {
    missionDraft: {
      start: true,
      endIf: ({ G }) => G.unclaimedTaskCardIds.length === 0,
      next: () => 'trickConfirm',
      turn: { order: draftTurnOrder },
      moves: { pickTask, chooseTaskRecipient, distributeTask },
      // Opens the pre-game communication/ready-check window (trickConfirm,
      // repurposed here for "before trick 1" too -- see its own doc
      // comment) once every task card has been drafted, including the
      // 0-task constraint-only mission case where this fires immediately
      // with no pickTask move ever having been called.
      onEnd: ({ G }) => {
        beginRoundConfirm(G, G.activeSeatIDs);
      },
    },

    // Used BOTH before trick 1 (nothing to show yet -- G.lastTrick is
    // still null, this is purely the pre-game communication window) AND
    // between every subsequent trick (showing the just-resolved
    // G.lastTrick) -- one phase serving both contexts, per the user's own
    // requirement that communication only be possible right after a trick
    // or before the very first one. Reuses roundConfirm.ts directly, same
    // as Regicide's roundConfirm phase.
    trickConfirm: {
      turn: { order: confirmTurnOrder, activePlayers: ActivePlayers.ALL },
      endIf: ({ G }) => isRoundConfirmComplete(G.roundConfirm),
      onEnd: ({ G }) => {
        G.roundConfirm = null;
        G.trickNumber += 1;
        G.currentTrick = { leaderSeatID: G.nextTrickLeaderSeatID!, plays: [] };
        G.lastTrick = null;
      },
      next: () => 'trick',
      moves: {
        confirmRoundReady: confirmRoundReadyMove,
        forceAdvanceRound: forceAdvanceRoundMove,
        communicateCard,
        chooseSickSeat,
        chooseMutedSeat,
        handoverTask,
      },
    },

    trick: {
      // Stays false (no transition) on a match-ending win/loss -- see
      // resolveCompletedTrick's own doc comment.
      endIf: ({ G }) => G.roundConfirm !== null,
      next: () => 'trickConfirm',
      turn: { order: trickTurnOrder },
      moves: { playCard },
    },
  },

  endIf: ({ G }) => matchGameoverResult(G),

  playerView: ({ G, playerID }) => {
    const { hands, ...publicG } = G;
    // Dead Zone (rulebook: the token is flipped to its red side instead of
    // being placed on the card): every viewer OTHER than the seat who
    // made the claim sees the communicated card itself (still face up,
    // unchanged) but not which highest/only/lowest position it claims --
    // the owner alone still knows what they meant. Doesn't affect
    // `communicateCard`'s own validation, which always reads the real,
    // unfiltered G server-side; this is purely a per-viewer display
    // filter, same category as `hands` above.
    const level = getLevel(G.level);
    const communications = level.deadZone
      ? Object.fromEntries(
          Object.entries(G.communications).map(([seatID, comm]) => [
            seatID,
            seatID === playerID ? comm : { ...comm, position: null },
          ]),
        )
      : G.communications;
    const view: CrewView = {
      ...publicG,
      communications,
      handCounts: Object.fromEntries(Object.entries(hands).map(([id, hand]) => [id, hand.length])),
      hands: playerID != null ? { [playerID]: hands[playerID] ?? [] } : {},
    };
    return view;
  },
};
