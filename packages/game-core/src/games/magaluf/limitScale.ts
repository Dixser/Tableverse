/**
 * The intoxication meter's domain, and the reason it cannot leak the limit.
 *
 * A meter that ran `0 → G.limit` would give the hidden number away through its
 * own geometry — worse than showing it outright, because it would look like it
 * was hiding something while every player quietly read it off the bar. So
 * nothing here ever reads `G.limit`.
 *
 * What it reads instead is genuinely public: the day's limit *deck* is fixed,
 * printed-on-the-box data (the simulator's bots already treat it as public
 * when estimating), and `limitShift` is a room setting everyone can see in the
 * settings form. Two boards for the same day with different hidden limits are
 * therefore pixel-identical.
 *
 * Showing the band the limit could fall in is also better information than
 * showing nothing: Friday's deck spans 26–29 and Sunday's spans 14–26, so the
 * band itself tells you that Sunday is the night you cannot plan around.
 */

import { DAY_IDS } from './cards.js';
import { LIMIT_DECKS } from './constants.js';

/**
 * Headroom above the highest limit the day could hold, so a player who has
 * blown well past it still has bar left to render into.
 */
export const METER_HEADROOM = 8;

export interface LimitBand {
  min: number;
  max: number;
}

/** The range this day's limit card could fall in. Public information. */
export function limitRange(day: number, limitShift: number): LimitBand {
  const deck = LIMIT_DECKS[DAY_IDS[day] ?? DAY_IDS[0]!]!;
  return {
    // Clamped at zero: a host can shift the decks down far enough to push the
    // bottom of the band negative, which has no meaning on a meter.
    min: Math.max(0, Math.min(...deck) + limitShift),
    max: Math.max(0, Math.max(...deck) + limitShift),
  };
}

/**
 * The meter's maximum. A function of the day and the shift only — never of
 * the limit actually drawn, and never of the player.
 */
export function meterMax(day: number, limitShift: number): number {
  return limitRange(day, limitShift).max + METER_HEADROOM;
}

/** A value's position along the meter, as a 0–100 percentage. */
export function meterPercent(value: number, day: number, limitShift: number): number {
  const max = meterMax(day, limitShift);
  if (max <= 0) return 0;
  return Math.min(100, Math.max(0, (value / max) * 100));
}
