import type { Card, Color } from './deck.js';
import { COLORS } from './deck.js';

export type GoalKind =
  | 'noRepeatedValues'
  | 'noRepeatedColors'
  | 'noRepeatedValuesAndColors'
  | 'aboveFour'
  | 'belowFour'
  | 'allOdd'
  | 'allEven'
  | 'splitParity'
  | 'straightOfFourAnyOrder'
  | 'straightOfThreeInOrder'
  | 'sumAll'
  | 'sumColor'
  | 'exactlyThreeColor'
  | 'twoAdjacentColor'
  | 'twoNotAdjacentColor'
  | 'twoAlternatedColor'
  | 'colorPairOnly'
  | 'colorSumEquals'
  | 'colorSumDoubles';

interface GoalBase {
  id: string;
}

export type GoalDefinition =
  | (GoalBase & { kind: 'noRepeatedValues' })
  | (GoalBase & { kind: 'noRepeatedColors' })
  | (GoalBase & { kind: 'noRepeatedValuesAndColors' })
  | (GoalBase & { kind: 'aboveFour' })
  | (GoalBase & { kind: 'belowFour' })
  | (GoalBase & { kind: 'allOdd' })
  | (GoalBase & { kind: 'allEven' })
  | (GoalBase & { kind: 'splitParity' })
  | (GoalBase & { kind: 'straightOfFourAnyOrder' })
  | (GoalBase & { kind: 'straightOfThreeInOrder' })
  | (GoalBase & { kind: 'sumAll'; target: number })
  | (GoalBase & { kind: 'sumColor'; color: Color; target: number })
  | (GoalBase & { kind: 'exactlyThreeColor'; color: Color })
  | (GoalBase & { kind: 'twoAdjacentColor'; color: Color })
  | (GoalBase & { kind: 'twoNotAdjacentColor'; color: Color })
  | (GoalBase & { kind: 'twoAlternatedColor'; color: Color })
  | (GoalBase & { kind: 'colorPairOnly'; colors: [Color, Color] })
  | (GoalBase & { kind: 'colorSumEquals'; colorA: Color; colorB: Color })
  | (GoalBase & { kind: 'colorSumDoubles'; doubleColor: Color; halfColor: Color });

// --- Goal catalog ----------------------------------------------------------

const SUM_ALL_TARGETS = [10, 15, 18, 20];

const SUM_COLOR_TARGETS: Record<Color, number[]> = {
  blue: [3, 9],
  red: [4, 10],
  green: [6, 7],
  yellow: [2, 11],
};

function colorPairs(): [Color, Color][] {
  const pairs: [Color, Color][] = [];
  for (let i = 0; i < COLORS.length; i++) {
    for (let j = i + 1; j < COLORS.length; j++) {
      pairs.push([COLORS[i]!, COLORS[j]!]);
    }
  }
  return pairs;
}

const SINGLETON_KINDS: Extract<
  GoalKind,
  | 'noRepeatedValues'
  | 'noRepeatedColors'
  | 'noRepeatedValuesAndColors'
  | 'aboveFour'
  | 'belowFour'
  | 'allOdd'
  | 'allEven'
  | 'splitParity'
  | 'straightOfFourAnyOrder'
  | 'straightOfThreeInOrder'
>[] = [
  'noRepeatedValues',
  'noRepeatedColors',
  'noRepeatedValuesAndColors',
  'aboveFour',
  'belowFour',
  'allOdd',
  'allEven',
  'splitParity',
  'straightOfFourAnyOrder',
  'straightOfThreeInOrder',
];

/**
 * The full 62-entry goal-card pool, built from goals.md (not the physical
 * rulebook's own 50-card deck -- see spec/features/028-cahoots-rules/spec.md
 * "Description"). Each call returns fresh objects; callers shuffle/slice
 * their own copy.
 */
export function buildGoalCatalog(): GoalDefinition[] {
  const goals: GoalDefinition[] = [];

  for (const kind of SINGLETON_KINDS) {
    goals.push({ id: kind, kind });
  }
  for (const target of SUM_ALL_TARGETS) {
    goals.push({ id: `sumAll-${target}`, kind: 'sumAll', target });
  }
  for (const color of COLORS) {
    for (const target of SUM_COLOR_TARGETS[color]!) {
      goals.push({ id: `sumColor-${color}-${target}`, kind: 'sumColor', color, target });
    }
  }
  for (const color of COLORS) {
    goals.push({ id: `exactlyThreeColor-${color}`, kind: 'exactlyThreeColor', color });
  }
  for (const color of COLORS) {
    goals.push({ id: `twoAdjacentColor-${color}`, kind: 'twoAdjacentColor', color });
  }
  for (const color of COLORS) {
    goals.push({ id: `twoNotAdjacentColor-${color}`, kind: 'twoNotAdjacentColor', color });
  }
  for (const color of COLORS) {
    goals.push({ id: `twoAlternatedColor-${color}`, kind: 'twoAlternatedColor', color });
  }
  for (const [a, b] of colorPairs()) {
    goals.push({ id: `colorPairOnly-${a}-${b}`, kind: 'colorPairOnly', colors: [a, b] });
  }
  for (const [colorA, colorB] of colorPairs()) {
    goals.push({ id: `colorSumEquals-${colorA}-${colorB}`, kind: 'colorSumEquals', colorA, colorB });
  }
  for (const doubleColor of COLORS) {
    for (const halfColor of COLORS) {
      if (doubleColor === halfColor) continue;
      goals.push({ id: `colorSumDoubles-${doubleColor}-${halfColor}`, kind: 'colorSumDoubles', doubleColor, halfColor });
    }
  }

  return goals;
}

