import type { Ctx, Game } from 'boardgame.io';

/**
 * Standard boardgame.io board props, re-shaped for a game's
 * BoardComponent. Plain data only -- game-core has no React runtime
 * dependency; this type doesn't reference React at all, only the
 * component that CONSUMES it (each game's own BoardComponent.tsx) does.
 */
export interface BoardProps<G = unknown> {
  G: G;
  ctx: Ctx;
  moves: Record<string, (...args: unknown[]) => void>;
  playerID: string | null;
  isActive: boolean;
}

export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  enum?: unknown[];
  default?: unknown;
  [key: string]: unknown;
}

/**
 * Server-safe game metadata + rules. Deliberately carries NO reference to
 * a game's BoardComponent (or anything that could transitively import
 * CSS/React) -- packages/server imports this catalog at real runtime
 * (Node, not a bundler), and Node cannot resolve a `.module.css` import
 * the way Vite can. A game's BoardComponent is registered separately, in
 * packages/client's own board registry (see packages/game-core/src/boards.ts
 * for the client-only entry point game board components are exported
 * from). Discovered the hard way: feature 003 briefly put BoardComponent
 * back on this interface, which crashed the server on boot the moment a
 * real game's board imported a real CSS file — see
 * spec/features/003-ui-styling/tasks.md for the incident.
 */
export interface GameModule<G = unknown> {
  id: string;
  displayName: string;
  minPlayers: number;
  maxPlayers: number;
  gameDef: Game<G>;
  settingsSchema?: JSONSchema;
}

/**
 * boardgame.io's own Server/Client pair route matches by `Game.name`
 * (server registers a Socket.IO namespace per game name; the client's
 * transport connects to that same namespace derived from `game.name`).
 * `GameModule.gameDef` itself carries no `name` -- both the server (when
 * building its `games` list) and the client (when mounting a `Client()`)
 * must derive it the same way: the catalog id. Sharing this helper avoids
 * the two sides drifting out of sync, which manifests as a silent
 * "Invalid namespace" connection failure with no useful error surfaced to
 * the UI.
 */
export function withGameName<G>(module: GameModule<G>): Game<G> {
  return { ...module.gameDef, name: module.id };
}

/**
 * Required shape of `Ctx.gameover` for every GameModule's `endIf`. Not
 * enforced by boardgame.io's own types (endIf returns `any` upstream) --
 * this is the platform's own contract on top of it, consumed generically by
 * GameoverBanner (packages/client/src/gameMount). Tic-Tac-Toe's endIf
 * already returns exactly this shape (see its gameDef.ts); this type
 * formalizes it, it does not introduce it.
 *
 * `winner` is explicitly "one or more playerIDs" -- a single string for the
 * common case, or an array for any future game whose endIf can produce more
 * than one winner (e.g. a team win). Consumers must normalize to an array
 * before use; no game today needs the array form, but message-resolution
 * logic must not assume exactly one winner just because Tic-Tac-Toe always
 * has one.
 */
export interface GameoverResult {
  /** playerID(s) who won. Omit for a draw or any non-win end state. */
  winner?: string | string[];
  /** True when the match ended with no winner. */
  draw?: boolean;
}
