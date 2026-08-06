// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useHandOrder } from './useHandOrder.js';

interface TestCard {
  id: string;
  rank: number;
}

const card = (id: string, rank: number): TestCard => ({ id, rank });

/** Ascending by rank -- stands in for a real game's own comparator. */
const byRank = (a: TestCard, b: TestCard) => a.rank - b.rank;

function mount(hand: TestCard[]) {
  return renderHook((props: TestCard[]) => useHandOrder(props), { initialProps: hand });
}

describe('useHandOrder', () => {
  it('starts in raw server order and reports itself uncustomised', () => {
    const { result } = mount([card('a', 3), card('b', 1), card('c', 2)]);

    expect(result.current.orderedHand.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(result.current.itemIds).toEqual(['a', 'b', 'c']);
    expect(result.current.isCustomised).toBe(false);
  });

  it('moveCard reorders and marks the hand customised', () => {
    const { result } = mount([card('a', 3), card('b', 1), card('c', 2)]);

    act(() => result.current.moveCard('c', 'a'));

    expect(result.current.orderedHand.map((c) => c.id)).toEqual(['c', 'a', 'b']);
    expect(result.current.isCustomised).toBe(true);
  });

  it('moveCard is a no-op when the two ids are the same', () => {
    const { result } = mount([card('a', 3), card('b', 1)]);

    act(() => result.current.moveCard('a', 'a'));

    expect(result.current.orderedHand.map((c) => c.id)).toEqual(['a', 'b']);
    expect(result.current.isCustomised).toBe(false);
  });

  it('moveCard is a no-op for an id that is not in hand', () => {
    const { result } = mount([card('a', 3), card('b', 1)]);

    act(() => result.current.moveCard('a', 'gone'));

    expect(result.current.orderedHand.map((c) => c.id)).toEqual(['a', 'b']);
    expect(result.current.isCustomised).toBe(false);
  });

  it('applySort applies the supplied comparator', () => {
    const { result } = mount([card('a', 3), card('b', 1), card('c', 2)]);

    act(() => result.current.applySort(byRank));

    expect(result.current.orderedHand.map((c) => c.id)).toEqual(['b', 'c', 'a']);
    expect(result.current.itemIds).toEqual(['b', 'c', 'a']);
    expect(result.current.isCustomised).toBe(true);
  });

  it('keeps the custom order and puts a newly drawn card last', () => {
    const hand = [card('a', 3), card('b', 1), card('c', 2)];
    const { result, rerender } = mount(hand);

    act(() => result.current.applySort(byRank));
    expect(result.current.orderedHand.map((c) => c.id)).toEqual(['b', 'c', 'a']);

    // The server appends a drawn card (`hand.push(...)`) -- rank 0 would sort
    // FIRST, and must not: it lands at the end until the player re-sorts.
    rerender([...hand, card('d', 0)]);

    expect(result.current.orderedHand.map((c) => c.id)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('drops a played card and closes the gap without losing the custom order', () => {
    const hand = [card('a', 3), card('b', 1), card('c', 2)];
    const { result, rerender } = mount(hand);

    act(() => result.current.applySort(byRank));
    rerender([card('a', 3), card('b', 1)]);

    expect(result.current.orderedHand.map((c) => c.id)).toEqual(['b', 'a']);
    expect(result.current.orderedHand).toHaveLength(2);
  });

  it('falls back to server order when the whole hand is replaced (seat switch)', () => {
    const { result, rerender } = mount([card('a', 3), card('b', 1)]);

    act(() => result.current.moveCard('b', 'a'));
    rerender([card('x', 5), card('y', 4)]);

    expect(result.current.orderedHand.map((c) => c.id)).toEqual(['x', 'y']);
  });

  it('resetOrder returns to server order and clears isCustomised', () => {
    const { result } = mount([card('a', 3), card('b', 1), card('c', 2)]);

    act(() => result.current.applySort(byRank));
    act(() => result.current.resetOrder());

    expect(result.current.orderedHand.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(result.current.isCustomised).toBe(false);
  });

  it('keeps orderedHand the same length as the server hand through churn', () => {
    const { result, rerender } = mount([card('a', 3), card('b', 1), card('c', 2)]);

    act(() => result.current.applySort(byRank));
    rerender([card('b', 1), card('c', 2), card('d', 9), card('e', 8)]);

    expect(result.current.orderedHand).toHaveLength(4);
    expect(result.current.orderedHand.every(Boolean)).toBe(true);
    expect(result.current.itemIds).toEqual(result.current.orderedHand.map((c) => c.id));
  });

  it('survives an empty hand', () => {
    const { result } = mount([]);

    expect(result.current.orderedHand).toEqual([]);
    expect(result.current.itemIds).toEqual([]);
  });
});
