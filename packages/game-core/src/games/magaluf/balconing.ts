/**
 * The jump.
 *
 * Going over the Drinking Limit is not instant death. You go up to the
 * balcony, and the only question is whether you clear the terrace and land in
 * the pool. Either way you forfeit the night's unbanked VP and your items —
 * you are in a swimming pool with a fractured pelvis and the night is over.
 * The roll only decides whether your weekend continues.
 */

import { BALCONING } from './constants.js';
import type { Rng } from './rng.js';
import type { MagalufSettings } from './settings.js';

/**
 * Survival chance given `d` = intoxication − limit (always >= 1).
 *
 * Linear and legible on purpose: once the limit is revealed a player can work
 * out their own odds before choosing to draw again, which is the decision the
 * whole After phase is built around.
 */
export function poolChance(d: number, settings: MagalufSettings): number {
  const raw = settings.basePoolChance - (d - 1) * settings.poolDecay;
  return Math.min(1, Math.max(0, raw));
}

/** Banked immediately on surviving. Scales with how far gone you were. */
export function legendBonus(d: number): number {
  return BALCONING.legendBase + d;
}

/**
 * Expected value of jumping at a given `d`, ignoring the round VP forfeited.
 *
 * The design requires this to stay far below a typical round's unbanked haul
 * at every `d`, so no player should ever aim to go over. At the tuned
 * defaults it peaks at ~2.90 VP against a median round pool of ~39.
 */
export function jumpExpectedValue(d: number, settings: MagalufSettings): number {
  return poolChance(d, settings) * legendBonus(d);
}

export interface JumpOutcome {
  survived: boolean;
  legendVP: number;
  resaca: number;
}

export function resolveJump(d: number, settings: MagalufSettings, rng: Rng): JumpOutcome {
  const survived = rng.chance(poolChance(d, settings));
  return {
    survived,
    legendVP: survived ? legendBonus(d) : 0,
    resaca: survived ? BALCONING.resaca : 0,
  };
}
