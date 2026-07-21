// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import './i18nFixture.js';
import { DiscardPileZone } from './DiscardPileZone.js';
import type { Card } from './deck.js';

const s4: Card = { id: 'S4', kind: 'number', suit: 'S', rank: 4 };
const h6: Card = { id: 'H6', kind: 'number', suit: 'H', rank: 6 };

describe('DiscardPileZone', () => {
  it('shows a placeholder when nothing has been discarded yet', () => {
    render(<DiscardPileZone discardPile={[]} />);
    expect(screen.getByText('TEST_discarded_cards_empty')).toBeInTheDocument();
  });

  it('renders every discarded card, and hides the placeholder once non-empty', () => {
    render(<DiscardPileZone discardPile={[s4, h6]} />);
    expect(screen.queryByText('TEST_discarded_cards_empty')).toBeNull();
    expect(screen.getByRole('button', { name: 'TEST_S 4' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'TEST_H 6' })).toBeInTheDocument();
  });

  it('renders inert (non-interactive) cards -- this is a public history list, not a hand to select from', () => {
    render(<DiscardPileZone discardPile={[s4]} />);
    expect(screen.getByRole('button', { name: 'TEST_S 4' })).toBeDisabled();
  });
});
