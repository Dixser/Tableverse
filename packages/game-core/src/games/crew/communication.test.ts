import { describe, expect, it } from 'vitest';
import { isHighestOfSuit, isLowestOfSuit, isOnlyOfSuit } from './communication.js';
import type { Card } from './deck.js';

function card(suit: Card['suit'], rank: number): Card {
  return { id: `${suit}${rank}`, suit, rank };
}

describe('communication claims', () => {
  const hand = [card('pink', 2), card('pink', 8), card('blue', 6), card('yellow', 9)];

  it('isHighestOfSuit is true only for the max rank of that suit', () => {
    expect(isHighestOfSuit(hand, card('pink', 8))).toBe(true);
    expect(isHighestOfSuit(hand, card('pink', 2))).toBe(false);
  });

  it('isLowestOfSuit is true only for the min rank of that suit', () => {
    expect(isLowestOfSuit(hand, card('pink', 2))).toBe(true);
    expect(isLowestOfSuit(hand, card('pink', 8))).toBe(false);
  });

  it('isOnlyOfSuit is true only when exactly one card of that suit is held', () => {
    expect(isOnlyOfSuit(hand, card('blue', 6))).toBe(true);
    expect(isOnlyOfSuit(hand, card('pink', 8))).toBe(false);
  });

  it('a single card of a suit is simultaneously highest, lowest, and only', () => {
    expect(isHighestOfSuit(hand, card('yellow', 9))).toBe(true);
    expect(isLowestOfSuit(hand, card('yellow', 9))).toBe(true);
    expect(isOnlyOfSuit(hand, card('yellow', 9))).toBe(true);
  });

  it('a middling card of a 3+ suit is none of the three', () => {
    const wideHand = [card('pink', 2), card('pink', 5), card('pink', 8)];
    expect(isHighestOfSuit(wideHand, card('pink', 5))).toBe(false);
    expect(isLowestOfSuit(wideHand, card('pink', 5))).toBe(false);
    expect(isOnlyOfSuit(wideHand, card('pink', 5))).toBe(false);
  });
});