// --- Goal checking -----------------------------------------------------

function allDistinct<T>(values: T[]): boolean {
  return new Set(values).size === values.length;
}

/** Positions (0-3) currently showing `color` among the 4 top cards. */
function colorPositions(tops: Card[], color: Color): number[] {
  return tops.map((c, i) => (c.color === color ? i : -1)).filter((i) => i !== -1);
}

/** True iff exactly 2 piles show `color`, at index-distance matching `predicate`. */
function twoColorAtDistance(tops: Card[], color: Color, predicate: (distance: number) => boolean): boolean {
  const positions = colorPositions(tops, color);
  if (positions.length !== 2) return false;
  return predicate(Math.abs(positions[1]! - positions[0]!));
}

/**
 * Checks one goal against the current 4 pile-top cards (left to right,
 * position 0-3). Per the rulebook's own "Notes": a goal must match exactly
 * as written -- "3 of a color" is false when 4 piles show that color, not
 * just true "at least 3" -- and any goal naming a specific color requires
 * at least one pile of that color actually present (guarded implicitly by
 * each branch below, not as a separate universal check).
 */
export function checkGoal(goal: GoalDefinition, tops: Card[]): boolean {
  switch (goal.kind) {
    case 'noRepeatedValues':
      return allDistinct(tops.map((c) => c.number));
    case 'noRepeatedColors':
      return allDistinct(tops.map((c) => c.color));
    case 'noRepeatedValuesAndColors':
      return allDistinct(tops.map((c) => c.number)) && allDistinct(tops.map((c) => c.color));
    case 'aboveFour':
      return tops.every((c) => c.number > 4);
    case 'belowFour':
      return tops.every((c) => c.number < 4);
    case 'allOdd':
      return tops.every((c) => c.number % 2 === 1);
    case 'allEven':
      return tops.every((c) => c.number % 2 === 0);
    case 'splitParity': {
      const parity = (n: number) => (n % 2 === 1 ? 'odd' : 'even');
      const [p0, p1, p2, p3] = tops.map((c) => parity(c.number));
      return p0 === p2 && p1 === p3 && p0 !== p1;
    }
    case 'straightOfFourAnyOrder': {
      const nums = tops.map((c) => c.number).sort((a, b) => a - b);
      return nums[1] === nums[0]! + 1 && nums[2] === nums[1]! + 1 && nums[3] === nums[2]! + 1;
    }
    case 'straightOfThreeInOrder': {
      for (let i = 0; i <= 1; i++) {
        if (tops[i + 1]!.number === tops[i]!.number + 1 && tops[i + 2]!.number === tops[i + 1]!.number + 1) {
          return true;
        }
      }
      return false;
    }
    case 'sumAll':
      return tops.reduce((sum, c) => sum + c.number, 0) === goal.target;
    case 'sumColor': {
      const matching = tops.filter((c) => c.color === goal.color);
      if (matching.length === 0) return false;
      return matching.reduce((sum, c) => sum + c.number, 0) === goal.target;
    }
    case 'exactlyThreeColor':
      return tops.filter((c) => c.color === goal.color).length === 3;
    case 'twoAdjacentColor':
      return twoColorAtDistance(tops, goal.color, (d) => d === 1);
    case 'twoNotAdjacentColor':
      return twoColorAtDistance(tops, goal.color, (d) => d >= 2);
    case 'twoAlternatedColor':
      return twoColorAtDistance(tops, goal.color, (d) => d === 2);
    case 'colorPairOnly':
      return tops.every((c) => goal.colors.includes(c.color));
    case 'colorSumEquals': {
      // Both colors must actually be present -- otherwise an absent color's
      // sum is vacuously 0, and two absent colors would make this trivially
      // true (0 === 0) without either ever showing up on the board.
      if (!tops.some((c) => c.color === goal.colorA) || !tops.some((c) => c.color === goal.colorB)) return false;
      const sum = (color: Color) => tops.filter((c) => c.color === color).reduce((total, c) => total + c.number, 0);
      return sum(goal.colorA) === sum(goal.colorB);
    }
    case 'colorSumDoubles': {
      // Same presence guard as colorSumEquals -- 0 === 2 * 0 would otherwise
      // trivially satisfy this with neither color ever on the board.
      if (!tops.some((c) => c.color === goal.doubleColor) || !tops.some((c) => c.color === goal.halfColor)) {
        return false;
      }
      const sum = (color: Color) => tops.filter((c) => c.color === color).reduce((total, c) => total + c.number, 0);
      return sum(goal.doubleColor) === 2 * sum(goal.halfColor);
    }
  }
}

