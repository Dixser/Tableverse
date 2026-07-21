import type { Suit } from './deck.js';

/**
 * The rulebook's task order tokens: an absolute rank among every task
 * carrying a `position` token ("1st"/"2nd"/.../"5th"), a relative
 * requirement against one specific other task ("before"/"after" that
 * task), or `last` -- the logbook's "Omega" token, meaning this task must
 * be fulfilled after EVERY other task in the mission, tokened or not
 * (unlike `position`, which only ranks among other tokened tasks).
 * `relativeToTaskIndex` and `taskIndex` below both refer to a task's
 * 0-indexed position in mission-draft order (the order task cards were
 * placed face-up, left to right) -- matching the rulebook's own "the
 * first task token with the first task card" convention.
 */
export type TaskOrderRule =
  | { type: 'position'; position: 1 | 2 | 3 | 4 | 5 }
  | { type: 'before'; relativeToTaskIndex: number }
  | { type: 'after'; relativeToTaskIndex: number }
  | { type: 'last' };

/**
 * One mission's win/loss rules beyond plain task ownership. Deliberately a
 * small, extensible discriminated union -- new mission mechanics
 * discovered while transcribing the physical logbook (which the rulebook
 * PDF this module was originally built from doesn't include) are added
 * here one variant at a time, each with its own small pure checker in
 * constraints.ts, rather than reshaping this type or gameDef.ts itself.
 */
export type LevelConstraint =
  | { kind: 'taskOrder'; taskIndex: number; order: TaskOrderRule }
  /** e.g. "the pink 9 may never win a trick". */
  | { kind: 'cardNeverWinsTrick'; suit: Suit; rank: number }
  /** e.g. "won without a 9 winning a trick" -- any suit. */
  | { kind: 'rankNeverWinsTrick'; rank: number }
  /** A FIXED seat position may never win a trick -- see `commanderChoosesSick` for the runtime-chosen version (mission 5). */
  | { kind: 'seatNeverWinsTrick'; seatIndex: number }
  /**
   * Mission 5: before trick 1, the commander publicly names one OTHER
   * active seat as "sick" for this attempt (see gameDef.ts's
   * `chooseSickSeat` move and `G.sickSeatID`); that seat may not win any
   * trick for the rest of the attempt. Carries no data itself -- the
   * chosen seat is runtime state (`G.sickSeatID`), not something the
   * level can declare in advance, unlike `seatNeverWinsTrick`'s fixed
   * seat index.
   */
  | { kind: 'commanderChoosesSick' }
  /**
   * Mission 11: before trick 1, the commander names one OTHER active seat
   * who may not use their radio communication token this mission (see
   * gameDef.ts's `chooseMutedSeat` move and `G.mutedSeatID`). Same
   * runtime-choice shape as `commanderChoosesSick`, just gating
   * `communicateCard` instead of trick outcomes.
   */
  | { kind: 'commanderChoosesMuted' }
  /**
   * Mission 12: immediately after trick 1 resolves (and only if the
   * mission is still ongoing), every active seat simultaneously takes one
   * random card from the next seat's (clockwise) hand -- see gameDef.ts's
   * `performCardPass`. Happens automatically, exactly once (gated on
   * `G.trickNumber === 1`), no player choice involved. A seat's
   * currently-communicated (face-up) card is never eligible to be taken.
   */
  | { kind: 'randomCardPassAfterTrick1' }
  /**
   * Mission 9: the crew must, over the course of the whole mission, have
   * each of the four color cards of this rank (rocket excluded) be the
   * WINNING card of some trick (not necessarily the same trick, not
   * necessarily won by the same seat) -- an achievement to reach, not
   * merely a bad outcome to avoid. Win the instant every color's card of
   * this rank has each won a trick; lose if the mission's last trick
   * arrives without that (see gameDef.ts's `winningCardIdsSeen`).
   */
  | { kind: 'winTrickWithEachRank'; rank: number }
  /**
   * Mission 13: same achievement shape as `winTrickWithEachRank`, but for
   * the 4 rocket cards (ranks 1-4) specifically, rather than one rank
   * across the 4 color suits. Carries no data -- the 4 rocket ranks are
   * fixed.
   */
  | { kind: 'winTrickWithEachRocket' }
  /**
   * Mission 20 (the rulebook's "Commander's decision" symbol): instead of
   * the normal one-at-a-time clockwise draft, the commander blindly
   * assigns ALL of this mission's task cards to one other seat at once,
   * sight unseen, before anyone knows what the tasks are (see gameDef
   * .ts's `chooseTaskRecipient` move). The rulebook's own yes/no poll
   * before the commander's choice has no gameplay effect (the commander
   * isn't bound by the answers) and is not modeled -- see this mission's
   * own plan notes. `pickTask` is rejected outright on a mission with
   * this constraint; `chooseTaskRecipient` is the only valid draft move.
   */
  | { kind: 'commanderAssignsTasks' };

