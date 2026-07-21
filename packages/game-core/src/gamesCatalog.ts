import type { GameModule } from './types.js';
import { tictactoeModule } from './games/tictactoe/index.js';
import { loveletterModule } from './games/loveletter/index.js';
import { themindModule } from './games/themind/index.js';
import { regicideModule } from './games/regicide/index.js';
import { crewModule } from './games/crew/index.js';

// GameModule<G>'s move functions take G as a parameter (a contravariant
// position), so GameModule<Specific> can never be a structural subtype of
// GameModule<AnythingElse> -- there is no way to hold a heterogeneous list
// of differently-typed GameModules without erasing G at this boundary.
// Each game's own module (e.g. tictactoe/index.ts) keeps its precise
// GameModule<TicTacToeG> typing; only this array's element type is `any`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyGameModule = GameModule<any>;

// Single registration point for every playable game. Adding a game =
// writing its own GameModule + one line here — nothing else in
// packages/server or packages/client should need to change (feature 002
// exists specifically to prove that for tictactoe-v1).
export const gamesCatalog: AnyGameModule[] = [
  tictactoeModule,
  loveletterModule,
  themindModule,
  regicideModule,
  crewModule,
];

export function getGameModule(id: string): AnyGameModule | undefined {
  return gamesCatalog.find((m) => m.id === id);
}
