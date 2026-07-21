import { describe, expect, it } from 'vitest';
import {
  applyTaskFulfillment,
  checkAchievementSatisfied,
  checkLastOrderViolations,
  checkSickSeatViolation,
  checkTaskOrderViolations,
  checkTrickOutcomeViolations,
  hasAchievementConstraint,
  isSeatMuted,
  type Task,
} from './constraints.js';
import type { Card } from './deck.js';

function card(suit: Card['suit'], rank: number): Card {
  return { id: `${suit}${rank}`, suit, rank };
}

function task(overrides: Partial<Task> & Pick<Task, 'targetCardId' | 'ownerSeatID' | 'draftIndex'>): Task {
  return { taskCardId: `T${overrides.targetCardId}`, fulfilled: false, ...overrides };
}

describe('applyTaskFulfillment', () => {
  it('fulfills a task when its owner wins the trick containing the target card, even if not the winning card', () => {
    const tasks = [task({ targetCardId: 'pink1', ownerSeatID: '0', draftIndex: 0 })];
    const result = applyTaskFulfillment(tasks, {
      winnerSeatID: '0',
      plays: [
        { seatID: '0', card: card('pink', 9) },
        { seatID: '1', card: card('pink', 5) },
        { seatID: '2', card: card('pink', 1) }, // task target, but NOT the winning card
      ],
    });
    expect(result).toEqual({ violated: false, fulfilledDraftIndexes: [0] });
    expect(tasks[0]!.fulfilled).toBe(true);
  });

  it('is a violation when the target card ends up in a trick won by someone other than its owner', () => {
    const tasks = [task({ targetCardId: 'yellow2', ownerSeatID: '1', draftIndex: 0 })];
    const result = applyTaskFulfillment(tasks, {
      winnerSeatID: '0',
      plays: [
        { seatID: '0', card: card('yellow', 8) },
        { seatID: '1', card: card('yellow', 2) },
      ],
    });
    expect(result.violated).toBe(true);
    expect(tasks[0]!.fulfilled).toBe(false);
  });

  it('can fulfill multiple tasks in the same trick', () => {
    const tasks = [
      task({ targetCardId: 'blue3', ownerSeatID: '0', draftIndex: 0 }),
      task({ targetCardId: 'green7', ownerSeatID: '0', draftIndex: 1 }),
    ];
    const result = applyTaskFulfillment(tasks, {
      winnerSeatID: '0',
      plays: [
        { seatID: '0', card: card('rocket', 4) },
        { seatID: '1', card: card('blue', 3) },
        { seatID: '2', card: card('green', 7) },
      ],
    });
    expect(result).toEqual({ violated: false, fulfilledDraftIndexes: [0, 1] });
  });

  it('ignores cards that are not any unfulfilled task target', () => {
    const tasks = [task({ targetCardId: 'pink1', ownerSeatID: '0', draftIndex: 0 })];
    const result = applyTaskFulfillment(tasks, {
      winnerSeatID: '1',
      plays: [{ seatID: '1', card: card('blue', 4) }],
    });
    expect(result).toEqual({ violated: false, fulfilledDraftIndexes: [] });
  });
});

