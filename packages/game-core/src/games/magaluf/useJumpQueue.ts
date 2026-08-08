import { useState } from 'react';
import type { JumpRecord } from './state.js';

/**
 * Decides which balconing jump — if any — the viewer is currently being shown.
 *
 * The engine resolves a jump inside the move that ends the day, so by the time
 * any client renders, the outcome is already sitting in `G.jumps`. This
 * controls only *when the viewer learns it*, which is the whole of feature
 * 033's balcony moment.
 *
 * The load-bearing rule is the starting watermark: it is the number of jumps
 * that already existed when this viewer first looked, **not zero**. Without
 * that, a player reconnecting on Sunday — or a spectator joining late — would
 * be walked through every jump of the weekend before reaching the board. What
 * happened before you arrived is history, and the chat log already has it.
 *
 * The maths lives in these pure functions rather than in the hook so both
 * directions of the watermark can be asserted without a DOM.
 */

export interface JumpQueue {
  /** Jumps already shown to (or skipped by) this viewer. */
  watermark: number;
}

export function initialJumpQueue(jumps: readonly JumpRecord[]): JumpQueue {
  return { watermark: jumps.length };
}

export function currentJump(
  queue: JumpQueue,
  jumps: readonly JumpRecord[],
): JumpRecord | null {
  return jumps[queue.watermark] ?? null;
}

export function advanceJumpQueue(
  queue: JumpQueue,
  jumps: readonly JumpRecord[],
): JumpQueue {
  // Never past the end, and never backwards: a watermark that could decrease
  // would re-show a jump the viewer has already dismissed.
  return { watermark: Math.min(queue.watermark + 1, jumps.length) };
}

export function skipAllJumps(jumps: readonly JumpRecord[]): JumpQueue {
  return { watermark: jumps.length };
}

export interface UseJumpQueue {
  current: JumpRecord | null;
  advance: () => void;
  skipAll: () => void;
}

export function useJumpQueue(jumps: readonly JumpRecord[]): UseJumpQueue {
  // The initialiser runs once, which is exactly the "what was already there
  // when I arrived" semantics this needs.
  const [queue, setQueue] = useState<JumpQueue>(() => initialJumpQueue(jumps));

  return {
    current: currentJump(queue, jumps),
    advance: () => setQueue((prev) => advanceJumpQueue(prev, jumps)),
    skipAll: () => setQueue(skipAllJumps(jumps)),
  };
}
