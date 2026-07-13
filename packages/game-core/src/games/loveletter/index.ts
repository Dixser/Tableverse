import type { GameModule } from '../../types.js';
import { loveletterGameDef, type LoveLetterG } from './gameDef.js';

// No BoardComponent yet -- this feature's non-goal (spec.md); feature 015
// adds the real board and its own registration in ../../boards.ts.
export const loveletterModule: GameModule<LoveLetterG> = {
  id: 'loveletter-v1',
  displayName: 'Love Letter',
  // Normal's range (the superset) -- GameModule's static fields can't vary
  // per `edition` setting; a classic match with >4 seats is rejected at
  // startMatch time instead (see gameDef.ts's validateSetupData/setup).
  minPlayers: 2,
  maxPlayers: 6,
  gameDef: loveletterGameDef,
  // Exposes the edition choice to feature 013's settings form (spec.md
  // user story 6); without this, setGameSettings would reject any
  // submitted `edition` value as an unknown field.
  settingsSchema: {
    type: 'object',
    properties: {
      edition: { type: 'string', enum: ['normal', 'classic'], default: 'normal' },
    },
  },
};

export type { LoveLetterG } from './gameDef.js';
