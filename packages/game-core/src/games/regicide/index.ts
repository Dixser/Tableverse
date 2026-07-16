import type { GameModule } from '../../types.js';
import { regicideGameDef, type RegicideG } from './gameDef.js';

// No BoardComponent import here -- this file is on the real-runtime import
// path for packages/server (via gamesCatalog.ts), and a BoardComponent.tsx
// would import a real .css file Node cannot resolve. The board component
// (feature 023) is registered separately, in ../../boards.ts (client-only
// entry point), once it exists.
export const regicideModule: GameModule<RegicideG> = {
  id: 'regicide-v1',
  displayName: 'Regicide',
  minPlayers: 2,
  maxPlayers: 4,
  gameDef: regicideGameDef,
  // No settingsSchema -- Jester count/max hand size are derived entirely
  // from player count, not a host-chosen room setting (spec.md's
  // "Resolved design decisions").
  // RegicideBoard's own EnemyPanel renders the roundConfirm UI itself
  // (feature 023 AC9a) -- GameMount must not also render its generic
  // RoundConfirmBanner on top of it.
  ownRoundConfirmUI: true,
};

export type {
  RegicideG,
  RegicideView,
  RegicideSetupData,
  Card,
  Suit,
  FaceCard,
  NumberCard,
  CompanionCard,
  JesterCard,
  NumberRank,
  FaceRank,
} from './gameDef.js';
