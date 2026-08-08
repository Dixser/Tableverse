/**
 * The jump.
 *
 * Going over the Drinking Limit is not instant death. You go up to the
 * balcony, and the only question is whether you clear the terrace and land in
 * the pool. Either way you forfeit the night's unbanked VP and your items —
 * you are in a swimming pool with a fractured pelvis and the night is over.
 * The roll only decides whether your weekend continues.
 *
 * **The roll is a die, because this is a tabletop game.** One sentence:
 * *roll a dN and survive if you beat how far over the limit you went.*
 *
 * That is not a simplification of the old continuous formula, it IS the old
 * formula. `base − (d − 1) × decay` with `base = (N−1)/N` and `decay = 1/N`
 * collapses to exactly `(N − d) / N`, which is the probability of rolling
 * above `d` on a dN. The curve was always die-shaped; it was just carrying
 * two invented constants instead of naming the object that produces it.
 *
 * Dropping them also kills the last unphysical probability in the rules and
 * takes two unbounded number inputs out of the settings form.
 */

import { BALCONING } from './constants.js';
import type { Rng } from './rng.js';
import type { MagalufSettings } from './settings.js';

/**
 * Survival chance given `d` = intoxication − limit (always >= 1).
 *
 * Kept as a function because the board shows it: once the limit is face-up a
 * player can read their own odds before deciding to draw again, which is the
 * decision the whole After phase is built around.
 */
export function poolChance(d: number, settings: MagalufSettings): number {
  const faces = settings.balconyDie;
  return Math.min(1, Math.max(0, (faces - d) / faces));
}

/** True when this roll clears the terrace. The only rule that matters. */
export function survivesRoll(roll: number, d: number): boolean {
  return roll > d;
}

/** Banked immediately on surviving. Scales with how far gone you were. */
export function legendBonus(d: number): number {
  return BALCONING.legendBase + d;
}

/**
 * Expected value of jumping at a given `d`, ignoring the round VP forfeited.
 *
 * The design requires this to stay far below a typical round's unbanked haul
 * at every `d`, so no player should ever aim to go over. On a d6 it peaks at
 * ~3.3 VP against a median round pool near 39.
 */
export function jumpExpectedValue(d: number, settings: MagalufSettings): number {
  return poolChance(d, settings) * legendBonus(d);
}

export interface JumpOutcome {
  /** What the die actually showed. Recorded so the board can display it. */
  roll: number;
  survived: boolean;
  legendVP: number;
  resaca: number;
}

export function resolveJump(d: number, settings: MagalufSettings, rng: Rng): JumpOutcome {
  const roll = rng.die(settings.balconyDie);
  const survived = survivesRoll(roll, d);
  return {
    roll,
    survived,
    legendVP: survived ? legendBonus(d) : 0,
    resaca: survived ? BALCONING.resaca : 0,
  };
}
