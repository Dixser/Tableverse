import { describe, expect, it } from 'vitest';
import type { Card, Color } from './deck.js';
import { buildGoalCatalog, checkGoal, goalDescriptionParams, resolveGoals, type GoalDefinition } from './goals.js';

function card(color: Color, number: number): Card {
  return { id: `${color}${number}`, color, number };
}

describe('buildGoalCatalog', () => {
  it('produces exactly 62 goal cards, all with unique ids', () => {
    const catalog = buildGoalCatalog();
    expect(catalog).toHaveLength(62);
    expect(new Set(catalog.map((g) => g.id)).size).toBe(62);
  });

  it('includes representative entries from every goal family', () => {
    const ids = buildGoalCatalog().map((g) => g.id);
    expect(ids).toContain('noRepeatedValues');
    expect(ids).toContain('sumAll-10');
    expect(ids).toContain('sumColor-blue-3');
    expect(ids).toContain('exactlyThreeColor-red');
    expect(ids).toContain('twoAdjacentColor-green');
    expect(ids).toContain('colorPairOnly-blue-yellow');
    expect(ids).toContain('colorSumEquals-blue-red');
    expect(ids).toContain('colorSumDoubles-red-blue');
  });

  it('colorSumDoubles covers all 12 ordered pairs (every color as the doubled side against each other color)', () => {
    const ids = buildGoalCatalog()
      .filter((g) => g.kind === 'colorSumDoubles')
      .map((g) => g.id);
    expect(ids).toHaveLength(12);
    expect(new Set(ids).size).toBe(12);
  });

  it('colorSumEquals covers all 6 unordered pairs (symmetric -- only one entry per pair)', () => {
    const goals = buildGoalCatalog().filter((g) => g.kind === 'colorSumEquals');
    expect(goals).toHaveLength(6);
  });
});

