import { describe, expect, it } from 'vitest';
import type { Card, Color } from './deck.js';
import { byColorThenNumber, byNumberThenColor } from './handSort.js';

const card = (color: Color, number: number, copy = 0): Card => ({
  id: `${color}${number}-${copy}`,
  color,
  number,
});

const sorted = (hand: Card[], cmp: (a: Card, b: Card) => number) => [...hand].sort(cmp).map((c) => c.id);

describe('cahoots byColorThenNumber', () => {
  it('groups colours in COLORS order (blue, yellow, red, green), ascending by number', () => {
    const hand = [card('green', 2), card('blue', 7), card('red', 1), card('yellow', 4)];
    expect(sorted(hand, byColorThenNumber)).toEqual(['blue7-0', 'yellow4-0', 'red1-0', 'green2-0']);
  });

  it('keeps the two copies of a colour/number pair adjacent and in a deterministic order', () => {
    const hand = [card('blue', 3, 1), card('red', 5), card('blue', 3, 0)];
    expect(sorted(hand, byColorThenNumber)).toEqual(['blue3-0', 'blue3-1', 'red5-0']);
  });
});

describe('cahoots byNumberThenColor', () => {
  it('groups equal numbers across colours', () => {
    const hand = [card('green', 5), card('blue', 2), card('red', 5), card('blue', 5)];
    expect(sorted(hand, byNumberThenColor)).toEqual(['blue2-0', 'blue5-0', 'red5-0', 'green5-0']);
  });

  it('keeps duplicate copies adjacent and deterministic', () => {
    const hand = [card('yellow', 6, 1), card('yellow', 6, 0), card('blue', 6)];
    expect(sorted(hand, byNumberThenColor)).toEqual(['blue6-0', 'yellow6-0', 'yellow6-1']);
  });
});

describe('cahoots comparators are total orders', () => {
  it('never returns 0 for two distinct cards, including duplicate copies', () => {
    const hand = [card('blue', 3, 0), card('blue', 3, 1), card('red', 3), card('blue', 7)];
    for (const a of hand) {
      for (const b of hand) {
        if (a.id === b.id) continue;
        expect(byColorThenNumber(a, b)).not.toBe(0);
        expect(byNumberThenColor(a, b)).not.toBe(0);
      }
    }
  });
});
