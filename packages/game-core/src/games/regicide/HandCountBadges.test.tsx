// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import './i18nFixture.js';
import { HandCountBadges } from './HandCountBadges.js';

describe('HandCountBadges', () => {
  it('AC7: renders each active seat label with its handCounts entry', () => {
    render(
      <HandCountBadges
        activeSeatIDs={['0', '1']}
        handCounts={{ '0': 7, '1': 5 }}
        playerNames={{ '0': 'Alice', '1': 'Bob' }}
      />,
    );
    expect(screen.getByText('Alice: TEST_cards_left 7')).toBeInTheDocument();
    expect(screen.getByText('Bob: TEST_cards_left 5')).toBeInTheDocument();
  });

  it('AC7: never renders anything derived from a hands record -- only takes handCounts', () => {
    // Type-level guarantee: HandCountBadgesProps has no `hands` field at
    // all, so a fixture "leaking" G.hands into this component simply has
    // nowhere to plug in -- this test documents that contract.
    render(<HandCountBadges activeSeatIDs={['0']} handCounts={{ '0': 3 }} />);
    expect(screen.getByText('Seat 1: TEST_cards_left 3')).toBeInTheDocument();
  });

  it('falls back to 0 for a seat missing from handCounts', () => {
    render(<HandCountBadges activeSeatIDs={['0']} handCounts={{}} />);
    expect(screen.getByText('Seat 1: TEST_cards_left 0')).toBeInTheDocument();
  });
});