describe('checkTaskOrderViolations', () => {
  const positionConstraints = [
    { kind: 'taskOrder' as const, taskIndex: 0, order: { type: 'position' as const, position: 1 as const } },
    { kind: 'taskOrder' as const, taskIndex: 1, order: { type: 'position' as const, position: 2 as const } },
  ];

  it('no violation when tokened tasks resolve in the correct order', () => {
    expect(checkTaskOrderViolations(positionConstraints, [[0], [1]])).toBe(false);
  });

  it('violation when a later position resolves without the earlier one having happened', () => {
    expect(checkTaskOrderViolations(positionConstraints, [[1]])).toBe(true);
  });

  it('consecutive position tokens fulfilled in the same trick both count, regardless of order', () => {
    expect(checkTaskOrderViolations(positionConstraints, [[0, 1]])).toBe(false);
    expect(checkTaskOrderViolations(positionConstraints, [[1, 0]])).toBe(false);
  });

  it('"before" is satisfied by an earlier or same-trick fulfillment, violated by a later one', () => {
    const before = [{ kind: 'taskOrder' as const, taskIndex: 0, order: { type: 'before' as const, relativeToTaskIndex: 1 } }];
    expect(checkTaskOrderViolations(before, [[0], [1]])).toBe(false); // task0 first, fine
    expect(checkTaskOrderViolations(before, [[0, 1]])).toBe(false); // same trick, fine
    expect(checkTaskOrderViolations(before, [[1], [0]])).toBe(true); // task1 (the "after" side) happened first -- violates task0's "before"
  });

  it('"after" requires the referenced task already fulfilled by the same trick or earlier', () => {
    const after = [{ kind: 'taskOrder' as const, taskIndex: 1, order: { type: 'after' as const, relativeToTaskIndex: 0 } }];
    expect(checkTaskOrderViolations(after, [[0], [1]])).toBe(false);
    expect(checkTaskOrderViolations(after, [[0, 1]])).toBe(false);
    expect(checkTaskOrderViolations(after, [[1]])).toBe(true); // task1 resolved before task0 ever did
  });

  it('unfulfilled tokened tasks are simply not checked yet', () => {
    expect(checkTaskOrderViolations(positionConstraints, [])).toBe(false);
  });
});

describe('checkTrickOutcomeViolations', () => {
  it('cardNeverWinsTrick fires only for the exact suit+rank', () => {
    const constraints = [{ kind: 'cardNeverWinsTrick' as const, suit: 'pink' as const, rank: 9 }];
    expect(checkTrickOutcomeViolations(constraints, { winnerSeatID: '0', winningCard: card('pink', 9) }, ['0'])).toBe(true);
    expect(checkTrickOutcomeViolations(constraints, { winnerSeatID: '0', winningCard: card('blue', 9) }, ['0'])).toBe(false);
  });

  it('rankNeverWinsTrick fires for that rank regardless of suit', () => {
    const constraints = [{ kind: 'rankNeverWinsTrick' as const, rank: 9 }];
    expect(checkTrickOutcomeViolations(constraints, { winnerSeatID: '0', winningCard: card('green', 9) }, ['0'])).toBe(true);
    expect(checkTrickOutcomeViolations(constraints, { winnerSeatID: '0', winningCard: card('green', 8) }, ['0'])).toBe(false);
  });

  it('seatNeverWinsTrick resolves the seat index against activeSeatIDs', () => {
    const constraints = [{ kind: 'seatNeverWinsTrick' as const, seatIndex: 1 }];
    const seatIDByIndex = ['2', '0', '1']; // seating order != playerID order
    expect(checkTrickOutcomeViolations(constraints, { winnerSeatID: '0', winningCard: card('pink', 1) }, seatIDByIndex)).toBe(true);
    expect(checkTrickOutcomeViolations(constraints, { winnerSeatID: '1', winningCard: card('pink', 1) }, seatIDByIndex)).toBe(false);
  });
});

describe('checkLastOrderViolations', () => {
  const lastConstraint = [{ kind: 'taskOrder' as const, taskIndex: 0, order: { type: 'last' as const } }];

  it('is not a violation once the last-tokened task resolves after every other task, tokened or not', () => {
    const tasks = [
      task({ targetCardId: 'pink1', ownerSeatID: '0', draftIndex: 0, fulfilled: true }),
      task({ targetCardId: 'blue2', ownerSeatID: '0', draftIndex: 1, fulfilled: true }),
      task({ targetCardId: 'green3', ownerSeatID: '0', draftIndex: 2, fulfilled: true }),
    ];
    expect(checkLastOrderViolations(lastConstraint, tasks)).toBe(false);
  });

  it('is a violation when the last-tokened task resolves while an untokened task is still pending', () => {
    const tasks = [
      task({ targetCardId: 'pink1', ownerSeatID: '0', draftIndex: 0, fulfilled: true }),
      task({ targetCardId: 'blue2', ownerSeatID: '0', draftIndex: 1, fulfilled: true }),
      task({ targetCardId: 'green3', ownerSeatID: '0', draftIndex: 2, fulfilled: false }), // untokened, still pending
    ];
    expect(checkLastOrderViolations(lastConstraint, tasks)).toBe(true);
  });

  it('is not checked at all until the last-tokened task itself has actually been fulfilled', () => {
    const tasks = [
      task({ targetCardId: 'pink1', ownerSeatID: '0', draftIndex: 0, fulfilled: false }),
      task({ targetCardId: 'blue2', ownerSeatID: '0', draftIndex: 1, fulfilled: false }),
    ];
    expect(checkLastOrderViolations(lastConstraint, tasks)).toBe(false);
  });
});

