import { describe, expect, it } from 'vitest';
import { resolveDragTarget } from './dragTarget.js';

const hand = ['blue3-0', 'blue3-1', 'red5-0', 'green1-0'];

describe('resolveDragTarget', () => {
  it('resolves a pile droppable id to its index', () => {
    expect(resolveDragTarget('pile-0', hand)).toEqual({ kind: 'pile', pileIndex: 0 });
    expect(resolveDragTarget('pile-3', hand)).toEqual({ kind: 'pile', pileIndex: 3 });
  });

  it('resolves a hand card id to a reorder', () => {
    expect(resolveDragTarget('red5-0', hand)).toEqual({ kind: 'reorder', overCardId: 'red5-0' });
  });

  it('distinguishes the two copies of the same colour/number pair', () => {
    expect(resolveDragTarget('blue3-1', hand)).toEqual({ kind: 'reorder', overCardId: 'blue3-1' });
  });

  it('rejects a malformed pile id rather than guessing at an index', () => {
    expect(resolveDragTarget('pile-x', hand)).toEqual({ kind: 'none' });
    expect(resolveDragTarget('pile-', hand)).toEqual({ kind: 'none' });
    expect(resolveDragTarget('pile-1.5', hand)).toEqual({ kind: 'none' });
    expect(resolveDragTarget('pile--1', hand)).toEqual({ kind: 'none' });
  });

  it('rejects a card id that is not in this hand', () => {
    expect(resolveDragTarget('yellow7-0', hand)).toEqual({ kind: 'none' });
  });

  it('treats a missing drop target as nothing -- dropping in empty space submits no move', () => {
    expect(resolveDragTarget(undefined, hand)).toEqual({ kind: 'none' });
    expect(resolveDragTarget(null, hand)).toEqual({ kind: 'none' });
  });

  it('rejects a numeric UniqueIdentifier, which nothing in this board registers', () => {
    expect(resolveDragTarget(3, hand)).toEqual({ kind: 'none' });
  });

  it('resolves nothing against an empty hand except piles', () => {
    expect(resolveDragTarget('blue3-0', [])).toEqual({ kind: 'none' });
    expect(resolveDragTarget('pile-2', [])).toEqual({ kind: 'pile', pileIndex: 2 });
  });
});
