import { describe, expect, it } from 'vitest';
import { buildPlayingDeck, buildTaskDeck, dealHands, parseCardId, taskTargetCardId, COMMANDER_CARD_ID } from './deck.js';

describe('crew deck', () => {
  it('buildPlayingDeck produces 40 unique cards: 4 color suits x 1-9, plus rocket 1-4', () => {
    const deck = buildPlayingDeck();
    expect(deck).toHaveLength(40);
    expect(new Set(deck.map((c) => c.id)).size).toBe(40);
    const rockets = deck.filter((c) => c.suit === 'rocket');
    expect(rockets).toHaveLength(4);
    expect(rockets.map((c) => c.rank).sort()).toEqual([1, 2, 3, 4]);
    for (const suit of ['pink', 'blue', 'green', 'yellow'] as const) {
      const suitCards = deck.filter((c) => c.suit === suit);
      expect(suitCards).toHaveLength(9);
      expect(suitCards.map((c) => c.rank).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    }
  });

  it('buildTaskDeck produces 36 unique task cards mirroring the color suits, no rockets', () => {
    const deck = buildTaskDeck();
    expect(deck).toHaveLength(36);
    expect(new Set(deck.map((c) => c.id)).size).toBe(36);
    expect(deck.every((c) => c.suit !== ('rocket' as never))).toBe(true);
  });

  it('taskTargetCardId maps a task card to its corresponding playing card id', () => {
    const [task] = buildTaskDeck();
    const playing = buildPlayingDeck().find((c) => c.id === taskTargetCardId(task!));
    expect(playing).toBeDefined();
    expect(playing?.suit).toBe(task!.suit);
    expect(playing?.rank).toBe(task!.rank);
  });

  it('COMMANDER_CARD_ID identifies the rocket 4', () => {
    const rocket4 = buildPlayingDeck().find((c) => c.id === COMMANDER_CARD_ID);
    expect(rocket4).toEqual({ id: COMMANDER_CARD_ID, suit: 'rocket', rank: 4 });
  });
});

describe('dealHands', () => {
  it('deals evenly at 4 and 5 seats with no leftover cards', () => {
    for (const seatCount of [4, 5]) {
      const seats = Array.from({ length: seatCount }, (_, i) => String(i));
      const hands = dealHands(buildPlayingDeck(), seats);
      const total = Object.values(hands).reduce((sum, h) => sum + h.length, 0);
      expect(total).toBe(40);
      for (const seat of seats) {
        expect(hands[seat]).toHaveLength(40 / seatCount);
      }
    }
  });

  it('deals one extra card to the first seat(s) in round-robin order at 3 seats', () => {
    const seats = ['0', '1', '2'];
    const hands = dealHands(buildPlayingDeck(), seats);
    const total = Object.values(hands).reduce((sum, h) => sum + h.length, 0);
    expect(total).toBe(40);
    const sizes = seats.map((s) => hands[s]!.length).sort((a, b) => b - a);
    expect(sizes).toEqual([14, 13, 13]);
  });

  it('deals no duplicate cards across hands', () => {
    const seats = ['0', '1', '2', '3'];
    const hands = dealHands(buildPlayingDeck(), seats);
    const allIds = Object.values(hands).flatMap((h) => h.map((c) => c.id));
    expect(new Set(allIds).size).toBe(allIds.length);
  });
});

describe('parseCardId', () => {
  it('reconstructs every deck card from its own id', () => {
    for (const card of buildPlayingDeck()) {
      expect(parseCardId(card.id)).toEqual(card);
    }
  });
});
