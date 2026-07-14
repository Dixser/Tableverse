import type { CardRank } from './deck.js';

/**
 * True when the hand holds the Countess (8) alongside the King (7) or the
 * Prince (5) -- the forced-play rule HandView surfaces as a disabled card
 * with an explanation (spec.md story 2). The server independently rejects
 * the illegal move regardless (gameDef.ts's playCard), so this is a UX
 * affordance only, not a security boundary.
 */
export function countessBlocksOtherCard(hand: CardRank[]): boolean {
  return hand.includes(8) && hand.some((r) => r === 5 || r === 7);
}
