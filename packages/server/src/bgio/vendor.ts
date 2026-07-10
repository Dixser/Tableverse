/**
 * boardgame.io ships no root "exports" map, so its subpath package.json
 * shims (e.g. `boardgame.io/server`, `boardgame.io/internal`) resolve fine
 * under TypeScript's "bundler" module resolution (used for type-checking,
 * and what Vite/Vitest also use at runtime) but fail under real Node ESM
 * resolution with ERR_UNSUPPORTED_DIR_IMPORT — confirmed by actually
 * running `node` against this package, not just `tsc`/`vitest`. This
 * matters here specifically because packages/server runs as a real Node
 * process (tsx/node), unlike packages/game-core's equivalent boardgame.io
 * imports, which are only ever executed through Vitest or bundled by Vite.
 *
 * Workaround: import the TYPES from the clean subpath (erased at runtime,
 * so Node never tries to resolve it) and the runtime VALUES from
 * boardgame.io's compiled CJS files directly (a path Node can resolve),
 * then cast the values back to their proper types. If a future
 * boardgame.io release ships a proper "exports" map, this file is the only
 * place that needs to change back to plain subpath imports.
 */
import type * as ServerTypes from 'boardgame.io/server';
import type * as InternalTypes from 'boardgame.io/internal';
// @ts-expect-error -- real file, but boardgame.io ships no .d.ts alongside
// its compiled CJS output; types are recovered via the casts below.
import * as ServerRuntime from 'boardgame.io/dist/cjs/server.js';
// @ts-expect-error -- see above.
import * as InternalRuntime from 'boardgame.io/dist/cjs/internal.js';

export const Server = ServerRuntime.Server as typeof ServerTypes.Server;
export const SocketIO = ServerRuntime.SocketIO as typeof ServerTypes.SocketIO;

export const Async = InternalRuntime.Async as typeof InternalTypes.Async;
export const createMatch =
  InternalRuntime.createMatch as typeof InternalTypes.createMatch;
