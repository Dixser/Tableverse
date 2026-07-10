/**
 * boardgame.io ships no root "exports" map, so its subpath package.json
 * shims (e.g. `boardgame.io/core`) resolve fine under TypeScript's
 * "bundler" module resolution (and under Vite/Vitest at runtime, which use
 * the same resolution) but fail under real Node ESM resolution with
 * ERR_MODULE_NOT_FOUND -- confirmed when packages/server (a real Node
 * process) imports @tableverse/game-core's gamesCatalog, which pulls in a
 * game's gameDef.ts. See packages/server/src/bgio/vendor.ts for the first
 * occurrence of this same issue and the fuller explanation.
 *
 * Only game rule files (gameDef.ts) need this -- they're the only game-core
 * files a real Node process (the server) actually imports at runtime.
 * BoardComponent.tsx and testing/conformance.ts are only ever loaded
 * through Vite/Vitest, which resolve boardgame.io's subpaths natively.
 */
import type { INVALID_MOVE as InvalidMoveType } from 'boardgame.io/core';
// @ts-expect-error -- real file, but boardgame.io ships no .d.ts alongside its compiled CJS output.
import * as CoreRuntime from 'boardgame.io/dist/cjs/core.js';

export const INVALID_MOVE = CoreRuntime.INVALID_MOVE as typeof InvalidMoveType;
