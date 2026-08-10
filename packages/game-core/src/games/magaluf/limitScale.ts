/**
 * The intoxication meter's domain, and the reason it cannot leak the limit.
 *
 * A meter that ran `0 → G.limit` would give the hidden number away through its
 * own geometry — worse than showing it outright, because it would look like it
 * was hiding something while every player quietly read it off the bar. So
 * nothing here ever reads `G.limit`.
 *
 * What it reads instead is genuinely public: the limit *deck* is fixed,
 * printed-on-the-box data (the simulator's bots already treat it as public
 * when estimating), and `limitShift` is a room setting everyone can see in the
 * settings form. Two boards with different hidden limits are therefore
 * pixel-identical.
 *
 * Since the deck was flattened to one range for the whole weekend there is no
 * day parameter left to take: the band is 16–28 on Friday and 16–28 on Sunday,
 * so the bar no longer quietly rescales itself overnight and a player who has
 * learned to read it on Friday can still read it on Sunday. Showing the band is
 * still better information than showing nothing — it is the shape of the risk
 * without the answer.
 */

import { LIMIT_DECK } from './constants.js';

/**
 * Headroom above the highest limit the deck could hold, so a player who has
 * blown well past it still has bar left to render into.
 */
export const METER_HEADROOM = 8;

export interface LimitBand {
  min: number;
  max: number;
}

/** The range the limit card could fall in. Public information. */
export function limitRange(limitShift: number): LimitBand {
  return {
    // Clamped at zero: a host can shift the deck down far enough to push the
    // bottom of the band negative, which has no meaning on a meter.
    min: Math.max(0, Math.min(...LIMIT_DECK) + limitShift),
    max: Math.max(0, Math.max(...LIMIT_DECK) + limitShift),
  };
}

/**
 * The meter's maximum. A function of the shift only — never of the limit
 * actually drawn, never of the day, and never of the player.
 */
export function meterMax(limitShift: number): number {
  return limitRange(limitShift).max + METER_HEADROOM;
}

/** A value's position along the meter, as a 0–100 percentage. */
export function meterPercent(value: number, limitShift: number): number {
  const max = meterMax(limitShift);
  if (max <= 0) return 0;
  return Math.min(100, Math.max(0, (value / max) * 100));
}
