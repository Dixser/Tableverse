import { COLORS, type Card } from './deck.js';

/**
 * Sort presets for feature 031's hand arrangement. Kept out of deck.ts for
 * the same reason as regicide/handSort.ts -- deck.ts is on the server's real
 * runtime path via gameDef.ts, and this is client presentation.
 */

const colorOrdinal = (card: Card): number => COLORS.indexOf(card.color);

/**
 * The id tiebreak matters more here than in the other two games: this deck
 * holds TWO copies of every colour/number pair (`blue3-0`, `blue3-1`), so
 * without it the duplicates compare equal and their order depends on
 * Array.prototype.sort's stability rather than on anything deliberate.
 */
export const byColorThenNumber = (a: Card, b: Card): number =>
  colorOrdinal(a) - colorOrdinal(b) || a.number - b.number || a.id.localeCompare(b.id);

export const byNumberThenColor = (a: Card, b: Card): number =>
  a.number - b.number || colorOrdinal(a) - colorOrdinal(b) || a.id.localeCompare(b.id);
