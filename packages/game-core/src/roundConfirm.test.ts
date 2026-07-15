import { describe, expect, it } from 'vitest';
import {
  beginRoundConfirm,
  confirmRoundReadyMove,
  forceAdvanceRoundMove,
  isRoundConfirmComplete,
  type RoundConfirmG,
} from './roundConfirm.js';
import { INVALID_MOVE } from './vendor.js';

function makeG(overrides: Partial<RoundConfirmG> = {}): RoundConfirmG {
  return { roundConfirm: null, hostPlayerID: null, ...overrides };
}

describe('beginRoundConfirm', () => {
  it('sets pendingSeatIDs from the given active seats and starts with nobody confirmed', () => {
    const G = makeG();
    beginRoundConfirm(G, ['0', '1', '2']);
    expect(G.roundConfirm).toEqual({
      pendingSeatIDs: ['0', '1', '2'],
      confirmedSeatIDs: [],
    });
  });

  it('copies the seat list rather than aliasing it, so later mutation of the source array is not reflected', () => {
    const G = makeG();
    const seats = ['0', '1'];
    beginRoundConfirm(G, seats);
    seats.push('2');
    expect(G.roundConfirm!.pendingSeatIDs).toEqual(['0', '1']);
  });
});

describe('isRoundConfirmComplete', () => {
  it('is false when there is no wait in progress at all', () => {
    expect(isRoundConfirmComplete(null)).toBe(false);
  });

  it('is false while any pending seat has not yet confirmed', () => {
    expect(
      isRoundConfirmComplete({ pendingSeatIDs: ['0', '1'], confirmedSeatIDs: ['0'] }),
    ).toBe(false);
  });

  it('is true once every pending seat has confirmed', () => {
    expect(
      isRoundConfirmComplete({ pendingSeatIDs: ['0', '1'], confirmedSeatIDs: ['1', '0'] }),
    ).toBe(true);
  });

  it('is true for an empty pending list (vacuously complete)', () => {
    expect(isRoundConfirmComplete({ pendingSeatIDs: [], confirmedSeatIDs: [] })).toBe(true);
  });
});

describe('confirmRoundReadyMove', () => {
  it('rejects when there is no wait in progress', () => {
    const G = makeG();
    expect(confirmRoundReadyMove({ G, playerID: '0' })).toBe(INVALID_MOVE);
  });

  it("rejects a seat that isn't in pendingSeatIDs (not part of this wait)", () => {
    const G = makeG();
    beginRoundConfirm(G, ['0', '1']);
    expect(confirmRoundReadyMove({ G, playerID: '2' })).toBe(INVALID_MOVE);
    expect(G.roundConfirm!.confirmedSeatIDs).toEqual([]);
  });

  it('adds a pending seat to confirmedSeatIDs', () => {
    const G = makeG();
    beginRoundConfirm(G, ['0', '1']);
    confirmRoundReadyMove({ G, playerID: '0' });
    expect(G.roundConfirm!.confirmedSeatIDs).toEqual(['0']);
  });

  it('is idempotent -- confirming the same seat twice does not duplicate it', () => {
    const G = makeG();
    beginRoundConfirm(G, ['0', '1']);
    confirmRoundReadyMove({ G, playerID: '0' });
    confirmRoundReadyMove({ G, playerID: '0' });
    expect(G.roundConfirm!.confirmedSeatIDs).toEqual(['0']);
  });
});

describe('forceAdvanceRoundMove', () => {
  it('rejects when there is no wait in progress', () => {
    const G = makeG({ hostPlayerID: '0' });
    expect(forceAdvanceRoundMove({ G, playerID: '0' })).toBe(INVALID_MOVE);
  });

  it('rejects a caller who is not the host seat', () => {
    const G = makeG({ hostPlayerID: '0' });
    beginRoundConfirm(G, ['0', '1']);
    expect(forceAdvanceRoundMove({ G, playerID: '1' })).toBe(INVALID_MOVE);
    expect(G.roundConfirm!.confirmedSeatIDs).toEqual([]);
  });

  it('rejects any caller when hostPlayerID is null (host has no seat in this match)', () => {
    const G = makeG({ hostPlayerID: null });
    beginRoundConfirm(G, ['0', '1']);
    expect(forceAdvanceRoundMove({ G, playerID: '0' })).toBe(INVALID_MOVE);
  });

  it('rejects a null/unset caller playerID even when hostPlayerID is also null, rather than treating null === null as a match', () => {
    const G = makeG({ hostPlayerID: null });
    beginRoundConfirm(G, ['0', '1']);
    expect(
      forceAdvanceRoundMove({ G, playerID: null as unknown as string }),
    ).toBe(INVALID_MOVE);
  });

  it('marks every still-pending seat confirmed at once when called by the host seat', () => {
    const G = makeG({ hostPlayerID: '0' });
    beginRoundConfirm(G, ['0', '1', '2']);
    confirmRoundReadyMove({ G, playerID: '1' }); // one seat already confirmed on its own
    forceAdvanceRoundMove({ G, playerID: '0' });
    expect(isRoundConfirmComplete(G.roundConfirm)).toBe(true);
    expect(G.roundConfirm!.confirmedSeatIDs.sort()).toEqual(['0', '1', '2']);
  });
});
