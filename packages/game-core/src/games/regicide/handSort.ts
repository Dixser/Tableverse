import { SUITS, type Card } from './deck.js';

/**
 * Sort presets for feature 031's hand arrangement. Deliberately NOT in
 * deck.ts: that module is imported by gameDef.ts, which is on
 * packages/server's real Node runtime path, and how a player likes their
 * cards laid out is purely a client-presentation concern. Pure functions
 * either way, so still testable in the default `node` environment.
 */

const FACE_ORDINAL: Record<'J' | 'Q' | 'K', number> = { J: 11, Q: 12, K: 13 };

/**
 * A single rank axis across the whole Card union: Animal Companion sorts as
 * the Ace it is (1), numbers 2-10 as themselves, J/Q/K as 11/12/13.
 *
 * Deliberately NOT deck.ts's `cardValue`, despite the overlap: cardValue is
 * the rulebook's *attack/discard value*, which returns 10 for both a 10 and a
 * Jack (they'd sort as equals) and 0 for a Jester (which would sort Jesters to
 * the very front of the hand). Those are correct for combat maths and wrong
 * for a hand layout.
 */
export function rankOrdinal(card: Card): number {
  switch (card.kind) {
    case 'companion':
      return 1;
    case 'number':
      return card.rank;
    case 'face':
      return FACE_ORDINAL[card.rank];
    case 'jester':
      return Number.MAX_SAFE_INTEGER;
  }
}

/** The Jester has no suit at all, so it sorts after every real suit under both presets. */
function suitOrdinal(card: Card): number {
  return card.kind === 'jester' ? SUITS.length : SUITS.indexOf(card.suit);
}

/**
 * Every comparator here ends in an id tiebreak so it is a TOTAL order --
 * without it, two Jesters (`Jester1`/`Jester2`) compare equal and their
 * relative position depends on Array.prototype.sort's stability plus whatever
 * order they happened to arrive in.
 */
export const bySuitThenRank = (a: Card, b: Card): number =>
  suitOrdinal(a) - suitOrdinal(b) || rankOrdinal(a) - rankOrdinal(b) || a.id.localeCompare(b.id);

export const byRankThenSuit = (a: Card, b: Card): number =>
  rankOrdinal(a) - rankOrdinal(b) || suitOrdinal(a) - suitOrdinal(b) || a.id.localeCompare(b.id);
