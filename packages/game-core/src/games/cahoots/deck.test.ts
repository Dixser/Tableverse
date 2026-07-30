import { describe, expect, it } from 'vitest';
import { buildDeck, isLegalPlacement, COLORS } from './deck.js';

describe('cahoots deck', () => {
  it('builds 56 unique cards: 4 colors x 1-7, two copies of each', () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(56);
    expect(new Set(deck.map((c) => c.id)).size).toBe(56);
    for (const color of COLORS) {
      const colorCards = deck.filter((c) => c.color === color);
      expect(colorCards).toHaveLength(14);
      for (let number = 1; number <= 7; number++) {
        expect(colorCards.filter((c) => c.number === number)).toHaveLength(2);
      }
    }
  });
});

describe('isLegalPlacement', () => {
  it('accepts a matching color', () => {
    expect(isLegalPlacement({ id: 'a', color: 'blue', number: 5 }, { id: 'b', color: 'blue', number: 2 })).toBe(true);
  });

  it('accepts a matching number', () => {
    expect(isLegalPlacement({ id: 'a', color: 'blue', number: 5 }, { id: 'b', color: 'red', number: 5 })).toBe(true);
  });

  it('accepts a match on both color and number', () => {
    expect(isLegalPlacement({ id: 'a', color: 'blue', number: 5 }, { id: 'b', color: 'blue', number: 5 })).toBe(true);
  });

  it('rejects a card matching neither', () => {
    expect(isLegalPlacement({ id: 'a', color: 'blue', number: 5 }, { id: 'b', color: 'red', number: 2 })).toBe(false);
  });
});
