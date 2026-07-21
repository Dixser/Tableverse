import type { GameModule, JSONSchema } from '../../types.js';
import { crewGameDef, type CrewG } from './gameDef.js';

const levelSchema: JSONSchema = {
  type: 'number',
  // enum (not minimum/maximum) -- validateGameSettings only enforces type
  // and enum today (settingsValidation.ts), and enum is also what
  // SettingsForm.tsx already renders as a <select> dropdown, exactly the
  // right control for picking one of 50 missions.
  enum: Array.from({ length: 50 }, (_, i) => i + 1),
  default: 1,
  title: 'Mission',
};

// No BoardComponent import here -- this file is on the real-runtime import
// path for packages/server (via gamesCatalog.ts), and BoardComponent.tsx
// imports a real .css file Node cannot resolve. The board component is
// registered separately, in ../../boards.ts (client-only entry point).
export const crewModule: GameModule<CrewG> = {
  id: 'crew-v1',
  displayName: 'The Crew: The Quest for Planet Nine',
  // The rulebook's base game is 3-5 players -- 2 players is a
  // structurally different ruleset (a virtual "JARVIS" seat, a different
  // deal) left for a future independent catalog entry (crew-2p-v1), not
  // a settingsSchema variant of this module (see tech-stack.md's
  // versioning heuristic).
  minPlayers: 3,
  maxPlayers: 5,
  gameDef: crewGameDef,
  settingsSchema: {
    type: 'object',
    properties: { level: levelSchema },
    required: ['level'],
  },
};

export type { CrewG, CrewView, CrewSetupData, Card, Suit, ColorSuit, TaskCard, Task, TrickPlay } from './gameDef.js';
