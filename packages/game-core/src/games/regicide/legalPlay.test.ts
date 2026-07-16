import { describe, expect, it } from 'vitest';
import { isLegalSelection } from './legalPlay.js';
import type { CompanionCard, FaceCard, JesterCard, NumberCard, Suit } from './deck.js';

const num = (suit: Suit, rank: NumberCard['rank']): NumberCard => ({
  id: `${suit}${rank}`,
  kind: 'number',
  suit,
  rank,
});
const ac = (suit: Suit): CompanionCard => ({ id: `${suit}AC`, kind: 'companion', suit });
const face = (suit: Suit, rank: FaceCard['rank']): FaceCard => ({
  id: `${suit}${rank}`,
  kind: 'face',
  suit,
  rank,
});
const jester: JesterCard = { id: 'Jester1', kind: 'jester' };

describe('isLegalSelection', () => {
  it('rejects an empty selection', () => {
    expect(isLegalSelection([])).toBe(false);
  });

  it('accepts any single card, including a lone Jester and a lone face card', () => {
    expect(isLegalSelection([num('S', 7)])).toBe(true);
    expect(isLegalSelection([jester])).toBe(true);
    expect(isLegalSelection([face('S', 'J')])).toBe(true);
    expect(isLegalSelection([ac('S')])).toBe(true);
  });

  it('accepts a same-rank numeric combo of 2-4 cards summing to <= 10', () => {
    expect(isLegalSelection([num('S', 5), num('H', 5)])).toBe(true); // 10, the ceiling
    expect(isLegalSelection([num('S', 2), num('H', 2), num('D', 2)])).toBe(true);
    expect(isLegalSelection([num('S', 2), num('H', 2), num('D', 2), num('C', 2)])).toBe(true);
  });

  it('rejects a numeric combo summing over 10, of mismatched ranks, or of size > 4', () => {
    expect(isLegalSelection([num('S', 6), num('H', 6)])).toBe(false); // 12 > 10
    expect(isLegalSelection([num('S', 3), num('H', 4)])).toBe(false); // mismatched ranks
    expect(isLegalSelection([num('S', 2), num('H', 2), num('D', 2), num('C', 2), num('S', 3)])).toBe(false);
  });

  it('rejects a numeric combo including a face card, and an Animal Companion added to a 3+ card group', () => {
    expect(isLegalSelection([num('S', 5), face('H', 'J')])).toBe(false);
    expect(isLegalSelection([num('S', 2), num('H', 2), ac('D')])).toBe(false);
  });

  it('accepts an Animal Companion paired with exactly one other card (number, face, or another Companion)', () => {
    expect(isLegalSelection([ac('C'), num('D', 8)])).toBe(true);
    expect(isLegalSelection([ac('C'), face('D', 'K')])).toBe(true);
    expect(isLegalSelection([ac('C'), ac('D')])).toBe(true);
  });

  it('rejects an Animal Companion paired with a Jester or with more than one other card', () => {
    expect(isLegalSelection([ac('C'), jester])).toBe(false);
    expect(isLegalSelection([ac('C'), num('D', 8), num('D', 9)])).toBe(false);
  });

  it('rejects a Jester combined with anything', () => {
    expect(isLegalSelection([jester, num('S', 2)])).toBe(false);
  });
});
