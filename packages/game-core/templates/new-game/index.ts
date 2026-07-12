import type { GameModule } from '../../types.js';
import { __SLUG__GameDef, type __PASCAL_NAME__G } from './gameDef.js';

// No BoardComponent import here -- this file is on the real-runtime import
// path for packages/server (via gamesCatalog.ts), and BoardComponent.tsx
// imports a real .css file Node cannot resolve. The board component is
// registered separately, in ../../boards.ts (client-only entry point).
export const __SLUG__Module: GameModule<__PASCAL_NAME__G> = {
  id: '__ID__',
  displayName: '__DISPLAY_NAME__',
  minPlayers: 2, // TODO: set real min/max players.
  maxPlayers: 2,
  gameDef: __SLUG__GameDef,
  // TODO: add settingsSchema if this game needs configurable room settings.
};

export type { __PASCAL_NAME__G } from './gameDef.js';
