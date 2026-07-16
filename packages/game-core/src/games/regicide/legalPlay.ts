import { cardValue, type Card, type NumberCard } from './deck.js';

/**
 * Shape-only validation of a Step 1 selection (spec.md's "Legal plays"
 * list) -- exported separately from gameDef.ts since feature 023's card-
 * disabling UI needs this exact function to compute which additional
 * cards a partial selection still allows, same reuse reason Love Letter's
 * eligibleTargets.ts is its own module. Does not look at G at all (no
 * enemy immunity, no hand ownership) -- purely "would this set of cards,
 * played together, be legal."
 */
export function isLegalSelection(cards: Card[]): boolean {
  if (cards.length === 0) return false;
  // Single card (any kind, including a lone Jester or a face card) is
  // always legal -- rules 1/2/4 of spec.md's "Legal plays".
  if (cards.length === 1) return true;
  // Jester is always played alone -- never part of a combo or pair.
  if (cards.some((c) => c.kind === 'jester')) return false;

  const companions = cards.filter((c) => c.kind === 'companion').length;
  if (companions >= 1) {
    // Animal Companion paired with exactly one other card (numeric, face,
    // or another Companion) -- rule 5. Never part of a larger combo.
    return cards.length === 2;
  }

  // Same-rank numeric combo of 2-4 cards, sum <= 10 -- rule 3. Face cards
  // can't combo (only numeric ranks 2-10 form a combo).
  if (cards.length > 4) return false;
  if (!cards.every((c) => c.kind === 'number')) return false;
  const rank = (cards[0] as NumberCard).rank;
  if (!cards.every((c) => (c as NumberCard).rank === rank)) return false;
  return cards.reduce((sum, c) => sum + cardValue(c), 0) <= 10;
}