describe('checkSickSeatViolation', () => {
  const constraints = [{ kind: 'commanderChoosesSick' as const }];

  it('is violated when the chosen sick seat wins a trick', () => {
    expect(checkSickSeatViolation(constraints, { winnerSeatID: '1' }, '1')).toBe(true);
  });

  it('is not violated when a different seat wins', () => {
    expect(checkSickSeatViolation(constraints, { winnerSeatID: '0' }, '1')).toBe(false);
  });

  it('is never violated before a sick seat has actually been chosen', () => {
    expect(checkSickSeatViolation(constraints, { winnerSeatID: '0' }, null)).toBe(false);
  });
});

describe('checkAchievementSatisfied', () => {
  const constraints = [{ kind: 'winTrickWithEachRank' as const, rank: 1 }];

  it('is satisfied only once every color suit\'s card of that rank has won a trick', () => {
    expect(checkAchievementSatisfied(constraints, ['pink1', 'blue1', 'green1'])).toBe(false);
    expect(checkAchievementSatisfied(constraints, ['pink1', 'blue1', 'green1', 'yellow1'])).toBe(true);
  });

  it('ignores the rocket of that rank -- only the 4 color suits count', () => {
    expect(checkAchievementSatisfied(constraints, ['rocket1', 'pink1', 'blue1', 'green1'])).toBe(false);
  });

  it('returns false when there is no achievement constraint to satisfy', () => {
    expect(checkAchievementSatisfied([], ['pink1', 'blue1', 'green1', 'yellow1'])).toBe(false);
  });

  it('the rocket-achievement variant is satisfied only once all 4 rocket ranks have each won a trick', () => {
    const rocketConstraints = [{ kind: 'winTrickWithEachRocket' as const }];
    expect(checkAchievementSatisfied(rocketConstraints, ['rocket1', 'rocket2', 'rocket3'])).toBe(false);
    expect(checkAchievementSatisfied(rocketConstraints, ['rocket1', 'rocket2', 'rocket3', 'rocket4'])).toBe(true);
  });
});

describe('hasAchievementConstraint', () => {
  it('is true for either achievement kind, false otherwise', () => {
    expect(hasAchievementConstraint([{ kind: 'winTrickWithEachRank', rank: 1 }])).toBe(true);
    expect(hasAchievementConstraint([{ kind: 'winTrickWithEachRocket' }])).toBe(true);
    expect(hasAchievementConstraint([{ kind: 'commanderChoosesSick' }])).toBe(false);
    expect(hasAchievementConstraint([])).toBe(false);
  });
});

describe('isSeatMuted', () => {
  const constraints = [{ kind: 'commanderChoosesMuted' as const }];

  it('is true only for the chosen muted seat', () => {
    expect(isSeatMuted(constraints, '1', '1')).toBe(true);
    expect(isSeatMuted(constraints, '1', '0')).toBe(false);
  });

  it('is never true before a muted seat has actually been chosen', () => {
    expect(isSeatMuted(constraints, null, '1')).toBe(false);
  });

  it('is false on a mission with no commanderChoosesMuted constraint, even with a stray mutedSeatID', () => {
    expect(isSeatMuted([], '1', '1')).toBe(false);
  });
});