describe('checkGoal', () => {
  it('noRepeatedValues', () => {
    const goal: GoalDefinition = { id: 'g', kind: 'noRepeatedValues' };
    expect(checkGoal(goal, [card('blue', 1), card('red', 2), card('green', 3), card('yellow', 4)])).toBe(true);
    expect(checkGoal(goal, [card('blue', 1), card('red', 1), card('green', 3), card('yellow', 4)])).toBe(false);
  });

  it('noRepeatedColors', () => {
    const goal: GoalDefinition = { id: 'g', kind: 'noRepeatedColors' };
    expect(checkGoal(goal, [card('blue', 1), card('red', 1), card('green', 1), card('yellow', 1)])).toBe(true);
    expect(checkGoal(goal, [card('blue', 1), card('blue', 2), card('green', 1), card('yellow', 1)])).toBe(false);
  });

  it('noRepeatedValuesAndColors requires both at once', () => {
    const goal: GoalDefinition = { id: 'g', kind: 'noRepeatedValuesAndColors' };
    expect(checkGoal(goal, [card('blue', 1), card('red', 2), card('green', 3), card('yellow', 4)])).toBe(true);
    // Values distinct, but colors repeat.
    expect(checkGoal(goal, [card('blue', 1), card('blue', 2), card('green', 3), card('yellow', 4)])).toBe(false);
  });

  it('aboveFour', () => {
    const goal: GoalDefinition = { id: 'g', kind: 'aboveFour' };
    expect(checkGoal(goal, [card('blue', 5), card('red', 6), card('green', 7), card('yellow', 5)])).toBe(true);
    expect(checkGoal(goal, [card('blue', 5), card('red', 4), card('green', 7), card('yellow', 5)])).toBe(false);
  });

  it('belowFour', () => {
    const goal: GoalDefinition = { id: 'g', kind: 'belowFour' };
    expect(checkGoal(goal, [card('blue', 1), card('red', 2), card('green', 3), card('yellow', 1)])).toBe(true);
    expect(checkGoal(goal, [card('blue', 1), card('red', 4), card('green', 3), card('yellow', 1)])).toBe(false);
  });

  it('allOdd', () => {
    const goal: GoalDefinition = { id: 'g', kind: 'allOdd' };
    expect(checkGoal(goal, [card('blue', 1), card('red', 3), card('green', 5), card('yellow', 7)])).toBe(true);
    expect(checkGoal(goal, [card('blue', 1), card('red', 2), card('green', 5), card('yellow', 7)])).toBe(false);
  });

  it('allEven', () => {
    const goal: GoalDefinition = { id: 'g', kind: 'allEven' };
    expect(checkGoal(goal, [card('blue', 2), card('red', 4), card('green', 6), card('yellow', 2)])).toBe(true);
    expect(checkGoal(goal, [card('blue', 2), card('red', 3), card('green', 6), card('yellow', 2)])).toBe(false);
  });

  it('splitParity: positions 0&2 share a parity, 1&3 share the other', () => {
    const goal: GoalDefinition = { id: 'g', kind: 'splitParity' };
    // goals.md's own example: 3, 6, 5, 2.
    expect(checkGoal(goal, [card('blue', 3), card('red', 6), card('green', 5), card('yellow', 2)])).toBe(true);
    expect(checkGoal(goal, [card('blue', 3), card('red', 6), card('green', 4), card('yellow', 2)])).toBe(false);
  });

  it('straightOfFourAnyOrder: consecutive values regardless of position', () => {
    const goal: GoalDefinition = { id: 'g', kind: 'straightOfFourAnyOrder' };
    expect(checkGoal(goal, [card('blue', 5), card('red', 3), card('green', 4), card('yellow', 6)])).toBe(true);
    expect(checkGoal(goal, [card('blue', 5), card('red', 3), card('green', 4), card('yellow', 7)])).toBe(false);
  });

  it('straightOfThreeInOrder: 3 consecutive positions strictly increasing left to right', () => {
    const goal: GoalDefinition = { id: 'g', kind: 'straightOfThreeInOrder' };
    expect(checkGoal(goal, [card('blue', 7), card('red', 3), card('green', 4), card('yellow', 5)])).toBe(true);
    // Same values, decreasing order -- position-sensitive, so this fails.
    expect(checkGoal(goal, [card('blue', 5), card('red', 4), card('green', 3), card('yellow', 7)])).toBe(false);
    expect(checkGoal(goal, [card('blue', 1), card('red', 3), card('green', 5), card('yellow', 7)])).toBe(false);
  });

  it('sumAll', () => {
    const goal: GoalDefinition = { id: 'g', kind: 'sumAll', target: 10 };
    expect(checkGoal(goal, [card('blue', 1), card('red', 2), card('green', 3), card('yellow', 4)])).toBe(true);
    expect(checkGoal(goal, [card('blue', 1), card('red', 2), card('green', 3), card('yellow', 5)])).toBe(false);
  });

  it('sumColor: only counts the named color, and requires at least one present', () => {
    const goal: GoalDefinition = { id: 'g', kind: 'sumColor', color: 'blue', target: 3 };
    expect(checkGoal(goal, [card('blue', 3), card('red', 1), card('green', 2), card('yellow', 4)])).toBe(true);
    expect(checkGoal(goal, [card('blue', 1), card('blue', 4), card('green', 2), card('yellow', 4)])).toBe(false);
    expect(checkGoal(goal, [card('red', 1), card('red', 2), card('green', 2), card('yellow', 4)])).toBe(false);
  });

  it('exactlyThreeColor: exactly 3, not 4', () => {
    const goal: GoalDefinition = { id: 'g', kind: 'exactlyThreeColor', color: 'blue' };
    expect(checkGoal(goal, [card('blue', 1), card('blue', 2), card('blue', 3), card('red', 4)])).toBe(true);
    expect(checkGoal(goal, [card('blue', 1), card('blue', 2), card('blue', 3), card('blue', 4)])).toBe(false);
    expect(checkGoal(goal, [card('blue', 1), card('blue', 2), card('red', 3), card('red', 4)])).toBe(false);
  });

  it('twoAdjacentColor: exactly 2, index distance 1', () => {
    const goal: GoalDefinition = { id: 'g', kind: 'twoAdjacentColor', color: 'red' };
    expect(checkGoal(goal, [card('red', 1), card('red', 2), card('blue', 3), card('green', 4)])).toBe(true);
    expect(checkGoal(goal, [card('red', 1), card('blue', 2), card('red', 3), card('green', 4)])).toBe(false);
    expect(checkGoal(goal, [card('red', 1), card('red', 2), card('red', 3), card('green', 4)])).toBe(false);
  });

  it('twoNotAdjacentColor: exactly 2, index distance >= 2', () => {
    const goal: GoalDefinition = { id: 'g', kind: 'twoNotAdjacentColor', color: 'green' };
    expect(checkGoal(goal, [card('green', 1), card('blue', 2), card('green', 3), card('yellow', 4)])).toBe(true);
    expect(checkGoal(goal, [card('green', 1), card('blue', 2), card('yellow', 3), card('green', 4)])).toBe(true);
    expect(checkGoal(goal, [card('green', 1), card('green', 2), card('blue', 3), card('yellow', 4)])).toBe(false);
  });

  it('twoAlternatedColor: exactly 2, index distance exactly 2', () => {
    const goal: GoalDefinition = { id: 'g', kind: 'twoAlternatedColor', color: 'yellow' };
    expect(checkGoal(goal, [card('yellow', 1), card('blue', 2), card('yellow', 3), card('green', 4)])).toBe(true);
    expect(checkGoal(goal, [card('yellow', 1), card('yellow', 2), card('blue', 3), card('green', 4)])).toBe(false);
    expect(checkGoal(goal, [card('yellow', 1), card('blue', 2), card('green', 3), card('yellow', 4)])).toBe(false);
  });

  it('colorPairOnly: every card is one of the two named colors', () => {
    const goal: GoalDefinition = { id: 'g', kind: 'colorPairOnly', colors: ['blue', 'yellow'] };
    expect(checkGoal(goal, [card('blue', 1), card('yellow', 2), card('blue', 3), card('blue', 4)])).toBe(true);
    expect(checkGoal(goal, [card('blue', 1), card('yellow', 2), card('red', 3), card('blue', 4)])).toBe(false);
  });

  it('colorSumEquals: the two named colors\' total sums match, whatever that total is', () => {
    const goal: GoalDefinition = { id: 'g', kind: 'colorSumEquals', colorA: 'green', colorB: 'red' };
    expect(checkGoal(goal, [card('green', 3), card('red', 3), card('blue', 1), card('yellow', 2)])).toBe(true);
    expect(checkGoal(goal, [card('green', 3), card('red', 5), card('blue', 1), card('yellow', 2)])).toBe(false);
    // Sums add across every pile of that color, not just one -- two green piles (2+1=3) equal one red pile (3).
    expect(checkGoal(goal, [card('green', 2), card('green', 1), card('red', 3), card('yellow', 4)])).toBe(true);
  });

  it('colorSumEquals: requires at least one card of EACH named color -- 0 === 0 never counts', () => {
    const goal: GoalDefinition = { id: 'g', kind: 'colorSumEquals', colorA: 'green', colorB: 'red' };
    // No green anywhere: green sum is vacuously 0, red sum is 0 too (no red either) -- must still fail.
    expect(checkGoal(goal, [card('blue', 1), card('yellow', 2), card('blue', 3), card('yellow', 4)])).toBe(false);
    // Only one of the two colors present, even though its sum happens to be 0-equivalent to the other's absence.
    expect(checkGoal(goal, [card('blue', 1), card('yellow', 2), card('blue', 3), card('red', 4)])).toBe(false);
  });

  it('colorSumDoubles: the doubled color\'s total sum is exactly twice the halved color\'s total sum', () => {
    const goal: GoalDefinition = { id: 'g', kind: 'colorSumDoubles', doubleColor: 'red', halfColor: 'blue' };
    expect(checkGoal(goal, [card('blue', 2), card('red', 4), card('green', 1), card('yellow', 2)])).toBe(true);
    expect(checkGoal(goal, [card('blue', 2), card('red', 5), card('green', 1), card('yellow', 2)])).toBe(false);
  });

  it('colorSumDoubles: requires at least one card of EACH named color -- 0 === 2*0 never counts', () => {
    const goal: GoalDefinition = { id: 'g', kind: 'colorSumDoubles', doubleColor: 'red', halfColor: 'blue' };
    expect(checkGoal(goal, [card('green', 1), card('yellow', 2), card('green', 3), card('yellow', 4)])).toBe(false);
  });
});

