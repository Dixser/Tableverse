import type { Ctx, Game } from 'boardgame.io';
import type React from 'react';

/**
 * Type-only reference to React's FC shape — game-core has no React runtime
 * dependency, but the GameModule contract (below) must describe the shape
 * of the board component every game plugs in, which is inherently a React
 * type. See spec/features/001-platform-core/tasks.md task 2.1.
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

export interface GameModule<G = unknown> {
  id: string;
  displayName: string;
  minPlayers: number;
  maxPlayers: number;
  gameDef: Game<G>;
  BoardComponent: React.FC<BoardProps<G>>;
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