/**
 * The i18n key + raw (untranslated) interpolation params for a goal's own
 * plain-language description -- e.g. `sumColor`'s `color` param is the raw
 * color key ('blue'), not a translated word, since game-core has no i18n
 * instance to translate with. The client (GoalBoard's own GoalCard, and
 * ChatPanel's goalCompleted log rendering) is what turns this into actual
 * text/styling, each doing its own color translation and `<color>`-tag
 * component wiring -- this function is only the single source of truth for
 * which translation key and params a given goal `kind` maps to, so both
 * call sites can never drift out of sync on that mapping.
 */
export function goalDescriptionParams(goal: GoalDefinition): { key: string; params: Record<string, string | number> } {
  switch (goal.kind) {
    case 'noRepeatedValues':
      return { key: 'cahoots.goal.noRepeatedValues', params: {} };
    case 'noRepeatedColors':
      return { key: 'cahoots.goal.noRepeatedColors', params: {} };
    case 'noRepeatedValuesAndColors':
      return { key: 'cahoots.goal.noRepeatedValuesAndColors', params: {} };
    case 'aboveFour':
      return { key: 'cahoots.goal.aboveFour', params: {} };
    case 'belowFour':
      return { key: 'cahoots.goal.belowFour', params: {} };
    case 'allOdd':
      return { key: 'cahoots.goal.allOdd', params: {} };
    case 'allEven':
      return { key: 'cahoots.goal.allEven', params: {} };
    case 'splitParity':
      return { key: 'cahoots.goal.splitParity', params: {} };
    case 'straightOfFourAnyOrder':
      return { key: 'cahoots.goal.straightOfFourAnyOrder', params: {} };
    case 'straightOfThreeInOrder':
      return { key: 'cahoots.goal.straightOfThreeInOrder', params: {} };
    case 'sumAll':
      return { key: 'cahoots.goal.sumAll', params: { sumTarget: goal.target } };
    case 'sumColor':
      return { key: 'cahoots.goal.sumColor', params: { color: goal.color, sumTarget: goal.target } };
    case 'exactlyThreeColor':
      return { key: 'cahoots.goal.exactlyThreeColor', params: { color: goal.color } };
    case 'twoAdjacentColor':
      return { key: 'cahoots.goal.twoAdjacentColor', params: { color: goal.color } };
    case 'twoNotAdjacentColor':
      return { key: 'cahoots.goal.twoNotAdjacentColor', params: { color: goal.color } };
    case 'twoAlternatedColor':
      return { key: 'cahoots.goal.twoAlternatedColor', params: { color: goal.color } };
    case 'colorPairOnly':
      return { key: 'cahoots.goal.colorPairOnly', params: { colorA: goal.colors[0], colorB: goal.colors[1] } };
    case 'colorSumEquals':
      return { key: 'cahoots.goal.colorSumEquals', params: { colorA: goal.colorA, colorB: goal.colorB } };
    case 'colorSumDoubles':
      // Reuses the generic colorA/colorB param names (same as colorPairOnly
      // above) rather than doubleColor/halfColor -- the translation string
      // itself encodes which slot is "doubled" through word order, so no
      // new param-name convention needs to be taught to ChatPanel's
      // color-value-param handling.
      return {
        key: 'cahoots.goal.colorSumDoubles',
        params: { colorA: goal.doubleColor, colorB: goal.halfColor },
      };
  }
}

// --- Resolution ----------------------------------------------------------

export interface GoalResolutionState {
  piles: Card[][];
  activeGoals: GoalDefinition[];
  goalDeck: GoalDefinition[];
  completedGoals: GoalDefinition[];
}

/**
 * Moves every currently-satisfied active goal into `completedGoals` and
 * refills `activeGoals` back up to 4 from `goalDeck` (fewer if the deck has
 * run dry), looping until a full pass makes no further change -- a single
 * card play can satisfy more than one goal at once, and a freshly-revealed
 * replacement goal may itself already be satisfied by the current piles
 * (both explicit rulebook cases). Mutates the arrays on `state` in place
 * (splice/push), so callers pass their own G's arrays directly rather than
 * receiving a return value to reassign.
 */
export function resolveGoals(state: GoalResolutionState): void {
  let changed = true;
  while (changed) {
    changed = false;
    const tops = state.piles.map((pile) => pile[pile.length - 1]!);
    const stillActive: GoalDefinition[] = [];
    for (const goal of state.activeGoals) {
      if (checkGoal(goal, tops)) {
        state.completedGoals.push(goal);
        changed = true;
      } else {
        stillActive.push(goal);
      }
    }
    state.activeGoals.splice(0, state.activeGoals.length, ...stillActive);
    while (state.activeGoals.length < 4 && state.goalDeck.length > 0) {
      state.activeGoals.push(state.goalDeck.shift()!);
      changed = true;
    }
  }
}
