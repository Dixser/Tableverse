import type { GameModule } from '../../types.js';
import { themindGameDef, type TheMindG } from './gameDef.js';

// No BoardComponent import here -- this file is on the real-runtime import
// path for packages/server (via gamesCatalog.ts), and BoardComponent.tsx
// imports a real .css file Node cannot resolve. The board component is
// registered separately, in ../../boards.ts (client-only entry point).
export const themindModule: GameModule<TheMindG> = {
  id: 'themind-v1',
  displayName: 'The Mind',
  // The base game's own range -- see spec.md's Non-goals (no expansion
  // content shipped, so no player count above 4).
  minPlayers: 2,
  maxPlayers: 4,
  gameDef: themindGameDef,
  // No settingsSchema -- level count/lives/stars are derived entirely from
  // player count, not a host-chosen room setting (spec.md Non-goals).
};

export type { TheMindG, TheMindView, TheMindSetupData, TheMindShurikenVote } from './gameDef.js';
