// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import './i18nFixture.js';
import { RoundWinsTracker } from './RoundWinsTracker.js';

describe('RoundWinsTracker (AC8)', () => {
  it('renders every seated player\'s current token count', () => {
    render(<RoundWinsTracker roundWins={{ '0': 2, '1': 0, '2': 1 }} />);
    expect(screen.getByText('Seat 1: 2')).toBeInTheDocument();
    expect(screen.getByText('Seat 2: 0')).toBeInTheDocument();
    expect(screen.getByText('Seat 3: 1')).toBeInTheDocument();
  });

  it('renders mid-round, not gated behind any round/match-end condition', () => {
    // A fixture with no gameover/round-end context passed at all -- the
    // component takes only roundWins, so there is nothing to gate on.
    render(<RoundWinsTracker roundWins={{ '0': 0, '1': 0 }} />);
    expect(screen.getByText('Seat 1: 0')).toBeInTheDocument();
  });

  it('updates between fixture snapshots representing a round-end transition', () => {
    const { rerender } = render(<RoundWinsTracker roundWins={{ '0': 1, '1': 0 }} />);
    expect(screen.getByText('Seat 1: 1')).toBeInTheDocument();
    rerender(<RoundWinsTracker roundWins={{ '0': 2, '1': 0 }} />);
    expect(screen.getByText('Seat 1: 2')).toBeInTheDocument();
  });

  it('labels a seat by username instead of "Seat N" when playerNames is known', () => {
    render(<RoundWinsTracker roundWins={{ '0': 2, '1': 0 }} playerNames={{ '0': 'Alice' }} />);
    expect(screen.getByText('Alice: 2')).toBeInTheDocument();
    expect(screen.getByText('Seat 2: 0')).toBeInTheDocument();
  });
});