export interface LevelDefinition {
  level: number;
  /** Number of task cards drawn face-up for this mission. 0 for a constraint-only mission (rulebook: "some missions do not use task cards"). */
  taskCount: number;
  constraints: LevelConstraint[];
  /**
   * Real logbook symbols recorded now even though the engine doesn't act
   * on any of them yet (see spec/features/024-crew-rules/spec.md's
   * Non-goals) -- avoids a second pass through the physical book once
   * these mechanics are eventually built.
   */
  deadZone?: boolean;
  /** Communication is blocked until this trick number (inclusive of the trick itself becoming allowed). */
  disruptionResumesAtTrick?: number;
  /**
   * The rulebook's "Commander's distribution" symbol: task cards are
   * revealed ONE AT A TIME (in fixed `taskLayout` order) and the commander
   * assigns each to a seat of their choice, including themselves -- a
   * DIFFERENT mechanic from `commanderAssignsTasks` above (which assigns
   * every task to one other seat at once, sight unseen, and forbids the
   * commander from choosing themselves). See gameDef.ts's `distributeTask`
   * move and constraints.ts's `isEvenTaskDistribution` for the rulebook's
   * "no one may end up with two tasks more than another" enforcement.
   */
  commanderDistribution?: boolean;
  /**
   * The rulebook's 5-player task-handover rule (p.19): once, before trick
   * 1, any crew member may hand one of their own drafted tasks to another
   * active seat. Documented as a five-players-only rule -- see gameDef
   * .ts's `handoverTask` move, which additionally gates on exactly 5
   * active seats, not just this flag. Normally appears on 5-player
   * missions 25+, but the logbook can also mark it on other missions
   * (e.g. 27/37), so this stays a per-level flag rather than a hardcoded
   * `level >= 25` check.
   */
  handoverAllowed?: boolean;
}

/**
 * Transcribed from the user's own physical logbook (missions 1-21 of 50;
 * the rest are future batches -- see spec/features/024-crew-rules's
 * Non-goals). Ambiguous wording was confirmed with the user before being
 * encoded here, not guessed at:
 * - Mission 5's "sick" crewmate is a runtime commander choice, not a
 *   fixed seat -- see `commanderChoosesSick` above.
 * - Mission 6's two arrow tokens: slot 1 before (or same trick as) slot 2
 *   (corrected from an earlier transcription: it's a Dead Zone mission,
 *   not Disruption).
 * - Mission 7's Omega/"last" token: slot 1 must be fulfilled after BOTH
 *   other (untokened) tasks in the mission, not just other tokened ones.
 * - Mission 9's "win a trick with each 1" is an achievement to reach
 *   (each color's 1 must each win a trick at some point), not a bad
 *   outcome to avoid.
 * - Mission 11's muted seat: the commander cannot mute themselves (same
 *   restriction as mission 5's sick pick).
 * - Mission 12's card pass: clockwise, simultaneous, fully random and
 *   automatic, communicated cards exempt.
 * - Mission 20 (Commander's decision): built for real, not left inert --
 *   see `commanderAssignsTasks` above.
 */
