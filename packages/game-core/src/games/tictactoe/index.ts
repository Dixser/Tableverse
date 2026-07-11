import type { GameModule } from '../../types.js';
import { tictactoeGameDef, type TicTacToeG } from './gameDef.js';

// No BoardComponent import here -- this file is on the real-runtime import
// path for packages/server (via gamesCatalog.ts), and BoardComponent.tsx
// imports a real .css file Node cannot resolve. The board component is
// registered separately, in ../../boards.ts (client-only entry point).
export const tictactoeModule: GameModule<TicTacToeG> = {
  id: 'tictactoe-v1',
  displayName: 'Tic-Tac-Toe',
  minPlayers: 2,
  maxPlayers: 2,
  gameDef: tictactoeGameDef,
  // No settingsSchema -- intentionally minimal, per spec.md.
};

export type { TicTacToeG } from './gameDef.js';
