import type { JSONSchema } from './types.js';

/**
 * Generic "next level" progression helper for any game whose
 * settingsSchema exposes a numeric `level` field backed by a bounded enum
 * (e.g. Crew's 1-50 mission picker) -- deliberately keyed off the SHAPE of
 * settingsSchema, never a specific game's id, per tech-stack.md's "no
 * game-specific branching in platform code" rule. This is what lets
 * RoomShell's "Next Level" button (shown after a win, alongside the
 * existing same-settings Rematch button) work for any current or future
 * game with a numbered progression, not just Crew.
 *
 * Returns the gameSettings object to submit (the current settings with
 * `level` advanced to the next higher enum value), or null when there's no
 * such field, the current value isn't recognized, or it's already at the
 * schema's maximum.
 */
export function getNextLevelGameSettings(
  schema: JSONSchema | undefined,
  gameSettings: Record<string, unknown>,
): Record<string, unknown> | null {
  const levelSchema = schema?.properties?.level;
  if (!levelSchema || levelSchema.type !== 'number' || !Array.isArray(levelSchema.enum)) {
    return null;
  }
  const levels = levelSchema.enum.filter((v): v is number => typeof v === 'number');
  const currentLevel = gameSettings.level;
  if (typeof currentLevel !== 'number') return null;
  const nextLevel = levels.filter((v) => v > currentLevel).sort((a, b) => a - b)[0];
  if (nextLevel === undefined) return null;
  return { ...gameSettings, level: nextLevel };
}
