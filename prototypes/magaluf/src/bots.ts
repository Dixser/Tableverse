/**
 * Bot policies for the simulator.
 *
 * These exist only to drive balance simulation — no AI opponent ships in the
 * game. Two rules govern them:
 *
 * 1. **They see only what a human sees.** Public intoxication, public items,
 *    the composition of each deck (which is printed on the box), and the day's
 *    limit only once it is revealed or they have spent a Red Bull. They never
 *    read `state.limit` otherwise.
 * 2. **No behaviour is hardcoded to a day.** In particular, nothing tells a
 *    bot to save Farlopa for Sunday. It weighs the Resaca cost against the
 *    days remaining and reaches that conclusion itself — otherwise the
 *    "Farlopa skews to Sunday" balance target would be true by construction
 *    and would measure nothing.
 */

import type { ItemId } from './cards.ts';
import { ALCOHOL, DAY_IDS, PHASE_IDS } from './cards.ts';
import type { Config } from './config.ts';
import type { Action } from './engine.ts';
import type { GameState, PlayerState } from './state.ts';
import { partying, phaseConfig, phaseId } from './state.ts';

export interface Policy {
  name: string;
  /**
   * Multiplier on the phase capacity budget below. 1.0 means "spend exactly
   * the budget"; above 1.0 means deliberately overspending.
   */
  threshold: number;
  /**
   * How much total future Resaca this bot will accept for one Farlopa. Zero
   * means it will only ever use one when no days remain to pay for it.
   */
  resacaTolerance: number;
}

export const POLICIES: Record<string, Policy> = {
  cautious: { name: 'cautious', threshold: 0.78, resacaTolerance: 0 },
  balanced: { name: 'balanced', threshold: 0.9, resacaTolerance: 2 },
  // 0.95 rather than 0.98 on evidence: the simulator shows the win rate peaks
  // near 0.90 and falls off a cliff as the threshold approaches 1.0. Aiming AT
  // the limit wins 22.8% of 4-player games — below the 25% random baseline —
  // because variance carries you over it. Precision-targeting the limit is
  // already what `reckless` is for.
  greedy: { name: 'greedy', threshold: 0.95, resacaTolerance: 4 },
  // Above 1.0 a bot is aiming past the limit rather than at it, which is not
  // greed but suicide. Kept as a stress case, not as a strategy anyone would use.
  reckless: { name: 'reckless', threshold: 1.1, resacaTolerance: 6 },
};

/**
 * Cumulative share of the day's limit a bot is willing to have spent by the
 * END of each phase.
 *
 * Without this the bots are pure greedy accumulators: they burn their whole
 * capacity in the Tardeo and the Noche, where VP is cheap, and arrive at the
 * After with nothing left to spend where VP is dearest. That is a deficiency
 * of the bot, not of the game — a competent human budgets for the After — and
 * leaving it in makes every downstream balance number meaningless.
 */
export const PHASE_CAPACITY_SHARE: readonly number[] = [0.28, 0.62, 1.0];

export const POLICY_NAMES = Object.keys(POLICIES);

// ---------------------------------------------------------------------------
// Public-information helpers
// ---------------------------------------------------------------------------

/** Mean intoxication of the current phase's alcohol deck — printed on the box. */
export function meanIntox(state: GameState, config: Config): number {
  return meanOver(state, config, (id) => ALCOHOL[id]!.intox);
}

export function meanVP(state: GameState, config: Config): number {
  return meanOver(state, config, (id) => ALCOHOL[id]!.vp);
}

function meanOver(state: GameState, config: Config, pick: (id: string) => number): number {
  const composition = config.phases[phaseId(state)].alcohol;
  let total = 0;
  let count = 0;
  for (const [id, n] of Object.entries(composition)) {
    total += pick(id) * n;
    count += n;
  }
  return count === 0 ? 0 : total / count;
}

/**
 * What this player believes the limit to be. Once revealed — or peeked at with
 * a Red Bull — it is the real number. Before that it is the mean of the day's
 * limit deck, which is public.
 */
