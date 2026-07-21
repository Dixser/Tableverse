import { COLOR_SUITS, type Card } from './deck.js';
import type { LevelConstraint } from './levels.js';
import type { TrickPlay } from './trickResolution.js';

export interface Task {
  taskCardId: string;
  targetCardId: string;
  ownerSeatID: string;
  fulfilled: boolean;
  /** 0-indexed mission-draft order -- matches LevelConstraint's taskIndex/relativeToTaskIndex. */
  draftIndex: number;
}

/**
 * Applies one resolved trick's cards against the still-unfulfilled tasks.
 * Rulebook (p.10): a task is fulfilled when its owner *wins the trick
 * containing* its target card -- not necessarily as the trick's own
 * winning card, since the trick's winner takes every card played in it,
 * face down, into their own pile. If the target card was played in this
 * trick by anyone and the trick was won by someone other than the task's
 * owner, that is an immediate, unrecoverable mission loss (p.10: "If a
 * player wins even a single playing card for which another player has
 * the corresponding task card, you lose immediately"), so this stops at
 * the first such violation rather than continuing to process the rest of
 * the trick's cards -- what happens to any other task in the same trick
 * no longer matters once the mission has already failed.
 *
 * Mutates `tasks` in place (marks `fulfilled`), matching this codebase's
 * convention for internal per-trick resolution helpers (see e.g.
 * regicide/gameDef.ts's resolveHearts/resolveDiamonds).
 */
export function applyTaskFulfillment(
  tasks: Task[],
  trick: { winnerSeatID: string; plays: TrickPlay[] },
): { violated: boolean; fulfilledDraftIndexes: number[] } {
  const fulfilledDraftIndexes: number[] = [];
  for (const play of trick.plays) {
    const task = tasks.find((t) => !t.fulfilled && t.targetCardId === play.card.id);
    if (!task) continue;
    if (task.ownerSeatID !== trick.winnerSeatID) {
      return { violated: true, fulfilledDraftIndexes };
    }
    task.fulfilled = true;
    fulfilledDraftIndexes.push(task.draftIndex);
  }
  return { violated: false, fulfilledDraftIndexes };
}

function batchIndexOf(taskIndex: number, batches: number[][]): number | null {
  for (let i = 0; i < batches.length; i++) {
    if (batches[i]!.includes(taskIndex)) return i;
  }
  return null;
}

/**
 * Checks every `taskOrder` constraint against the chronological history of
 * which tokened tasks were fulfilled in which trick ("batch" -- a trick
 * can fulfill more than one task at once). Re-derived from `batches` alone
 * every time it's called (cheap at the handful of tokened tasks a mission
 * has), so callers can just re-run this after every trick rather than
 * track incremental validity themselves.
 *
 * Two tokened tasks fulfilled in the very same trick (same batch index)
 * are deliberately treated as satisfying each other's order requirement
 * regardless of which "actually" resolved first within that trick --
 * rulebook (p.15): "It is possible to win multiple tasks with task tokens
 * in the same trick if the tokens are consecutive... both are considered
 * to have been correctly fulfilled, regardless of which was played
 * first."
 */
export function checkTaskOrderViolations(constraints: LevelConstraint[], batches: number[][]): boolean {
  const orderConstraints = constraints.filter(
    (c): c is Extract<LevelConstraint, { kind: 'taskOrder' }> => c.kind === 'taskOrder',
  );
  for (const c of orderConstraints) {
    const myBatch = batchIndexOf(c.taskIndex, batches);
    if (myBatch === null) continue; // not fulfilled yet -- nothing to check for this task yet.

    if (c.order.type === 'position') {
      for (const other of orderConstraints) {
        if (other.order.type !== 'position' || other === c) continue;
        const otherBatch = batchIndexOf(other.taskIndex, batches);
        if (other.order.position < c.order.position) {
          // A required-earlier position must already be fulfilled by now.
          if (otherBatch === null || otherBatch > myBatch) return true;
        } else if (other.order.position > c.order.position) {
          // A required-later position must not have already happened before this one.
          if (otherBatch !== null && otherBatch < myBatch) return true;
        }
      }
    } else if (c.order.type === 'before') {
      const otherBatch = batchIndexOf(c.order.relativeToTaskIndex, batches);
      // The referenced task must not already have happened strictly earlier.
      if (otherBatch !== null && otherBatch < myBatch) return true;
    } else if (c.order.type === 'after') {
      const otherBatch = batchIndexOf(c.order.relativeToTaskIndex, batches);
      // The referenced task must already have happened by now (same batch is fine).
      if (otherBatch === null || otherBatch > myBatch) return true;
    }
  }
  return false;
}

/**
 * Checks every trick-outcome constraint (no task involved) against one
 * resolved trick. `seatIDByIndex` resolves a `seatNeverWinsTrick`
 * constraint's 0-indexed seat position to the actual seat id at the
 * table (activeSeatIDs, in seating order).
 */
export function checkTrickOutcomeViolations(
  constraints: LevelConstraint[],
  trick: { winnerSeatID: string; winningCard: Card },
  seatIDByIndex: string[],
): boolean {
  for (const c of constraints) {
    if (c.kind === 'cardNeverWinsTrick') {
      if (trick.winningCard.suit === c.suit && trick.winningCard.rank === c.rank) return true;
    } else if (c.kind === 'rankNeverWinsTrick') {
      if (trick.winningCard.rank === c.rank) return true;
    } else if (c.kind === 'seatNeverWinsTrick') {
      if (seatIDByIndex[c.seatIndex] === trick.winnerSeatID) return true;
    }
  }
  return false;
}

