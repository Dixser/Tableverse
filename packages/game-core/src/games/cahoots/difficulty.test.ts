import { describe, expect, it } from 'vitest';
import { targetGoalCount } from './difficulty.js';

describe('targetGoalCount', () => {
  it('matches the rulebook table at 2-3 players', () => {
    expect(targetGoalCount('beginner', 2)).toBe(15);
    expect(targetGoalCount('beginner', 3)).toBe(15);
    expect(targetGoalCount('normal', 3)).toBe(18);
    expect(targetGoalCount('expert', 2)).toBe(21);
    expect(targetGoalCount('insane', 3)).toBe(24);
  });

  it('matches the rulebook table at 4 players', () => {
    expect(targetGoalCount('beginner', 4)).toBe(12);
    expect(targetGoalCount('normal', 4)).toBe(15);
    expect(targetGoalCount('expert', 4)).toBe(18);
    expect(targetGoalCount('insane', 4)).toBe(21);
  });
});