export const LEVELS: LevelDefinition[] = [
  { level: 1, taskCount: 1, constraints: [] },
  { level: 2, taskCount: 2, constraints: [] },
  {
    level: 3,
    taskCount: 2,
    constraints: [
      { kind: 'taskOrder', taskIndex: 0, order: { type: 'position', position: 1 } },
      { kind: 'taskOrder', taskIndex: 1, order: { type: 'position', position: 2 } },
    ],
  },
  { level: 4, taskCount: 3, constraints: [] },
  // The commander names one other seat "sick" before trick 1; that seat may not win any trick.
  { level: 5, taskCount: 0, constraints: [{ kind: 'commanderChoosesSick' }] },
  {
    level: 6,
    taskCount: 3,
    constraints: [{ kind: 'taskOrder', taskIndex: 0, order: { type: 'before', relativeToTaskIndex: 1 } }],
    deadZone: true,
  },
  // Omega token: the first-drafted task must be fulfilled last of all 3 tasks in this mission.
  {
    level: 7,
    taskCount: 3,
    constraints: [{ kind: 'taskOrder', taskIndex: 0, order: { type: 'last' } }],
  },
  {
    level: 8,
    taskCount: 3,
    constraints: [
      { kind: 'taskOrder', taskIndex: 0, order: { type: 'position', position: 1 } },
      { kind: 'taskOrder', taskIndex: 1, order: { type: 'position', position: 2 } },
      { kind: 'taskOrder', taskIndex: 2, order: { type: 'position', position: 3 } },
    ],
  },
  // Win a trick with each color's 1 (rocket 1 excluded) at some point during the mission.
  { level: 9, taskCount: 0, constraints: [{ kind: 'winTrickWithEachRank', rank: 1 }] },
  { level: 10, taskCount: 4, constraints: [] },
  // The commander names one other seat who may not communicate this mission.
  {
    level: 11,
    taskCount: 4,
    constraints: [
      { kind: 'taskOrder', taskIndex: 0, order: { type: 'position', position: 1 } },
      { kind: 'commanderChoosesMuted' },
    ],
  },
  // Omega token, plus the one-time post-trick-1 random card pass.
  {
    level: 12,
    taskCount: 4,
    constraints: [
      { kind: 'taskOrder', taskIndex: 0, order: { type: 'last' } },
      { kind: 'randomCardPassAfterTrick1' },
    ],
  },
  // Win a trick with each of the 4 rocket cards at some point during the mission.
  { level: 13, taskCount: 0, constraints: [{ kind: 'winTrickWithEachRocket' }] },
  {
    level: 14,
    taskCount: 4,
    constraints: [
      { kind: 'taskOrder', taskIndex: 0, order: { type: 'before', relativeToTaskIndex: 1 } },
      { kind: 'taskOrder', taskIndex: 1, order: { type: 'after', relativeToTaskIndex: 0 } },
      { kind: 'taskOrder', taskIndex: 2, order: { type: 'after', relativeToTaskIndex: 1 } },
    ],
    deadZone: true,
  },
  {
    level: 15,
    taskCount: 4,
    constraints: [
      { kind: 'taskOrder', taskIndex: 0, order: { type: 'position', position: 1 } },
      { kind: 'taskOrder', taskIndex: 1, order: { type: 'position', position: 2 } },
      { kind: 'taskOrder', taskIndex: 2, order: { type: 'position', position: 3 } },
      { kind: 'taskOrder', taskIndex: 3, order: { type: 'position', position: 4 } },
    ],
  },
  // No task cards -- survive the mission without a 9 ever winning a trick.
  { level: 16, taskCount: 0, constraints: [{ kind: 'rankNeverWinsTrick', rank: 9 }] },
  // Same "no 9 wins a trick" rule, this time alongside 2 real tasks.
  { level: 17, taskCount: 2, constraints: [{ kind: 'rankNeverWinsTrick', rank: 9 }] },
  { level: 18, taskCount: 5, constraints: [], disruptionResumesAtTrick: 2 },
  {
    level: 19,
    taskCount: 5,
    constraints: [{ kind: 'taskOrder', taskIndex: 0, order: { type: 'position', position: 1 } }],
    disruptionResumesAtTrick: 3,
  },
  // Commander's decision: both tasks are blindly assigned to one other seat at once, sight unseen.
  { level: 20, taskCount: 2, constraints: [{ kind: 'commanderAssignsTasks' }] },
  {
    level: 21,
    taskCount: 5,
    constraints: [
      { kind: 'taskOrder', taskIndex: 0, order: { type: 'position', position: 1 } },
      { kind: 'taskOrder', taskIndex: 1, order: { type: 'position', position: 2 } },
    ],
    deadZone: true,
  },
  // PLACEHOLDER (engine validation only, not from the physical logbook):
  // exercises Commander's Distribution ahead of the next real transcribed
  // batch -- replace with the user's actual mission 22 data once supplied,
  // same as mission 6 was corrected earlier.
  { level: 22, taskCount: 3, constraints: [], commanderDistribution: true },
  // PLACEHOLDER (engine validation only, not from the physical logbook):
  // exercises the 5-player task-handover rule -- replace with the user's
  // actual mission 23 data once supplied.
  { level: 23, taskCount: 2, constraints: [], handoverAllowed: true },
];

export function getLevel(level: number): LevelDefinition {
  const found = LEVELS.find((l) => l.level === level);
  if (!found) {
    throw new Error(`crew-v1: no level definition for level ${level}`);
  }
  return found;
}
