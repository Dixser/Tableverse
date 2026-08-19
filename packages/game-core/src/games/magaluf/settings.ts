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
import {
  BALCONY_DICE,
  DAY_VP_MULTIPLIER,
  DEFAULT_BALCONY_DIE,
  DEFAULT_LIMIT_MAX,
  DEFAULT_LIMIT_MIN,
  LIMIT_BOUNDS,
} from './constants.js';

export type LimitRevealAt = PhaseId | 'never';

/**
 * How long a cell holds you.
 *
 * `'day'` is the original rule and stays the default: arrested, and out for
 * every remaining phase of that day. `'phase'` releases you at the next venue.
 *
 * A dial rather than a decision because the table is split on it and both
 * readings are defensible. `'day'` makes the Redada the real threat that makes
 * carrying contraband a genuine bet — which only became a fair bet at all once
 * the Camello started asking. `'phase'` keeps a bad card from ending somebody's
 * evening at eight o'clock.
 *
 * Worth knowing before turning it to `'phase'`: an arrest banks the round pool
 * on the spot, so a shorter sentence turns the Redada into a partial hedge —
 * this day's points so far are locked in at the day's rate and cannot be lost
 * to the limit check, and you are back in the next venue to earn more. It is
 * not directly exploitable, since nobody chooses when a Redada appears, but it
 * does mean the card can land as a mixed blessing rather than a punishment.
 */
export type ArrestScope = 'phase' | 'day';

export const ARREST_SCOPE_OPTIONS: readonly ArrestScope[] = ['phase', 'day'];

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
  /**
   * The band the drinking limit is drawn from, inclusive at both ends. Every
   * integer between them is a card. `limitMin === limitMax` is legal and means
   * a fixed, publicly known limit every day.
   */
  limitMin: number;
  limitMax: number;
  saturdayMultiplier: number;
  sundayMultiplier: number;
  /** How long an arrest keeps you out. See `ArrestScope`. */
  arrestLasts: ArrestScope;
}

interface NumericRange {
  min: number;
  max: number;
  fallback: number;
}

const RANGES: Record<
  keyof Omit<MagalufSettings, 'limitRevealAt' | 'balconyDie' | 'arrestLasts'>,
  NumericRange
> = {
  limitMin: { min: LIMIT_BOUNDS.min, max: LIMIT_BOUNDS.max, fallback: DEFAULT_LIMIT_MIN },
  limitMax: { min: LIMIT_BOUNDS.min, max: LIMIT_BOUNDS.max, fallback: DEFAULT_LIMIT_MAX },
  saturdayMultiplier: { min: 1, max: 3, fallback: DAY_VP_MULTIPLIER[1]! },
  sundayMultiplier: { min: 1, max: 4, fallback: DAY_VP_MULTIPLIER[2]! },
};

export const DEFAULT_SETTINGS: MagalufSettings = {
  limitRevealAt: 'after',
  balconyDie: DEFAULT_BALCONY_DIE,
  limitMin: RANGES.limitMin.fallback,
  limitMax: RANGES.limitMax.fallback,
  saturdayMultiplier: RANGES.saturdayMultiplier.fallback,
  sundayMultiplier: RANGES.sundayMultiplier.fallback,
  // The rule as shipped. A host opts in to the shorter sentence.
  arrestLasts: 'day',
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
  // The first cross-field rule in this file, so it cannot live in `clampNumber`
  // with the rest: each end is clamped into the legal bounds on its own, and
  // only then is the pair made coherent. The top end gives way, which keeps a
  // host dragging one slider past the other predictable — the number you are
  // moving is the one that wins.
  const limitMin = Math.round(clampNumber(raw?.limitMin, RANGES.limitMin));
  const limitMax = Math.max(limitMin, Math.round(clampNumber(raw?.limitMax, RANGES.limitMax)));
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
    limitMin,
    limitMax,
    saturdayMultiplier: clampNumber(raw?.saturdayMultiplier, RANGES.saturdayMultiplier),
    sundayMultiplier: clampNumber(raw?.sundayMultiplier, RANGES.sundayMultiplier),
    // Same shape as limitRevealAt: an unrecognised value is not the nearest
    // valid one, it is no answer at all, so it falls back to the default.
    arrestLasts: ARREST_SCOPE_OPTIONS.includes(raw?.arrestLasts as ArrestScope)
      ? (raw?.arrestLasts as ArrestScope)
      : DEFAULT_SETTINGS.arrestLasts,
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
    limitMin: {
      type: 'number',
      default: DEFAULT_SETTINGS.limitMin,
      minimum: RANGES.limitMin.min,
      maximum: RANGES.limitMin.max,
      title: `Lowest possible drinking limit (${LIMIT_BOUNDS.min}-${LIMIT_BOUNDS.max})`,
    },
    limitMax: {
      type: 'number',
      default: DEFAULT_SETTINGS.limitMax,
      minimum: RANGES.limitMax.min,
      maximum: RANGES.limitMax.max,
      title: `Highest possible drinking limit (${LIMIT_BOUNDS.min}-${LIMIT_BOUNDS.max}, never below the lowest)`,
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
    arrestLasts: {
      type: 'string',
      enum: [...ARREST_SCOPE_OPTIONS],
      default: DEFAULT_SETTINGS.arrestLasts,
      title: 'A police raid keeps you out for the rest of the (phase / day)',
    },
  },
};
