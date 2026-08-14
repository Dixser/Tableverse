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
  // Opened up for playtesting, deliberately wider than the tuned range.
  //
  // 2 is still structurally unbalanced rather than merely untuned, for the
  // reason 032 recorded: forced-consumption events hit everyone still
  // partying, so a two-person table generates almost no unavoidable
  // intoxication and every drink becomes a choice you can decline. It is
  // allowed anyway because it is the cheapest way to show somebody the core
  // loop, and the engine has no rule that needs a third seat.
  //
  // 10 is the other end of the same bet: nothing breaks, but a phase is nine
  // laps long and the decks now reshuffle mid-venue (see `drawAlcohol`), which
  // changes what card-counting is worth. Both ends are here to be measured,
  // not because either is claimed to be good. 3–6 remains the tuned range.
  minPlayers: 2,
  maxPlayers: 10,
  gameDef: magalufGameDef,
  settingsSchema: magalufSettingsSchema,
};

export type { MagalufG, MagalufPlayer, JumpRecord, MagalufSettings } from './gameDef.js';
export type { ItemId, EventId, PhaseId, DayId } from './cards.js';
export { poolChance, legendBonus } from './balconing.js';
