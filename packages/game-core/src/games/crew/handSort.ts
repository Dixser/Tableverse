import { ALL_SUITS, type Card } from './deck.js';

/**
 * Sort presets for feature 031's hand arrangement. Kept out of deck.ts for
 * the same reason as regicide/handSort.ts -- deck.ts is on the server's real
 * runtime path via gameDef.ts, and this is client presentation.
 */

/** ALL_SUITS is `[...COLOR_SUITS, 'rocket']`, so rockets already land last. */
const suitOrdinal = (card: Card): number => ALL_SUITS.indexOf(card.suit);

const isRocket = (card: Card): number => (card.suit === 'rocket' ? 1 : 0);

export const bySuitThenRank = (a: Card, b: Card): number =>
  suitOrdinal(a) - suitOrdinal(b) || a.rank - b.rank || a.id.localeCompare(b.id);

/**
 * Rockets stay grouped at the end even under the rank preset. They are the
 * trump suit, and scattering rocket 1-4 in among the colour cards of the same
 * numbers is precisely what someone sorting their hand is trying to avoid --
 * a trump's rank means something quite different from a colour card's.
 */
export const byRankThenSuit = (a: Card, b: Card): number =>
  isRocket(a) - isRocket(b) ||
  a.rank - b.rank ||
  suitOrdinal(a) - suitOrdinal(b) ||
  a.id.localeCompare(b.id);
