/**
 * The limit band: what is public about the hidden number, and the meter built
 * on top of it.
 *
 * A meter that ran `0 → G.limit` would give the hidden number away through its
 * own geometry — worse than showing it outright, because it would look like it
 * was hiding something while every player quietly read it off the bar. So
 * nothing here ever reads `G.limit`.
 *
 * What it reads instead is genuinely public: the band is a room setting
 * everyone can see in the settings form, and the deck is every integer inside
 * it. Two boards with different hidden limits are therefore pixel-identical.
 *
 * Since the band is one range for the whole weekend there is no day parameter
 * to take: it is 16–28 on Friday and 16–28 on Sunday, so the bar never quietly
 * rescales itself overnight and a player who has learned to read it on Friday
 * can still read it on Sunday. Showing the band is better information than
 * showing nothing — it is the shape of the risk without the answer.
 */

import type { MagalufSettings } from './settings.js';

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
export function limitRange(settings: MagalufSettings): LimitBand {
  return { min: settings.limitMin, max: settings.limitMax };
}

/**
 * Every limit the day could draw, low to high.
 *
 * A real deck, not an index into a range with a random number: the host sets
 * the two ends, and every integer between them is a card you could turn over.
 * `min === max` is a one-card deck, which is a legitimate table — a fixed limit
 * everybody knows.
 */
export function buildLimitDeck(band: LimitBand): number[] {
  const deck: number[] = [];
  for (let n = band.min; n <= band.max; n++) deck.push(n);
  return deck;
}

/**
 * The meter's maximum. A function of the band only — never of the limit
 * actually drawn, never of the day, and never of the player.
 */
export function meterMax(band: LimitBand): number {
  return band.max + METER_HEADROOM;
}

/** A value's position along the meter, as a 0–100 percentage. */
export function meterPercent(value: number, band: LimitBand): number {
  const max = meterMax(band);
  if (max <= 0) return 0;
  return Math.min(100, Math.max(0, (value / max) * 100));
}
