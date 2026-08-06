import { describe, expect, it } from 'vitest';
import type { Card, Suit } from './deck.js';
import { bySuitThenRank, byRankThenSuit } from './handSort.js';

const card = (suit: Suit, rank: number): Card => ({ id: `${suit}${rank}`, suit, rank });

const sorted = (hand: Card[], cmp: (a: Card, b: Card) => number) => [...hand].sort(cmp).map((c) => c.id);

describe('crew bySuitThenRank', () => {
  it('groups colour suits in COLOR_SUITS order, ascending by rank', () => {
    const hand = [card('green', 4), card('pink', 9), card('blue', 2), card('pink', 1), card('yellow', 5)];
    expect(sorted(hand, bySuitThenRank)).toEqual(['pink1', 'pink9', 'blue2', 'green4', 'yellow5']);
  });

  it('puts rockets last', () => {
    const hand = [card('rocket', 2), card('yellow', 3), card('rocket', 4), card('pink', 8)];
    expect(sorted(hand, bySuitThenRank)).toEqual(['pink8', 'yellow3', 'rocket2', 'rocket4']);
  });
});

describe('crew byRankThenSuit', () => {
  it('groups equal ranks across colour suits', () => {
    const hand = [card('yellow', 3), card('pink', 3), card('green', 7), card('blue', 3)];
    expect(sorted(hand, byRankThenSuit)).toEqual(['pink3', 'blue3', 'yellow3', 'green7']);
  });

  it('STILL keeps rockets grouped at the end -- a rocket 1 does not jump ahead of a pink 2', () => {
    // The whole reason byRankThenSuit carries its own rocket flag: trumps are
    // what a sorting player most wants kept together.
    const hand = [card('rocket', 1), card('pink', 2), card('rocket', 4), card('green', 9)];
    expect(sorted(hand, byRankThenSuit)).toEqual(['pink2', 'green9', 'rocket1', 'rocket4']);
  });

  it('orders rockets among themselves by rank', () => {
    const hand = [card('rocket', 3), card('rocket', 1), card('rocket', 4), card('rocket', 2)];
    expect(sorted(hand, byRankThenSuit)).toEqual(['rocket1', 'rocket2', 'rocket3', 'rocket4']);
  });
});

describe('crew comparators are total orders', () => {
  it('never returns 0 for two distinct cards', () => {
    const hand = [card('pink', 3), card('blue', 3), card('rocket', 3), card('green', 1), card('rocket', 1)];
    for (const a of hand) {
      for (const b of hand) {
        if (a.id === b.id) continue;
        expect(bySuitThenRank(a, b)).not.toBe(0);
        expect(byRankThenSuit(a, b)).not.toBe(0);
      }
    }
  });
});
