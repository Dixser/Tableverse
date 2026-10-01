// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import './i18nFixture.js';
import { PlayArea } from './PlayArea.js';

describe('PlayArea (AC8)', () => {
  it('renders every seat and their played cards', () => {
    render(
      <PlayArea
        playedCards={{ '0': [8], '1': [1, 2] }}
        eliminated={{ '0': false, '1': false }}
        handmaidProtected={{ '0': false, '1': false }}
        roundWins={{ '0': 0, '1': 0 }}
      />,
    );
    expect(screen.getByText('Seat 1')).toBeInTheDocument();
    expect(screen.getByText('Seat 2')).toBeInTheDocument();
    expect(screen.getAllByText('TEST_Guard')).toHaveLength(1);
    expect(screen.getAllByText('TEST_Priest')).toHaveLength(1);
  });

  it('shows an eliminated badge for an eliminated seat', () => {
    render(
      <PlayArea
        playedCards={{ '0': [9], '1': [] }}
        eliminated={{ '0': true, '1': false }}
        handmaidProtected={{ '0': false, '1': false }}
        roundWins={{ '0': 0, '1': 0 }}
      />,
    );
    expect(screen.getByText('TEST_eliminated')).toBeInTheDocument();
    expect(screen.queryByText('TEST_protected')).toBeNull();
  });

  it('shows a protected badge for a Handmaid-protected seat', () => {
    render(
      <PlayArea
        playedCards={{ '0': [4], '1': [] }}
        eliminated={{ '0': false, '1': false }}
        handmaidProtected={{ '0': true, '1': false }}
        roundWins={{ '0': 0, '1': 0 }}
      />,
    );
    expect(screen.getByText('TEST_protected')).toBeInTheDocument();
  });

  it('played cards are inert display badges, not clickable', () => {
    render(
      <PlayArea
        playedCards={{ '0': [8] }}
        eliminated={{ '0': false }}
        handmaidProtected={{ '0': false }}
        roundWins={{ '0': 0 }}
      />,
    );
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('labels a seat by username instead of "Seat N" when playerNames is known', () => {
    render(
      <PlayArea
        playedCards={{ '0': [8], '1': [] }}
        eliminated={{ '0': false, '1': false }}
        handmaidProtected={{ '0': false, '1': false }}
        roundWins={{ '0': 0, '1': 0 }}
        playerNames={{ '0': 'Alice' }}
      />,
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.queryByText('Seat 1')).toBeNull();
    expect(screen.getByText('Seat 2')).toBeInTheDocument(); // no name synced -- falls back.
  });

  describe('round wins (AC8)', () => {
    const base = {
      playedCards: { '0': [], '1': [], '2': [] } as Record<string, never[]>,
      eliminated: { '0': false, '1': false, '2': false },
      handmaidProtected: { '0': false, '1': false, '2': false },
    };

    it("renders every seat's token count, one 🔴 per round won", () => {
      render(<PlayArea {...base} roundWins={{ '0': 2, '1': 0, '2': 1 }} />);
      expect(screen.getByLabelText('TEST_round_wins Seat 1 2')).toHaveTextContent('🔴🔴');
      expect(screen.getByLabelText('TEST_round_wins Seat 2 0')).not.toHaveTextContent('🔴');
      expect(screen.getByLabelText('TEST_round_wins Seat 3 1')).toHaveTextContent('🔴');
    });

    it('draws the tokens still needed to win as empty slots', () => {
      render(<PlayArea {...base} roundWins={{ '0': 3, '1': 0, '2': 5 }} tokensToWin={5} />);
      expect(screen.getByLabelText('TEST_round_wins Seat 1 3')).toHaveTextContent('🔴🔴🔴〇〇');
      expect(screen.getByLabelText('TEST_round_wins Seat 2 0')).toHaveTextContent('〇〇〇〇〇');
      expect(screen.getByLabelText('TEST_round_wins Seat 3 5')).toHaveTextContent('🔴🔴🔴🔴🔴');
    });

    it('updates between fixture snapshots representing a round-end transition', () => {
      const { rerender } = render(<PlayArea {...base} roundWins={{ '0': 1, '1': 0, '2': 0 }} />);
      expect(screen.getByLabelText('TEST_round_wins Seat 1 1')).toBeInTheDocument();
      rerender(<PlayArea {...base} roundWins={{ '0': 2, '1': 0, '2': 0 }} />);
      expect(screen.getByLabelText('TEST_round_wins Seat 1 2')).toBeInTheDocument();
    });

    it('labels the count by username when playerNames is known', () => {
      render(<PlayArea {...base} roundWins={{ '0': 2, '1': 0, '2': 0 }} playerNames={{ '0': 'Alice' }} />);
      expect(screen.getByLabelText('TEST_round_wins Alice 2')).toBeInTheDocument();
    });
  });

  it("highlights the current player's seat", () => {
    render(
      <PlayArea
        playedCards={{ '0': [], '1': [] }}
        eliminated={{ '0': false, '1': false }}
        handmaidProtected={{ '0': false, '1': false }}
        roundWins={{ '0': 0, '1': 0 }}
        currentPlayerID="1"
      />,
    );
    expect(screen.getByText('Seat 2').closest('[class*="active"]')).not.toBeNull();
    expect(screen.getByText('Seat 1').closest('[class*="active"]')).toBeNull();
  });
});
