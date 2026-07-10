import type { Game } from 'boardgame.io';
import { withGameName, type GameModule } from '@tableverse/game-core';
import { SqliteStorageAdapter } from './storage/sqliteStorageAdapter.js';
import { Server, SocketIO } from './vendor.js';

/**
 * Wires boardgame.io's own Server: SocketIO transport unconditionally (per
 * tech-stack.md — no Local() transport anywhere, including for solo play),
 * and the SQLite-backed StorageAPI adapter. `games` is derived directly
 * from the catalog — this file never lists a game by name itself.
 *
 * Each game's boardgame.io `Game` definition must have `.name` set to its
 * GameModule `id` (via `withGameName`, shared with the client so both
 * sides derive the Socket.IO namespace identically — see its doc comment).
 */
export function buildGamesList(modules: GameModule[]): Game[] {
  return modules.map(withGameName);
}

const DEFAULT_DEV_ORIGINS = ['http://localhost:5173'];

export function createBgioServer(
  modules: GameModule[],
  storage: SqliteStorageAdapter,
  origins: string[] = DEFAULT_DEV_ORIGINS,
) {
  return Server({
    games: buildGamesList(modules),
    db: storage,
    transport: new SocketIO(),
    origins,
  });
}
