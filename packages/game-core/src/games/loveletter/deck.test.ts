import { describe, expect, it } from 'vitest';
import { buildDeck, type CardRank } from './deck.js';

function countByRank(deck: CardRank[]): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const rank of deck) {
    counts[rank] = (counts[rank] ?? 0) + 1;
  }
  return counts;
}

describe('buildDeck', () => {
  it('normal edition has 21 cards with the correct per-rank counts', () => {
    const deck = buildDeck('normal');
    expect(deck).toHaveLength(21);
    expect(countByRank(deck)).toEqual({
      0: 2,
      1: 6,
      2: 2,
      3: 2,
      4: 2,
      5: 2,
      6: 2,
      7: 1,
      8: 1,
      9: 1,
    });
  });

  it('classic edition has 16 cards with the correct per-rank counts', () => {
    const deck = buildDeck('classic');
    expect(deck).toHaveLength(16);
    expect(countByRank(deck)).toEqual({
      1: 5,
      2: 2,
      3: 2,
      4: 2,
      5: 2,
      7: 1,
      8: 1,
      9: 1,
    });
  });
});
