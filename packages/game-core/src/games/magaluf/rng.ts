/**
 * Randomness, narrowed to the four operations the rules actually need.
 *
 * The prototype in `prototypes/magaluf/` ran on a seeded generator behind
 * this exact interface precisely so the port would be a one-file swap. Here
 * the implementation is boardgame.io's `random` plugin, which is mandatory:
 * the server reconstructs match state by replaying the move log, so any
 * `Math.random()` anywhere in the rules would desynchronise a resumed match.
 */

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** Returns a new shuffled array; does not mutate the input. */
  shuffle<T>(items: readonly T[]): T[];
  /** True with probability `p`. */
  chance(p: number): boolean;
}

/** The slice of boardgame.io's RandomAPI this module uses. */
export interface BoardgameRandom {
  Number(): number;
  Shuffle<T>(deck: T[]): T[];
}

export function fromBoardgameRandom(random: BoardgameRandom): Rng {
  return {
    next: () => random.Number(),
    int: (maxExclusive) => Math.floor(random.Number() * maxExclusive),
    shuffle: (items) => random.Shuffle([...items]),
    chance: (p) => random.Number() < p,
  };
}
