import type { Game } from 'boardgame.io';

export interface __PASCAL_NAME__G {
  // TODO: replace with real state.
  placeholder: boolean;
}

export const __SLUG__GameDef: Game<__PASCAL_NAME__G> = {
  setup: () => ({ placeholder: true }),

  moves: {
    // TODO: replace with real moves.
    noop: ({ G }) => {
      G.placeholder = !G.placeholder;
    },
  },

  turn: {
    minMoves: 1,
    maxMoves: 1,
  },

  // TODO: add endIf once there's a real win condition.
  // TODO: add playerView once there's hidden information (see
  // tech-stack.md's "Hidden information rule" and the conformance
  // suite's secretKeys option).
};
