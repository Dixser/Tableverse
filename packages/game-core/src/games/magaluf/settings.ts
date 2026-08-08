/**
 * Room settings: the balance dials a host can turn between playtests.
 *
 * These are deliberately **raw numeric dials** rather than named presets, so
 * a group can hunt for its own sweet spot rather than picking from three
 * points somebody else chose.
 *
 * That choice makes `clampSettings` load-bearing rather than defensive habit.
 * `validateGameSettings` (../../settingsValidation.ts) checks a value's TYPE
 * but ignores `minimum`/`maximum`, and `SettingsForm` renders a plain
 * `<input type="number">` with no bounds — so a host can submit 500 for a
 * probability and the platform will happily persist it. Every numeric setting
 * is therefore clamped here, on the way in, before it can reach game logic.
 *
 * The schema still declares the ranges. They document intent, and they start
 * working for free if the platform's validator ever grows range checking (see
 * spec/features/032-magaluf-rules/spec.md's non-goals).
 */

import type { JSONSchema } from '../../types.js';
import type { PhaseId } from './cards.js';
import { BALCONY_DICE, DAY_VP_MULTIPLIER, DEFAULT_BALCONY_DIE } from './constants.js';

export type LimitRevealAt = PhaseId | 'never';

export const LIMIT_REVEAL_OPTIONS: readonly LimitRevealAt[] = [
  'tardeo',
  'noche',
  'after',
  'never',
];

export interface MagalufSettings {
  limitRevealAt: LimitRevealAt;
  /**
   * Faces on the balcony die. Replaces the old basePoolChance/poolDecay pair:
   * a continuous probability has no physical form, and this game has to be
   * playable with cardboard and a die.
   */
  balconyDie: number;
  /** Shifts every day's limit deck by the same amount. */
  limitShift: number;
  saturdayMultiplier: number;
  sundayMultiplier: number;
}

interface NumericRange {
  min: number;
  max: number;
  fallback: number;
}

const RANGES: Record<keyof Omit<MagalufSettings, 'limitRevealAt' | 'balconyDie'>, NumericRange> = {
  limitShift: { min: -10, max: 10, fallback: 0 },
  saturdayMultiplier: { min: 1, max: 3, fallback: DAY_VP_MULTIPLIER[1]! },
  sundayMultiplier: { min: 1, max: 4, fallback: DAY_VP_MULTIPLIER[2]! },
};

export const DEFAULT_SETTINGS: MagalufSettings = {
  limitRevealAt: 'after',
  balconyDie: DEFAULT_BALCONY_DIE,
  limitShift: 0,
  saturdayMultiplier: RANGES.saturdayMultiplier.fallback,
  sundayMultiplier: RANGES.sundayMultiplier.fallback,
};

function clampNumber(raw: unknown, range: NumericRange): number {
  // A non-finite value (missing, NaN, a string that slipped through, Infinity)
  // falls back to the tuned default rather than clamping to an endpoint —
  // silently turning a typo into "maximum lethality" would be worse than
  // ignoring it.
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return range.fallback;
  return Math.min(range.max, Math.max(range.min, raw));
}

export function clampSettings(raw: Partial<MagalufSettings> | undefined): MagalufSettings {
  const revealAt = raw?.limitRevealAt;
  const die = raw?.balconyDie;
  return {
    limitRevealAt: LIMIT_REVEAL_OPTIONS.includes(revealAt as LimitRevealAt)
      ? (revealAt as LimitRevealAt)
      : DEFAULT_SETTINGS.limitRevealAt,
    // A die that is not one of the real ones is not clamped to the nearest --
    // there is no such thing as a d7 on the table, so an unknown value falls
    // back to the standard die.
    balconyDie: BALCONY_DICE.includes(die as (typeof BALCONY_DICE)[number])
      ? (die as number)
      : DEFAULT_BALCONY_DIE,
    limitShift: Math.round(clampNumber(raw?.limitShift, RANGES.limitShift)),
    saturdayMultiplier: clampNumber(raw?.saturdayMultiplier, RANGES.saturdayMultiplier),
    sundayMultiplier: clampNumber(raw?.sundayMultiplier, RANGES.sundayMultiplier),
  };
}

/** Per-day VP multipliers, with Saturday and Sunday taken from settings. */
export function dayMultipliers(settings: MagalufSettings): number[] {
  return [DAY_VP_MULTIPLIER[0]!, settings.saturdayMultiplier, settings.sundayMultiplier];
}

export const magalufSettingsSchema: JSONSchema = {
  type: 'object',
  properties: {
    limitRevealAt: {
      type: 'string',
      enum: [...LIMIT_REVEAL_OPTIONS],
      default: DEFAULT_SETTINGS.limitRevealAt,
      title: 'Reveal the drinking limit at',
    },
    // An enum, not a number: a die has a fixed set of real shapes, and this
    // also takes two unbounded inputs out of a form the platform does not
    // range-check.
    balconyDie: {
      type: 'number',
      enum: [...BALCONY_DICE],
      default: DEFAULT_SETTINGS.balconyDie,
      title: 'Balconing die (survive by rolling above how far over you went)',
    },
    limitShift: {
      type: 'number',
      default: DEFAULT_SETTINGS.limitShift,
      minimum: RANGES.limitShift.min,
      maximum: RANGES.limitShift.max,
      title: 'Drinking limit adjustment (-10 to +10)',
    },
    saturdayMultiplier: {
      type: 'number',
      default: DEFAULT_SETTINGS.saturdayMultiplier,
      minimum: RANGES.saturdayMultiplier.min,
      maximum: RANGES.saturdayMultiplier.max,
      title: 'Saturday points multiplier (1-3)',
    },
    sundayMultiplier: {
      type: 'number',
      default: DEFAULT_SETTINGS.sundayMultiplier,
      minimum: RANGES.sundayMultiplier.min,
      maximum: RANGES.sundayMultiplier.max,
      title: 'Sunday points multiplier (1-4)',
    },
  },
};
