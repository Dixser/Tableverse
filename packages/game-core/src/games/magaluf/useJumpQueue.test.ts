import { describe, expect, it } from 'vitest';

import type { JumpRecord } from './state.js';
import {
  advanceJumpQueue,
  currentJump,
  initialJumpQueue,
  skipAllJumps,
} from './useJumpQueue.js';

function jump(seatID: string, d = 2, survived = true): JumpRecord {
  return { day: 0, seatID, d, limit: 20, survived, legendVP: survived ? 3 + d : 0, lostVP: 10 };
}

describe('jump queue', () => {
  it('starts past everything that already existed, so a late arrival sees nothing (AC12)', () => {
    const history = [jump('0'), jump('1'), jump('2')];
    const queue = initialJumpQueue(history);

    expect(queue.watermark).toBe(3);
    expect(currentJump(queue, history)).toBeNull();
  });

  it('starts empty-handed on a fresh match', () => {
    expect(currentJump(initialJumpQueue([]), [])).toBeNull();
  });

  it('surfaces a jump appended after the viewer arrived (AC13)', () => {
    const jumps: JumpRecord[] = [];
    const queue = initialJumpQueue(jumps);

    jumps.push(jump('1'));
    expect(currentJump(queue, jumps)?.seatID).toBe('1');
  });

  it('yields several jumps from one update in order (AC13, AC16)', () => {
    const jumps: JumpRecord[] = [];
    let queue = initialJumpQueue(jumps);

    jumps.push(jump('0'), jump('1'), jump('2'));

    expect(currentJump(queue, jumps)?.seatID).toBe('0');
    queue = advanceJumpQueue(queue, jumps);
    expect(currentJump(queue, jumps)?.seatID).toBe('1');
    queue = advanceJumpQueue(queue, jumps);
    expect(currentJump(queue, jumps)?.seatID).toBe('2');
    queue = advanceJumpQueue(queue, jumps);
    expect(currentJump(queue, jumps)).toBeNull();
  });

  it('does not run off the end when advanced past the last jump', () => {
    const jumps = [jump('0')];
    let queue = initialJumpQueue([]);
    queue = advanceJumpQueue(queue, jumps);
    queue = advanceJumpQueue(queue, jumps);
    queue = advanceJumpQueue(queue, jumps);

    expect(queue.watermark).toBe(jumps.length);
    expect(currentJump(queue, jumps)).toBeNull();
  });

  it('skipping clears the remainder and never re-shows it (AC13)', () => {
    const jumps: JumpRecord[] = [];
    let queue = initialJumpQueue(jumps);
    jumps.push(jump('0'), jump('1'), jump('2'));

    queue = skipAllJumps(jumps);
    expect(currentJump(queue, jumps)).toBeNull();

    // A later day appends another; skipping earlier must not have swallowed it.
    jumps.push(jump('3'));
    expect(currentJump(queue, jumps)?.seatID).toBe('3');
  });

  it('never moves backwards, so a dismissed jump cannot reappear', () => {
    const jumps = [jump('0'), jump('1')];
    let queue = initialJumpQueue([]);
    queue = advanceJumpQueue(queue, jumps);
    const afterFirst = queue.watermark;

    // A shorter list than the watermark should not rewind it into old records.
    queue = advanceJumpQueue(queue, jumps.slice(0, 1));
    expect(queue.watermark).toBeGreaterThanOrEqual(afterFirst);
    expect(currentJump(queue, jumps.slice(0, 1))).toBeNull();
  });
});
