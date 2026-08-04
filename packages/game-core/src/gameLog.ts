import type { GameLogEntry } from './types.js';

/**
 * Filters a raw `G.log` value down to well-formed GameLogEntry values,
 * tolerating an absent/non-array field or malformed entries -- see
 * spec/features/012-chat/plan.md.
 *
 * Lives here rather than beside its first consumer (ChatPanel) because it
 * has two: the chat feed renders these entries, and feature 030's sound
 * observer plays their `sound` cue. Importing it from ChatPanel.tsx would
 * drag ChatPanel.module.css, useChat and socket.io-client into GameMount's
 * import graph for a four-line pure function; keeping it in game-core (no
 * React, no DOM) puts it next to the GameLogEntry type it validates.
 */
export function extractGameLogEntries(gameLog: unknown): GameLogEntry[] {
  if (!Array.isArray(gameLog)) return [];
  return gameLog.filter(
    (e): e is GameLogEntry =>
      typeof e === 'object' && e !== null && typeof (e as GameLogEntry).key === 'string',
  );
}
