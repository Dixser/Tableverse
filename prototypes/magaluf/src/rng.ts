/**
 * Seeded randomness behind a single narrow interface.
 *
 * Everything in the engine draws through `Random` and nothing calls
 * `Math.random()`. That is not fussiness: when this ports into
 * `packages/game-core`, boardgame.io requires all randomness to go through its
 * own `random` plugin so the server can deterministically replay a move log.
 * Keeping the surface to these four methods means the port is a one-file swap
 * with no changes to game logic.
 */
export interface Random {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** Returns a new shuffled array; does not mutate the input. */
  shuffle<T>(items: readonly T[]): T[];
  /** True with probability `p`. */
  chance(p: number): boolean;
  /**
   * The current internal state, so it can be stored back into the game tree.
   * Keeping the generator's position in state (rather than in a closure the
   * state does not own) is what makes the reducer replayable from JSON alone.
   */
  snapshot(): number;
}

/** mulberry32 — small, fast, and good enough for balance simulation. */
export function createRandom(seed: number): Random {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int: (maxExclusive) => Math.floor(next() * maxExclusive),
    shuffle<T>(items: readonly T[]): T[] {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = out[i]!;
        out[i] = out[j]!;
        out[j] = tmp;
      }
      return out;
    },
    chance: (p) => next() < p,
    snapshot: () => state,
  };
}
