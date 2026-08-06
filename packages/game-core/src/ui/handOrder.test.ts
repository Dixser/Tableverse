import { describe, expect, it } from 'vitest';
import { reconcileOrder } from './handOrder.js';

describe('reconcileOrder', () => {
  it('returns the server order untouched when the player has no preference', () => {
    expect(reconcileOrder([], ['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('preserves a custom order', () => {
    expect(reconcileOrder(['c', 'a', 'b'], ['a', 'b', 'c'])).toEqual(['c', 'a', 'b']);
  });

  it('appends a newly drawn card at the END, not sorted into place', () => {
    // The whole point of feature 031's "drawn cards land at the edge"
    // trade-off -- a draw must never silently rearrange a sorted hand.
    expect(reconcileOrder(['c', 'a', 'b'], ['a', 'b', 'c', 'd'])).toEqual(['c', 'a', 'b', 'd']);
  });

  it('appends several newly drawn cards in server order', () => {
    expect(reconcileOrder(['b', 'a'], ['a', 'b', 'c', 'd'])).toEqual(['b', 'a', 'c', 'd']);
  });

  it('drops a played card and closes the gap', () => {
    expect(reconcileOrder(['c', 'a', 'b'], ['a', 'c'])).toEqual(['c', 'a']);
  });

  it('falls back to pure server order when every remembered id is gone (seat switch)', () => {
    expect(reconcileOrder(['c', 'a', 'b'], ['x', 'y'])).toEqual(['x', 'y']);
  });

  it('handles a simultaneous play and draw', () => {
    // Cahoots: playCard splices the played card out and pushes a drawn one.
    expect(reconcileOrder(['d', 'b', 'a', 'c'], ['a', 'c', 'd', 'e'])).toEqual(['d', 'a', 'c', 'e']);
  });

  it('collapses duplicates in the preference, keeping length equal to the server hand', () => {
    const result = reconcileOrder(['a', 'a', 'b'], ['a', 'b', 'c']);
    expect(result).toEqual(['a', 'b', 'c']);
    expect(result).toHaveLength(3);
  });

  it('returns an empty array for an empty hand', () => {
    expect(reconcileOrder(['a', 'b'], [])).toEqual([]);
    expect(reconcileOrder([], [])).toEqual([]);
  });

  it('never returns an id that is not in the server hand', () => {
    const actual = ['a', 'b'];
    const result = reconcileOrder(['z', 'b', 'q', 'a'], actual);
    expect(result.every((id) => actual.includes(id))).toBe(true);
    expect(result).toEqual(['b', 'a']);
  });
});
