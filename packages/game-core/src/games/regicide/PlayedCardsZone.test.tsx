// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import './i18nFixture.js';
import { PlayedCardsZone } from './PlayedCardsZone.js';
import type { Card } from './deck.js';

const s4: Card = { id: 'S4', kind: 'number', suit: 'S', rank: 4 };
const h6: Card = { id: 'H6', kind: 'number', suit: 'H', rank: 6 };

describe('PlayedCardsZone', () => {
  it('shows a placeholder when nothing has been played yet this round', () => {
    render(<PlayedCardsZone cardsInPlay={[]} />);
    expect(screen.getByText('TEST_played_cards_empty')).toBeInTheDocument();
  });

  it('renders every card currently in play, and hides the placeholder once non-empty', () => {
    render(<PlayedCardsZone cardsInPlay={[s4, h6]} />);
    expect(screen.queryByText('TEST_played_cards_empty')).toBeNull();
    expect(screen.getByRole('button', { name: 'TEST_S 4' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'TEST_H 6' })).toBeInTheDocument();
  });

  it('renders inert (non-interactive) cards -- these are public state, not a hand to select from', () => {
    render(<PlayedCardsZone cardsInPlay={[s4]} />);
    expect(screen.getByRole('button', { name: 'TEST_S 4' })).toBeDisabled();
  });
});
