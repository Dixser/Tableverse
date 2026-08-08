import type { GameModule } from '../../types.js';
import { magalufGameDef, type MagalufG } from './gameDef.js';
import { magalufSettingsSchema } from './settings.js';

// No BoardComponent import here -- this file is on the real-runtime import
// path for packages/server (via gamesCatalog.ts), and a BoardComponent.tsx
// imports a real .css file Node cannot resolve. The board component is
// registered separately, in ../../boards.ts (client-only entry point).
export const magalufModule: GameModule<MagalufG> = {
  id: 'magaluf-v1',
  displayName: 'Magaluf',
  // 2 players is structurally unbalanced rather than merely untuned: forced-
  // consumption events hit everyone still partying, so a two-person table
  // generates almost no unavoidable intoxication and every drink becomes a
  // choice you can decline. See spec/features/032-magaluf-rules/spec.md.
  minPlayers: 3,
  maxPlayers: 6,
  gameDef: magalufGameDef,
  settingsSchema: magalufSettingsSchema,
};

export type { MagalufG, MagalufPlayer, JumpRecord, MagalufSettings } from './gameDef.js';
export type { ItemId, EventId, PhaseId, DayId } from './cards.js';
export { poolChance, legendBonus } from './balconing.js';