/**
 * Checks every `taskOrder` constraint whose order is `last` (the
 * logbook's Omega token, mission 7) -- unlike `position`/`before`/
 * `after` (checked by checkTaskOrderViolations against OTHER TOKENED
 * tasks only, via `batches`), `last` ranks against EVERY task in the
 * mission, tokened or not. Takes the live `tasks` array directly (post
 * this trick's fulfillment) rather than the batch history, since an
 * untokened task has no batch entry to compare against at all.
 */
export function checkLastOrderViolations(constraints: LevelConstraint[], tasks: Task[]): boolean {
  const lastConstraints = constraints.filter(
    (c): c is Extract<LevelConstraint, { kind: 'taskOrder' }> => c.kind === 'taskOrder' && c.order.type === 'last',
  );
  for (const c of lastConstraints) {
    const task = tasks.find((t) => t.draftIndex === c.taskIndex);
    if (!task?.fulfilled) continue; // not fulfilled yet -- nothing to check for this task yet.
    const anyOtherStillPending = tasks.some((t) => t.draftIndex !== c.taskIndex && !t.fulfilled);
    if (anyOtherStillPending) return true;
  }
  return false;
}

/**
 * Mission 5's runtime-chosen "sick" seat (see levels.ts's
 * `commanderChoosesSick`): violated the instant that seat wins any
 * trick. `sickSeatID` is null until the commander actually makes their
 * pre-trick-1 choice (gameDef.ts's `chooseSickSeat` move) -- no seat can
 * violate a constraint that hasn't been assigned to anyone yet.
 */
export function checkSickSeatViolation(
  constraints: LevelConstraint[],
  trick: { winnerSeatID: string },
  sickSeatID: string | null,
): boolean {
  if (sickSeatID === null) return false;
  return constraints.some((c) => c.kind === 'commanderChoosesSick') && trick.winnerSeatID === sickSeatID;
}

const ROCKET_RANKS = [1, 2, 3, 4];

/**
 * Whether `constraints` includes any achievement-style constraint at all
 * (`winTrickWithEachRank`/`winTrickWithEachRocket`) -- callers use this to
 * decide whether a 0-task mission's win condition is "reach the last
 * trick unscathed" (no achievement) or "reach the last trick unscathed
 * AND have satisfied the achievement" (see gameDef.ts's
 * resolveCompletedTrick).
 */
export function hasAchievementConstraint(constraints: LevelConstraint[]): boolean {
  return constraints.some((c) => c.kind === 'winTrickWithEachRank' || c.kind === 'winTrickWithEachRocket');
}

/**
 * Missions 9 and 13's achievement constraints: whether every
 * `winTrickWithEachRank`/`winTrickWithEachRocket` constraint has been
 * satisfied so far -- each of the 4 color suits' card of a given rank
 * (mission 9, rocket excluded per that mission's own wording), or each of
 * the 4 rocket cards themselves (mission 13), must have each won at least
 * one trick at some point during the mission, not necessarily the same
 * trick or the same seat. `winningCardIdsSeen` is the cumulative list of
 * every trick's winning card id so far (gameDef.ts's `G
 * .winningCardIdsSeen`). Returns false if there is no achievement
 * constraint to satisfy -- callers gate on `hasAchievementConstraint`
 * separately.
 */
export function checkAchievementSatisfied(constraints: LevelConstraint[], winningCardIdsSeen: string[]): boolean {
  if (!hasAchievementConstraint(constraints)) return false;
  return constraints.every((c) => {
    if (c.kind === 'winTrickWithEachRank') {
      return COLOR_SUITS.every((suit) => winningCardIdsSeen.includes(`${suit}${c.rank}`));
    }
    if (c.kind === 'winTrickWithEachRocket') {
      return ROCKET_RANKS.every((rank) => winningCardIdsSeen.includes(`rocket${rank}`));
    }
    return true; // not an achievement constraint -- doesn't gate satisfaction.
  });
}

/**
 * Mission 11's runtime-chosen "muted" seat (see levels.ts's
 * `commanderChoosesMuted`): true once that seat is barred from using
 * `communicateCard`, for the rest of the mission. `mutedSeatID` is null
 * until the commander's pre-trick-1 `chooseMutedSeat` move -- no seat is
 * muted before that choice is made.
 */
export function isSeatMuted(constraints: LevelConstraint[], mutedSeatID: string | null, seatID: string): boolean {
  if (mutedSeatID === null) return false;
  return constraints.some((c) => c.kind === 'commanderChoosesMuted') && seatID === mutedSeatID;
}

/**
 * The rulebook's "Commander's distribution" even-split rule (p.18): "at
 * the end of the distribution, no one may have two tasks more than
 * another crew member." Enforced incrementally, one assignment at a time,
 * rather than only at the very end: true iff `candidateSeatID`'s CURRENT
 * task count is already tied for the lowest among `activeSeatIDs` -- i.e.
 * giving them one more can never push any gap above 1. Checking this
 * before every single assignment (see gameDef.ts's `distributeTask`)
 * guarantees the rulebook's end-state invariant holds throughout the
 * whole distribution, not just after the fact.
 */
export function isEvenTaskDistribution(tasks: Task[], activeSeatIDs: string[], candidateSeatID: string): boolean {
  const counts: Record<string, number> = Object.fromEntries(activeSeatIDs.map((id) => [id, 0]));
  for (const t of tasks) {
    if (t.ownerSeatID in counts) counts[t.ownerSeatID]! += 1;
  }
  const minCount = Math.min(...activeSeatIDs.map((id) => counts[id]!));
  return counts[candidateSeatID]! <= minCount;
}
