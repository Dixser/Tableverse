// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import './i18nFixture.js';
import { PlayedCardsZone } from './PlayedCardsZone.js';

describe('PlayedCardsZone', () => {
  it('shows an empty-pile placeholder when nothing has been played yet', () => {
    render(<PlayedCardsZone playedCards={[]} setAsideCards={[]} starDiscards={[]} />);
    expect(screen.getByText('TEST_played_cards_empty')).toBeInTheDocument();
  });

  it('renders the played pile in order', () => {
    render(<PlayedCardsZone playedCards={[5, 12, 40]} setAsideCards={[]} starDiscards={[]} />);
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
  });

  it('only shows the set-aside zone once a mistake has revealed something', () => {
    const { rerender } = render(
      <PlayedCardsZone playedCards={[]} setAsideCards={[]} starDiscards={[]} />,
    );
    expect(screen.queryByText('TEST_set_aside_cards')).toBeNull();
    rerender(<PlayedCardsZone playedCards={[]} setAsideCards={[3]} starDiscards={[]} />);
    expect(screen.getByText('TEST_set_aside_cards')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('only shows the star-discard zone once a shuriken has revealed something', () => {
    render(<PlayedCardsZone playedCards={[]} setAsideCards={[]} starDiscards={[7, 8]} />);
    expect(screen.getByText('TEST_star_discards')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });
});
