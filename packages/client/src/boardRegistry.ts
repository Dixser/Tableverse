import type { ComponentType } from 'react';
import { TicTacToeBoard } from '@tableverse/game-core/src/boards.js';
import type { BoardProps } from '@tableverse/game-core';

/**
 * Maps a GameModule's id to its BoardComponent. Kept out of GameModule
 * itself (see game-core/src/types.ts's doc comment) so packages/server
 * never has to import a game's BoardComponent/CSS at real runtime --
 * only this client-only registry does.
 */
export const boardComponents: Record<string, ComponentType<BoardProps<any>>> = {
  'tictactoe-v1': TicTacToeBoard,
};
