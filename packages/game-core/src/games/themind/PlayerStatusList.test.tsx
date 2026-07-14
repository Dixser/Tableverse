// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import './i18nFixture.js';
import { PlayerStatusList } from './PlayerStatusList.js';

describe('PlayerStatusList', () => {
  it('renders every active seat\'s hand count as one face-down card icon per card, never a digit or a value', () => {
    render(
      <PlayerStatusList
        activeSeatIDs={['0', '1']}
        handCounts={{ '0': 3, '1': 1 }}
        playerID="0"
      />,
    );
    expect(screen.getByText('Seat 1')).toBeInTheDocument();
    expect(screen.getByText('Seat 2')).toBeInTheDocument();
    // No visible "3" / "1" digit anywhere -- the count is conveyed only by
    // how many card-back icons render, exposed to a11y via aria-label.
    expect(screen.queryByText('3')).toBeNull();
    expect(screen.queryByText('1')).toBeNull();
    const seat0Backs = screen.getByLabelText('TEST_cards_left 3');
    const seat1Backs = screen.getByLabelText('TEST_cards_left 1');
    expect(seat0Backs.children).toHaveLength(3);
    expect(seat1Backs.children).toHaveLength(1);
  });

  it('labels a seat by username instead of "Seat N" when playerNames is known', () => {
    render(
      <PlayerStatusList
        activeSeatIDs={['0', '1']}
        handCounts={{ '0': 2, '1': 2 }}
        playerID={null}
        playerNames={{ '0': 'Alice' }}
      />,
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Seat 2')).toBeInTheDocument();
  });
});
