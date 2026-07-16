import { describe, expect, it } from 'vitest';
import {
  buildCastleRanks,
  buildTavernDeck,
  cardValue,
  enemyAttack,
  enemyHealth,
  JESTER_COUNT,
  MAX_HAND_SIZE,
  SUITS,
} from './deck.js';
import type { FaceCard } from './deck.js';

describe('buildTavernDeck', () => {
  it('is 36 number cards + 4 Animal Companions + the jester count for the given player count', () => {
    for (const count of [2, 3, 4]) {
      const deck = buildTavernDeck(count);
      expect(deck.filter((c) => c.kind === 'number')).toHaveLength(36);
      expect(deck.filter((c) => c.kind === 'companion')).toHaveLength(4);
      expect(deck.filter((c) => c.kind === 'jester')).toHaveLength(JESTER_COUNT[count]!);
    }
  });

  it('matches the rulebook jester/hand-size table', () => {
    expect(JESTER_COUNT).toEqual({ 2: 0, 3: 1, 4: 2 });
    expect(MAX_HAND_SIZE).toEqual({ 2: 7, 3: 6, 4: 5 });
  });
});

describe('buildCastleRanks', () => {
  it('produces 4 cards of each face rank, one per suit', () => {
    const { jacks, queens, kings } = buildCastleRanks();
    for (const group of [jacks, queens, kings]) {
      expect(group).toHaveLength(4);
      expect(new Set(group.map((c) => c.suit))).toEqual(new Set(SUITS));
    }
    expect(jacks.every((c) => c.rank === 'J')).toBe(true);
    expect(queens.every((c) => c.rank === 'Q')).toBe(true);
    expect(kings.every((c) => c.rank === 'K')).toBe(true);
  });
});

describe('cardValue', () => {
  it('matches the rulebook table for every card kind', () => {
    expect(cardValue({ id: 'S7', kind: 'number', suit: 'S', rank: 7 })).toBe(7);
    expect(cardValue({ id: 'SAC', kind: 'companion', suit: 'S' })).toBe(1);
    expect(cardValue({ id: 'Jester1', kind: 'jester' })).toBe(0);
    expect(cardValue({ id: 'SJ', kind: 'face', suit: 'S', rank: 'J' })).toBe(10);
    expect(cardValue({ id: 'SQ', kind: 'face', suit: 'S', rank: 'Q' })).toBe(15);
    expect(cardValue({ id: 'SK', kind: 'face', suit: 'S', rank: 'K' })).toBe(20);
  });
});

describe('enemyAttack / enemyHealth', () => {
  it('matches the rulebook enemy stat table', () => {
    const jack: FaceCard = { id: 'SJ', kind: 'face', suit: 'S', rank: 'J' };
    const queen: FaceCard = { id: 'SQ', kind: 'face', suit: 'S', rank: 'Q' };
    const king: FaceCard = { id: 'SK', kind: 'face', suit: 'S', rank: 'K' };
    expect([enemyAttack(jack), enemyHealth(jack)]).toEqual([10, 20]);
    expect([enemyAttack(queen), enemyHealth(queen)]).toEqual([15, 30]);
    expect([enemyAttack(king), enemyHealth(king)]).toEqual([20, 40]);
  });
});
