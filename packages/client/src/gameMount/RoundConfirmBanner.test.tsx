// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RoundConfirmBanner, resolveRoundConfirmDisplay } from './RoundConfirmBanner.js';
import i18n from '../i18n/i18n.js';

const NAMES = { '0': 'Alice', '1': 'Bob', '2': 'Carol' };
const tEn = i18n.getFixedT('en');

describe('resolveRoundConfirmDisplay', () => {
  it('returns null when roundConfirm is null (no wait in progress)', () => {
    expect(resolveRoundConfirmDisplay(null, null, '0', NAMES, tEn)).toBeNull();
  });

  it('returns null for a non-conforming shape (defensive, same posture as resolveGameoverMessage)', () => {
    expect(resolveRoundConfirmDisplay({ foo: 'bar' }, null, '0', NAMES, tEn)).toBeNull();
    expect(resolveRoundConfirmDisplay('not an object', null, '0', NAMES, tEn)).toBeNull();
  });

  it('reports the confirmed/total counts', () => {
    const display = resolveRoundConfirmDisplay(
      { pendingSeatIDs: ['0', '1', '2'], confirmedSeatIDs: ['0', '1'] },
      null,
      '2',
      NAMES,
      tEn,
    );
    expect(display?.confirmedCount).toBe(2);
    expect(display?.totalCount).toBe(3);
  });

  it('lists the display names of seats still pending', () => {
    const display = resolveRoundConfirmDisplay(
      { pendingSeatIDs: ['0', '1', '2'], confirmedSeatIDs: ['0'] },
      null,
      '0',
      NAMES,
      tEn,
    );
    expect(display?.pendingNames).toEqual(['Bob', 'Carol']);
  });

  it('canConfirm is true only when the viewer\'s own seat is still pending', () => {
    const state = { pendingSeatIDs: ['0', '1'], confirmedSeatIDs: ['0'] };
    expect(resolveRoundConfirmDisplay(state, null, '1', NAMES, tEn)?.canConfirm).toBe(true);
    expect(resolveRoundConfirmDisplay(state, null, '0', NAMES, tEn)?.canConfirm).toBe(false);
    expect(resolveRoundConfirmDisplay(state, null, null, NAMES, tEn)?.canConfirm).toBe(false);
  });

  it('canForceAdvance is true only for the host seat while at least one seat is pending', () => {
    const state = { pendingSeatIDs: ['0', '1'], confirmedSeatIDs: ['0'] };
    expect(resolveRoundConfirmDisplay(state, '1', '1', NAMES, tEn)?.canForceAdvance).toBe(true);
    expect(resolveRoundConfirmDisplay(state, '1', '0', NAMES, tEn)?.canForceAdvance).toBe(false);
    expect(resolveRoundConfirmDisplay(state, null, '1', NAMES, tEn)?.canForceAdvance).toBe(false);
  });

  it('canForceAdvance is false once nobody is pending anymore, even for the host', () => {
    const state = { pendingSeatIDs: ['0', '1'], confirmedSeatIDs: ['0', '1'] };
    expect(resolveRoundConfirmDisplay(state, '1', '1', NAMES, tEn)?.canForceAdvance).toBe(false);
  });
});

describe('RoundConfirmBanner', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when roundConfirm is null', () => {
    render(
      <RoundConfirmBanner
        roundConfirm={null}
        hostPlayerID={null}
        playerID="0"
        playerNames={NAMES}
        onConfirm={vi.fn()}
        onForceAdvance={vi.fn()}
      />,
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the confirmed/total progress and a Confirm button for a pending viewer', () => {
    const onConfirm = vi.fn();
    render(
      <RoundConfirmBanner
        roundConfirm={{ pendingSeatIDs: ['0', '1'], confirmedSeatIDs: ['1'] }}
        hostPlayerID={null}
        playerID="0"
        playerNames={NAMES}
        onConfirm={onConfirm}
        onForceAdvance={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('1 of 2 confirmed');
    fireEvent.click(screen.getByText('Ready for next round'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('hides the Confirm button once the viewer has already confirmed', () => {
    render(
      <RoundConfirmBanner
        roundConfirm={{ pendingSeatIDs: ['0', '1'], confirmedSeatIDs: ['0'] }}
        hostPlayerID={null}
        playerID="0"
        playerNames={NAMES}
        onConfirm={vi.fn()}
        onForceAdvance={vi.fn()}
      />,
    );
    expect(screen.queryByText('Ready for next round')).not.toBeInTheDocument();
  });

  it('shows the force-advance button only to the host seat, and wires it up', () => {
    const onForceAdvance = vi.fn();
    render(
      <RoundConfirmBanner
        roundConfirm={{ pendingSeatIDs: ['0', '1'], confirmedSeatIDs: ['0'] }}
        hostPlayerID="1"
        playerID="1"
        playerNames={NAMES}
        onConfirm={vi.fn()}
        onForceAdvance={onForceAdvance}
      />,
    );
    fireEvent.click(screen.getByText('Skip waiting (host)'));
    expect(onForceAdvance).toHaveBeenCalledTimes(1);
  });

  it('does not show the force-advance button to a non-host seat', () => {
    render(
      <RoundConfirmBanner
        roundConfirm={{ pendingSeatIDs: ['0', '1'], confirmedSeatIDs: ['0'] }}
        hostPlayerID="1"
        playerID="0"
        playerNames={NAMES}
        onConfirm={vi.fn()}
        onForceAdvance={vi.fn()}
      />,
    );
    expect(screen.queryByText('Skip waiting (host)')).not.toBeInTheDocument();
  });
});
