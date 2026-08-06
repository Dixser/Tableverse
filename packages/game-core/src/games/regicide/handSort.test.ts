import { describe, expect, it } from 'vitest';
import type { Card } from './deck.js';
import { bySuitThenRank, byRankThenSuit, rankOrdinal } from './handSort.js';

const num = (suit: 'S' | 'H' | 'D' | 'C', rank: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10): Card => ({
  id: `${suit}${rank}`,
  kind: 'number',
  suit,
  rank,
});
const companion = (suit: 'S' | 'H' | 'D' | 'C'): Card => ({ id: `${suit}AC`, kind: 'companion', suit });
const face = (suit: 'S' | 'H' | 'D' | 'C', rank: 'J' | 'Q' | 'K'): Card => ({
  id: `${suit}${rank}`,
  kind: 'face',
  suit,
  rank,
});
const jester = (n: number): Card => ({ id: `Jester${n}`, kind: 'jester' });

const sorted = (hand: Card[], cmp: (a: Card, b: Card) => number) => [...hand].sort(cmp).map((c) => c.id);

describe('regicide rankOrdinal', () => {
  it('sorts a 10 strictly before a Jack -- the collision cardValue would have', () => {
    // cardValue() returns 10 for BOTH, which is why this feature has its own ordinal.
    expect(rankOrdinal(num('S', 10))).toBeLessThan(rankOrdinal(face('S', 'J')));
  });

  it('treats an Animal Companion as the Ace it is, below the 2', () => {
    expect(rankOrdinal(companion('H'))).toBe(1);
    expect(rankOrdinal(companion('H'))).toBeLessThan(rankOrdinal(num('H', 2)));
  });

  it('orders J < Q < K', () => {
    expect(rankOrdinal(face('D', 'J'))).toBeLessThan(rankOrdinal(face('D', 'Q')));
    expect(rankOrdinal(face('D', 'Q'))).toBeLessThan(rankOrdinal(face('D', 'K')));
  });

  it('ranks the Jester above every real card, not at 0 like cardValue', () => {
    expect(rankOrdinal(jester(1))).toBeGreaterThan(rankOrdinal(face('S', 'K')));
  });
});

describe('regicide bySuitThenRank', () => {
  it('groups suits in SUITS order (S, H, D, C)', () => {
    const hand = [num('C', 5), num('H', 3), num('S', 9), num('D', 2)];
    expect(sorted(hand, bySuitThenRank)).toEqual(['S9', 'H3', 'D2', 'C5']);
  });

  it('orders within a suit companion -> numbers -> face', () => {
    const hand = [face('H', 'Q'), num('H', 7), companion('H'), num('H', 2), face('H', 'J')];
    expect(sorted(hand, bySuitThenRank)).toEqual(['HAC', 'H2', 'H7', 'HJ', 'HQ']);
  });

  it('puts a Jester last', () => {
    const hand = [jester(1), num('S', 4), num('C', 8)];
    expect(sorted(hand, bySuitThenRank)).toEqual(['S4', 'C8', 'Jester1']);
  });
});

describe('regicide byRankThenSuit', () => {
  it('groups equal ranks across suits', () => {
    const hand = [num('C', 5), num('S', 5), num('H', 9), num('D', 5)];
    expect(sorted(hand, byRankThenSuit)).toEqual(['S5', 'D5', 'C5', 'H9']);
  });

  it('still puts a Jester last', () => {
    const hand = [jester(1), face('S', 'K'), num('H', 2)];
    expect(sorted(hand, byRankThenSuit)).toEqual(['H2', 'SK', 'Jester1']);
  });

  it('sorts a 10 before a Jack', () => {
    const hand = [face('C', 'J'), num('S', 10)];
    expect(sorted(hand, byRankThenSuit)).toEqual(['S10', 'CJ']);
  });
});

describe('regicide comparators are total orders', () => {
  it('orders two Jesters deterministically under both presets', () => {
    const hand = [jester(2), jester(1)];
    expect(sorted(hand, bySuitThenRank)).toEqual(['Jester1', 'Jester2']);
    expect(sorted(hand, byRankThenSuit)).toEqual(['Jester1', 'Jester2']);
  });

  it('never returns 0 for two distinct cards', () => {
    const hand = [num('S', 5), num('H', 5), companion('S'), jester(1), jester(2), face('D', 'K')];
    for (const a of hand) {
      for (const b of hand) {
        if (a.id === b.id) continue;
        expect(bySuitThenRank(a, b)).not.toBe(0);
        expect(byRankThenSuit(a, b)).not.toBe(0);
      }
    }
  });
});
