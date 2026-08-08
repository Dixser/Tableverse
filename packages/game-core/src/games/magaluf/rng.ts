/**
 * Randomness, narrowed to the four operations the rules actually need.
 *
 * The prototype in `prototypes/magaluf/` ran on a seeded generator behind
 * this exact interface precisely so the port would be a one-file swap. Here
 * the implementation is boardgame.io's `random` plugin, which is mandatory:
 * the server reconstructs match state by replaying the move log, so any
 * `Math.random()` anywhere in the rules would desynchronise a resumed match.
 */

/**
 * Two operations, both of which a real table can perform: shuffle a deck, and
 * roll a die. That is the whole surface on purpose — every rule has to be
 * playable with cardboard and a d6, so there is deliberately no way to ask
 * this for "true with probability 0.46".
 */
export interface Rng {
  /** Returns a new shuffled array; does not mutate the input. */
  shuffle<T>(items: readonly T[]): T[];
  /** Rolls one die with `faces` sides, returning 1..faces inclusive. */
  die(faces: number): number;
}

/** The slice of boardgame.io's RandomAPI this module uses. */
export interface BoardgameRandom {
  Die(spotvalue: number): number;
  Shuffle<T>(deck: T[]): T[];
}

export function fromBoardgameRandom(random: BoardgameRandom): Rng {
  return {
    shuffle: (items) => random.Shuffle([...items]),
    die: (faces) => random.Die(faces),
  };
}