export function estimatedLimit(state: GameState, config: Config, player: PlayerState): number {
  if (state.limitRevealed || player.peekedLimit) return state.limit;
  const deck = config.limitDecks[DAY_IDS[state.day]!];
  return deck.reduce((a, b) => a + b, 0) / deck.length;
}

// ---------------------------------------------------------------------------
// Decision
// ---------------------------------------------------------------------------

export function chooseAction(
  state: GameState,
  config: Config,
  player: PlayerState,
  policy: Policy,
): Action {
  const phase = phaseConfig(state, config);
  const limit = estimatedLimit(state, config, player);
  const expected = meanIntox(state, config);
  const belowMinimum = player.drinksThisPhase < phase.minDrinks;

  // Two adjustments to the base appetite, both of them things a human would do
  // for the same reasons: leaving below the minimum costs real VP, and a night
  // that pays double is worth overreaching for.
  const dayValue = config.dayVPMultiplier[state.day] ?? 1;
  const threshold = policy.threshold + (belowMinimum ? 0.1 : 0) + (dayValue - 1) * 0.1;
  const budget = limit * PHASE_CAPACITY_SHARE[state.phase]! * threshold;
  const projected = player.intox + expected;
  const wouldLeave = projected > budget;

  if (!player.itemUsedThisTurn) {
    const item = chooseItem(state, config, player, policy, { limit, budget, expected, wouldLeave });
    if (item) return item;
  }

  if (wouldLeave && !mustKeepDrinking(state, player, phase.maxDrinks)) {
    return { type: 'withdraw' };
  }
  return { type: 'drink' };
}

function mustKeepDrinking(state: GameState, player: PlayerState, maxDrinks: number): boolean {
  // Nothing forces a drink; this is only a guard against a degenerate state
  // where withdrawing is impossible because the player is already out.
  return player.status !== 'partying' || player.drinksThisPhase >= maxDrinks;
}

interface ItemContext {
  /** The day's limit as this player understands it. */
  limit: number;
  /** How much intoxication this player is willing to have spent by phase end. */
  budget: number;
  expected: number;
  wouldLeave: boolean;
}

function chooseItem(
  state: GameState,
  config: Config,
  player: PlayerState,
  policy: Policy,
  ctx: ItemContext,
): Action | null {
  const has = (item: ItemId) => player.items.includes(item);
  const danger = player.intox / Math.max(1, ctx.limit);

  // Sober up when the number is getting close to the number you fear.
  if (danger > 0.85) {
    if (has('kebab')) return { type: 'useItem', item: 'kebab' };
    if (has('botella')) return { type: 'useItem', item: 'botella' };
  }

  // Information is worth most while the limit is still face-down.
  if (has('redbull') && !state.limitRevealed && !player.peekedLimit) {
    return { type: 'useItem', item: 'redbull' };
  }

  // A Farlopa's Resaca is paid on every remaining day, so its cost is a
  // function of how much weekend is left — nothing here knows what day it is.
  if (has('farlopa')) {
    const daysRemaining = DAY_IDS.length - 1 - state.day;
    const futureCost = config.resaca.farlopa * daysRemaining;
    const halved = Math.floor(ctx.expected / 2);
    if (player.intox + halved <= ctx.budget && futureCost <= policy.resacaTolerance) {
      return { type: 'useItem', item: 'farlopa' };
    }
  }

  // Double the VP on a drink that is already going to be big.
  if (has('pastis') && !player.pastisArmed && phaseId(state) === PHASE_IDS[2]) {
    if (player.intox + ctx.expected <= ctx.budget) {
      return { type: 'useItem', item: 'pastis' };
    }
  }

  // Stall rather than leave: stay in the phase without drinking, which keeps
  // the Ultimo en Pie bonus live if everyone else folds first.
  if (
    has('porro') &&
    ctx.wouldLeave &&
    player.drinksThisPhase >= phaseConfig(state, config).minDrinks &&
    partying(state).length > 1
  ) {
    return { type: 'useItem', item: 'porro' };
  }

  return null;
}