describe('resolveGoals', () => {
  it('completes multiple goals in one pass, refills, and chains an already-satisfied refill', () => {
    const piles: Card[][] = [[card('blue', 1)], [card('blue', 3)], [card('blue', 5)], [card('red', 7)]];
    // Given these piles: exactly 3 blue -> G1 true. All odd -> G2 true.
    const g1: GoalDefinition = { id: 'g1', kind: 'exactlyThreeColor', color: 'blue' };
    const g2: GoalDefinition = { id: 'g2', kind: 'allOdd' };
    const g3: GoalDefinition = { id: 'g3', kind: 'exactlyThreeColor', color: 'green' }; // never true here
    const g4: GoalDefinition = { id: 'g4', kind: 'exactlyThreeColor', color: 'red' }; // never true here (only 1 red)
    // g5 stays false forever (colors aren't all distinct: 3 blue).
    const g5: GoalDefinition = { id: 'g5', kind: 'noRepeatedColors' };
    // g6 is satisfied the instant it's revealed by these same piles (sum = 1+3+5+7 = 16).
    const g6: GoalDefinition = { id: 'g6', kind: 'sumAll', target: 16 };

    const state = {
      piles,
      activeGoals: [g1, g2, g3, g4],
      goalDeck: [g5, g6],
      completedGoals: [] as GoalDefinition[],
    };

    resolveGoals(state);

    expect(state.completedGoals.map((g) => g.id).sort()).toEqual(['g1', 'g2', 'g6']);
    // g5 was drawn but never satisfied, and the goal deck ran dry -- fewer than 4 active goals is allowed.
    expect(state.activeGoals.map((g) => g.id).sort()).toEqual(['g3', 'g4', 'g5']);
    expect(state.goalDeck).toHaveLength(0);
  });

  it('does nothing when no active goal is satisfied and the goal deck is empty', () => {
    const piles: Card[][] = [[card('blue', 1)], [card('red', 2)], [card('green', 3)], [card('yellow', 4)]];
    const g1: GoalDefinition = { id: 'g1', kind: 'exactlyThreeColor', color: 'blue' };
    const state = {
      piles,
      activeGoals: [g1],
      goalDeck: [] as GoalDefinition[],
      completedGoals: [] as GoalDefinition[],
    };

    resolveGoals(state);

    expect(state.completedGoals).toHaveLength(0);
    expect(state.activeGoals.map((g) => g.id)).toEqual(['g1']);
  });
});

