/**
 * The jump.
 *
 * Going over the Drinking Limit is not instant death. You go up to the
 * balcony, and the only question is whether you clear the terrace and land in
 * the pool. **The roll is the entire penalty.** Reach the pool and the night
 * is yours — the round pool banks at the day's rate, the items stay in your
 * pocket, and the Leyenda bonus goes on top. Hit the concrete and you lose the
 * night, the items and the rest of the weekend.
 *
 * **The roll is a die, because this is a tabletop game.** One sentence:
 * *roll a dN and survive if you beat how far over the limit you went — or if
 * you roll the top face, which always clears.*
 *
 * The die replaced a continuous formula it happened to reproduce exactly:
 * `base − (d − 1) × decay` with `base = (N−1)/N` and `decay = 1/N` collapses
 * to `(N − d) / N`, the probability of rolling above `d` on a dN. That
 * identity is now broken, deliberately. The natural max floors survival at
 * `1 / N` where the formula went to zero, so this is a die that no formula was
 * ever secretly behind — which is the right way round for a game meant to be
 * played with the physical object.
 *
 * Why break it: at `d ≥ N` the old rule was arithmetically certain death, and
 * the engine still dealt you the roll first. Playtesters read that as the dice
 * being cruel when in fact the outcome was fixed the moment they drew. The top
 * face keeps the jump a real jump the whole way out, and it costs the house
 * very little — one face in N, in the band where almost nobody goes.
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
  // The natural max is always one of the winning faces, so the chance never
  // reaches zero however far over you went. Still capped at 1: `d` is always
  // at least 1, but the cap costs nothing and states the range.
  return Math.min(1, Math.max(1 / faces, (faces - d) / faces));
}

/** True when this roll clears the terrace. The only rule that matters. */
export function survivesRoll(roll: number, d: number, faces: number): boolean {
  return roll > d || roll === faces;
}

/** Banked immediately on surviving. Scales with how far gone you were. */
export function legendBonus(d: number): number {
  return BALCONING.legendBase + d;
}

/**
 * Expected value of the Leyenda bonus alone at a given `d`.
 *
 * This is no longer the expected value of the gamble: since only the concrete
 * forfeits the pool, what a jumper actually risks is
 * `poolChance × (pool × dayMultiplier)` against a certain `pool × multiplier`
 * for stopping under the limit. The bonus is the sweetener on top, and on a d6
 * it peaks at ~3.3 VP just over the limit — small enough that the pool still
 * decides the call.
 *
 * One wrinkle the natural-max floor introduces: past `d = N` the chance stops
 * falling while `legendBonus` keeps climbing, so this figure starts rising
 * again and eventually passes that early peak. It is not the exploit it looks
 * like — the pool, which dwarfs the bonus, is still being staked at a flat
 * `1 / N` — but the bonus alone does reward going absurdly over, and if a
 * table ever finds a way to reach those values on purpose, cap it here.
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
  const survived = survivesRoll(roll, d, settings.balconyDie);
  return {
    roll,
    survived,
    legendVP: survived ? legendBonus(d) : 0,
    resaca: survived ? BALCONING.resaca : 0,
  };
}
