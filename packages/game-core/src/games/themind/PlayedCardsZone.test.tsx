// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import './i18nFixture.js';
import { PlayedCardsZone } from './PlayedCardsZone.js';

describe('PlayedCardsZone', () => {
  it('shows an empty-pile placeholder when nothing has been played yet', () => {
    render(
      <PlayedCardsZone
        playedCards={[]}
        activeSeatIDs={['0', '1']}
        setAsideCards={{ '0': [], '1': [] }}
        starDiscards={{ '0': [], '1': [] }}
      />,
    );
    expect(screen.getByText('TEST_played_cards_empty')).toBeInTheDocument();
  });

  it('renders the played pile in order', () => {
    render(
      <PlayedCardsZone
        playedCards={[5, 12, 40]}
        activeSeatIDs={['0', '1']}
        setAsideCards={{ '0': [], '1': [] }}
        starDiscards={{ '0': [], '1': [] }}
      />,
    );
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
  });

  it('only shows the set-aside zone once a mistake has revealed something, attributed to its owning seat', () => {
    const { rerender } = render(
      <PlayedCardsZone
        playedCards={[]}
        activeSeatIDs={['0', '1']}
        setAsideCards={{ '0': [], '1': [] }}
        starDiscards={{ '0': [], '1': [] }}
      />,
    );
    expect(screen.queryByText('TEST_set_aside_cards')).toBeNull();
    rerender(
      <PlayedCardsZone
        playedCards={[]}
        activeSeatIDs={['0', '1']}
        setAsideCards={{ '0': [3], '1': [] }}
        starDiscards={{ '0': [], '1': [] }}
      />,
    );
    expect(screen.getByText('TEST_set_aside_cards')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Seat 1')).toBeInTheDocument();
    // Seat 2 had no reveals -- it should not get its own row.
    expect(screen.queryByText('Seat 2')).toBeNull();
  });

  it('only shows the star-discard zone once a shuriken has revealed something, one row per contributing seat', () => {
    render(
      <PlayedCardsZone
        playedCards={[]}
        activeSeatIDs={['0', '1']}
        setAsideCards={{ '0': [], '1': [] }}
        starDiscards={{ '0': [7], '1': [8] }}
      />,
    );
    expect(screen.getByText('TEST_star_discards')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('Seat 1')).toBeInTheDocument();
    expect(screen.getByText('Seat 2')).toBeInTheDocument();
  });

  it('labels a seat by username instead of "Seat N" when playerNames is known', () => {
    render(
      <PlayedCardsZone
        playedCards={[]}
        activeSeatIDs={['0', '1']}
        setAsideCards={{ '0': [], '1': [] }}
        starDiscards={{ '0': [9], '1': [] }}
        playerNames={{ '0': 'Alice' }}
      />,
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });
});
