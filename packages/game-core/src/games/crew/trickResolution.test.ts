import { describe, expect, it } from 'vitest';
import { isLegalTrickPlay, resolveTrick } from './trickResolution.js';
import type { Card } from './deck.js';

function card(suit: Card['suit'], rank: number): Card {
  return { id: `${suit}${rank}`, suit, rank };
}

describe('isLegalTrickPlay', () => {
  it('any card is legal when leading (ledSuit null)', () => {
    expect(isLegalTrickPlay([card('pink', 3)], null, card('pink', 3))).toBe(true);
  });

  it('must follow the led suit if the hand holds it', () => {
    const hand = [card('pink', 3), card('blue', 5)];
    expect(isLegalTrickPlay(hand, 'pink', card('blue', 5))).toBe(false);
    expect(isLegalTrickPlay(hand, 'pink', card('pink', 3))).toBe(true);
  });

  it('a rocket may only be played against a color lead if the hand has none of that color', () => {
    const handWithColor = [card('pink', 3), card('rocket', 2)];
    expect(isLegalTrickPlay(handWithColor, 'pink', card('rocket', 2))).toBe(false);
    const handWithoutColor = [card('blue', 3), card('rocket', 2)];
    expect(isLegalTrickPlay(handWithoutColor, 'pink', card('rocket', 2))).toBe(true);
  });

  it('rocket-led trick must be followed with a rocket if the hand holds one', () => {
    const hand = [card('rocket', 1), card('pink', 9)];
    expect(isLegalTrickPlay(hand, 'rocket', card('pink', 9))).toBe(false);
    expect(isLegalTrickPlay(hand, 'rocket', card('rocket', 1))).toBe(true);
  });

  it('any card is legal once the hand has none of the led suit', () => {
    const hand = [card('blue', 3), card('green', 9)];
    expect(isLegalTrickPlay(hand, 'pink', card('green', 9))).toBe(true);
  });
});

describe('resolveTrick', () => {
  it('the highest card of the led suit wins when no rockets are played', () => {
    const result = resolveTrick([
      { seatID: '0', card: card('yellow', 8) },
      { seatID: '1', card: card('yellow', 2) },
      { seatID: '2', card: card('yellow', 6) },
    ]);
    expect(result).toEqual({ winnerSeatID: '0', winningCard: card('yellow', 8) });
  });

  it('an off-suit card never wins, even with a higher rank', () => {
    const result = resolveTrick([
      { seatID: '0', card: card('green', 3) },
      { seatID: '1', card: card('yellow', 9) },
    ]);
    expect(result.winnerSeatID).toBe('0');
  });

  it('a rocket always beats any color card, regardless of led suit', () => {
    const result = resolveTrick([
      { seatID: '0', card: card('blue', 3) },
      { seatID: '1', card: card('rocket', 1) },
    ]);
    expect(result).toEqual({ winnerSeatID: '1', winningCard: card('rocket', 1) });
  });

  it('among multiple rockets in one trick, the highest rocket wins', () => {
    const result = resolveTrick([
      { seatID: '0', card: card('rocket', 3) },
      { seatID: '1', card: card('rocket', 1) },
      { seatID: '2', card: card('blue', 9) },
      { seatID: '3', card: card('rocket', 4) },
    ]);
    expect(result).toEqual({ winnerSeatID: '3', winningCard: card('rocket', 4) });
  });

  it('a rocket-led trick is won by the highest rocket among those who followed', () => {
    const result = resolveTrick([
      { seatID: '0', card: card('rocket', 2) },
      { seatID: '1', card: card('pink', 9) },
      { seatID: '2', card: card('rocket', 4) },
    ]);
    expect(result).toEqual({ winnerSeatID: '2', winningCard: card('rocket', 4) });
  });
});
