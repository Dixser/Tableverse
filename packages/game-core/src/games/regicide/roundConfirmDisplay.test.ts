import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import { resolveRoundConfirmDisplay } from './roundConfirmDisplay.js';

const t = ((key: string) => key) as TFunction;

describe('resolveRoundConfirmDisplay', () => {
  it('returns null when there is no wait in progress', () => {
    expect(resolveRoundConfirmDisplay(null, null, '0', {}, t)).toBeNull();
  });

  it('computes confirmed/total counts and pending names', () => {
    const display = resolveRoundConfirmDisplay(
      { pendingSeatIDs: ['0', '1', '2'], confirmedSeatIDs: ['0'] },
      null,
      '1',
      { '1': 'Bob', '2': 'Carol' },
      t,
    );
    expect(display).toEqual({
      confirmedCount: 1,
      totalCount: 3,
      pendingNames: ['Bob', 'Carol'],
      canConfirm: true,
      canForceAdvance: false,
    });
  });

  it('canConfirm is false once the viewer has already confirmed', () => {
    const display = resolveRoundConfirmDisplay(
      { pendingSeatIDs: ['0', '1'], confirmedSeatIDs: ['0'] },
      null,
      '0',
      {},
      t,
    );
    expect(display?.canConfirm).toBe(false);
  });

  it('canForceAdvance is true only for the host seat while someone is still pending', () => {
    const state = { pendingSeatIDs: ['0', '1'], confirmedSeatIDs: [] };
    expect(resolveRoundConfirmDisplay(state, '0', '0', {}, t)?.canForceAdvance).toBe(true);
    expect(resolveRoundConfirmDisplay(state, '0', '1', {}, t)?.canForceAdvance).toBe(false);
    expect(resolveRoundConfirmDisplay(state, null, '0', {}, t)?.canForceAdvance).toBe(false);
  });

  it('canForceAdvance is false once every seat has confirmed', () => {
    const state = { pendingSeatIDs: ['0', '1'], confirmedSeatIDs: ['0', '1'] };
    expect(resolveRoundConfirmDisplay(state, '0', '0', {}, t)?.canForceAdvance).toBe(false);
  });
});
