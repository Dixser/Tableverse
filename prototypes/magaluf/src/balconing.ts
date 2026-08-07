/**
 * The jump.
 *
 * Going over the Drinking Limit is not instant death. You go up to the
 * balcony, and the only question is whether you clear the terrace and land in
 * the pool. Either way you lose the night's unbanked VP and your items — you
 * are in a swimming pool with a fractured pelvis and the night is over. The
 * roll only decides whether your weekend continues.
 */

import type { Config } from './config.ts';
import type { Random } from './rng.ts';

/**
 * Survival chance given `d` = intoxication − limit (always >= 1).
 *
 * Linear and legible on purpose: a player who can see the revealed limit can
 * work out their own odds before choosing to draw again, which is the whole
 * decision the After phase is built around.
 */
export function poolChance(d: number, config: Config): number {
  const { basePoolChance, decay } = config.balconing;
  return clamp01(basePoolChance - (d - 1) * decay);
}

/** Legend bonus for surviving, banked immediately. Scales with how far gone you were. */
export function legendBonus(d: number, config: Config): number {
  return config.balconing.legendBase + d;
}

/**
 * Expected value of jumping at a given `d`, ignoring the round VP you forfeit.
 *
 * The design requires this to stay far below a typical round's unbanked haul
 * at every `d`, so that no player should ever aim to go over. The simulator
 * asserts it rather than trusting the arithmetic here.
 */
export function jumpExpectedValue(d: number, config: Config): number {
  return poolChance(d, config) * legendBonus(d, config);
}

/** The largest expected value available anywhere on the survival curve. */
export function peakJumpExpectedValue(config: Config, maxD = 40): { d: number; ev: number } {
  let best = { d: 1, ev: jumpExpectedValue(1, config) };
  for (let d = 2; d <= maxD; d++) {
    const ev = jumpExpectedValue(d, config);
    if (ev > best.ev) best = { d, ev };
  }
  return best;
}

export interface JumpOutcome {
  d: number;
  survived: boolean;
  legendVP: number;
  resaca: number;
}

export function resolveJump(d: number, config: Config, rng: Random): JumpOutcome {
  const survived = rng.chance(poolChance(d, config));
  return {
    d,
    survived,
    legendVP: survived ? legendBonus(d, config) : 0,
    resaca: survived ? config.balconing.resaca : 0,
  };
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}
