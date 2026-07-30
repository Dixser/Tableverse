export type Difficulty = 'beginner' | 'normal' | 'expert' | 'insane';

export const DIFFICULTIES: Difficulty[] = ['beginner', 'normal', 'expert', 'insane'];

/** Rulebook's own table -- fewer goals required to win at 4 players than at 2-3. */
const GOAL_TARGETS: Record<Difficulty, { twoOrThree: number; four: number }> = {
  beginner: { twoOrThree: 15, four: 12 },
  normal: { twoOrThree: 18, four: 15 },
  expert: { twoOrThree: 21, four: 18 },
  insane: { twoOrThree: 24, four: 21 },
};

/** The total number of goal cards this match must complete to win. */
export function targetGoalCount(difficulty: Difficulty, activeSeatCount: number): number {
  const row = GOAL_TARGETS[difficulty];
  return activeSeatCount >= 4 ? row.four : row.twoOrThree;
}
