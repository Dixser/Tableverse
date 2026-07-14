// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import './i18nFixture.js';
import { PlayerStatusList } from './PlayerStatusList.js';

describe('PlayerStatusList', () => {
  it('renders every active seat\'s hand count, never card values', () => {
    render(
      <PlayerStatusList
        activeSeatIDs={['0', '1']}
        handCounts={{ '0': 3, '1': 1 }}
        playerID="0"
      />,
    );
    expect(screen.getByText('Seat 1')).toBeInTheDocument();
    expect(screen.getByText('Seat 2')).toBeInTheDocument();
    expect(screen.getByText('TEST_cards_left 3')).toBeInTheDocument();
    expect(screen.getByText('TEST_cards_left 1')).toBeInTheDocument();
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
