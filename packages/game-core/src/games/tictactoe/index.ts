import type { GameModule } from '../../types.js';
import { tictactoeGameDef, type TicTacToeG } from './gameDef.js';
import { TicTacToeBoard } from './BoardComponent.js';

export const tictactoeModule: GameModule<TicTacToeG> = {
  id: 'tictactoe-v1',
  displayName: 'Tic-Tac-Toe',
  minPlayers: 2,
  maxPlayers: 2,
  gameDef: tictactoeGameDef,
  BoardComponent: TicTacToeBoard,
  // No settingsSchema -- intentionally minimal, per spec.md.
};

export type { TicTacToeG } from './gameDef.js';