describe('goalDescriptionParams', () => {
  it('maps every goal kind to a "cahoots.goal.<kind>" key, with no translation performed (raw color keys, not translated words)', () => {
    for (const goal of buildGoalCatalog()) {
      const { key } = goalDescriptionParams(goal);
      expect(key).toBe(`cahoots.goal.${goal.kind}`);
    }
  });

  it('carries a no-param kind with an empty params object', () => {
    expect(goalDescriptionParams({ id: 'g', kind: 'allOdd' })).toEqual({ key: 'cahoots.goal.allOdd', params: {} });
  });

  it('carries a single-color kind\'s raw color key', () => {
    expect(goalDescriptionParams({ id: 'g', kind: 'exactlyThreeColor', color: 'blue' })).toEqual({
      key: 'cahoots.goal.exactlyThreeColor',
      params: { color: 'blue' },
    });
  });

  it('renames sumAll/sumColor\'s own `target` field to `sumTarget` (avoiding ChatPanel\'s reserved `target` param name)', () => {
    expect(goalDescriptionParams({ id: 'g', kind: 'sumAll', target: 20 })).toEqual({
      key: 'cahoots.goal.sumAll',
      params: { sumTarget: 20 },
    });
    expect(goalDescriptionParams({ id: 'g', kind: 'sumColor', color: 'red', target: 4 })).toEqual({
      key: 'cahoots.goal.sumColor',
      params: { color: 'red', sumTarget: 4 },
    });
  });

  it('carries both raw colors of a color-pair kind', () => {
    expect(goalDescriptionParams({ id: 'g', kind: 'colorPairOnly', colors: ['blue', 'yellow'] })).toEqual({
      key: 'cahoots.goal.colorPairOnly',
      params: { colorA: 'blue', colorB: 'yellow' },
    });
  });

  it('carries both raw colors of colorSumEquals', () => {
    expect(goalDescriptionParams({ id: 'g', kind: 'colorSumEquals', colorA: 'green', colorB: 'red' })).toEqual({
      key: 'cahoots.goal.colorSumEquals',
      params: { colorA: 'green', colorB: 'red' },
    });
  });

  it('maps colorSumDoubles\' doubleColor/halfColor onto the generic colorA/colorB param names', () => {
    expect(goalDescriptionParams({ id: 'g', kind: 'colorSumDoubles', doubleColor: 'red', halfColor: 'blue' })).toEqual(
      {
        key: 'cahoots.goal.colorSumDoubles',
        params: { colorA: 'red', colorB: 'blue' },
      },
    );
  });
});
