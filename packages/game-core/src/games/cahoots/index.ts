import type { GameModule, JSONSchema } from '../../types.js';
import { DIFFICULTIES } from './difficulty.js';
import { cahootsGameDef, type CahootsG } from './gameDef.js';

const difficultySchema: JSONSchema = {
  type: 'string',
  enum: DIFFICULTIES,
  default: 'beginner',
  title: 'Difficulty',
};

// No BoardComponent import here -- this file is on the real-runtime import
// path for packages/server (via gamesCatalog.ts), and BoardComponent.tsx
// imports a real .css file Node cannot resolve. The board component is
// registered separately, in ../../boards.ts (client-only entry point).
export const cahootsModule: GameModule<CahootsG> = {
  id: 'cahoots-v1',
  displayName: 'Mission Accomplished',
  minPlayers: 2,
  maxPlayers: 4,
  gameDef: cahootsGameDef,
  settingsSchema: {
    type: 'object',
    properties: { difficulty: difficultySchema },
    required: ['difficulty'],
  },
};

export type { CahootsG, CahootsView, CahootsSetupData, Card, Color, GoalDefinition, GoalKind, Difficulty } from './gameDef.js';
