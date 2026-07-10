import type { Game } from 'boardgame.io';
import { INVALID_MOVE } from '../../vendor.js';

export interface TicTacToeG {
  /** Length-9 board, index 0-8 left-to-right, top-to-bottom. */
  cells: (string | null)[];
}

const LINES: readonly [number, number, number][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function checkWinner(cells: TicTacToeG['cells']): string | null {
  for (const [a, b, c] of LINES) {
    const mark = cells[a] ?? null;
    if (mark !== null && mark === cells[b] && mark === cells[c]) {
      return mark;
    }
  }
  return null;
}

export const tictactoeGameDef: Game<TicTacToeG> = {
  setup: () => ({ cells: Array<string | null>(9).fill(null) }),

  moves: {
    play: ({ G, playerID }, cellIndex: number) => {
      if (G.cells[cellIndex] !== null) {
        return INVALID_MOVE;
      }
      G.cells[cellIndex] = playerID;
    },
  },

  turn: {
    minMoves: 1,
    maxMoves: 1,
  },

  endIf: ({ G }) => {
    const winner = checkWinner(G.cells);
    if (winner) return { winner };
    if (G.cells.every((c) => c !== null)) return { draw: true };
    return undefined;
  },
};
