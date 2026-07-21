import { describe, expect, it } from 'vitest';
import { LEVELS, getLevel } from './levels.js';

describe('LEVELS data integrity', () => {
  it('every transcribed mission resolves via getLevel and has a non-negative task count', () => {
    for (const def of LEVELS) {
      expect(getLevel(def.level)).toBe(def);
      expect(def.taskCount).toBeGreaterThanOrEqual(0);
    }
  });

  it('every taskOrder constraint references a taskIndex within that mission\'s own task count', () => {
    for (const def of LEVELS) {
      for (const c of def.constraints) {
        if (c.kind !== 'taskOrder') continue;
        expect(c.taskIndex).toBeGreaterThanOrEqual(0);
        expect(c.taskIndex).toBeLessThan(def.taskCount);
        if (c.order.type === 'before' || c.order.type === 'after') {
          expect(c.order.relativeToTaskIndex).toBeGreaterThanOrEqual(0);
          expect(c.order.relativeToTaskIndex).toBeLessThan(def.taskCount);
          expect(c.order.relativeToTaskIndex).not.toBe(c.taskIndex); // never self-referential
        }
      }
    }
  });

  it('a mission\'s position tokens are never duplicated (no two tasks both claiming e.g. "1st")', () => {
    for (const def of LEVELS) {
      const positions: number[] = [];
      for (const c of def.constraints) {
        if (c.kind === 'taskOrder' && c.order.type === 'position') {
          positions.push(c.order.position);
        }
      }
      expect(new Set(positions).size).toBe(positions.length);
    }
  });

  it('getLevel throws for a mission number with no data yet', () => {
    expect(() => getLevel(24)).toThrow();
    expect(() => getLevel(50)).toThrow();
  });
});
