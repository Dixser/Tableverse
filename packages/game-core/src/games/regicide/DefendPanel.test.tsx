// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import './i18nFixture.js';
import { DefendPanel } from './DefendPanel.js';
import type { Card } from './deck.js';

const s4: Card = { id: 'S4', kind: 'number', suit: 'S', rank: 4 };
const h6: Card = { id: 'H6', kind: 'number', suit: 'H', rank: 6 };
const d3: Card = { id: 'D3', kind: 'number', suit: 'D', rank: 3 };

describe('DefendPanel', () => {
  it('Discard is disabled until the selected total reaches requiredTotal', () => {
    render(<DefendPanel hand={[s4, h6, d3]} requiredTotal={10} onDiscard={vi.fn()} />);
    const discardButton = screen.getByText('TEST_Discard');
    expect(discardButton).toBeDisabled();

    fireEvent.click(screen.getByText('TEST_4_of_TEST_Spades').closest('button')!);
    expect(discardButton).toBeDisabled(); // 4 < 10.

    fireEvent.click(screen.getByText('TEST_6_of_TEST_Hearts').closest('button')!);
    expect(discardButton).not.toBeDisabled(); // 4 + 6 = 10.
  });

  it('calls onDiscard with exactly the selected card ids and clears the selection', () => {
    const onDiscard = vi.fn();
    render(<DefendPanel hand={[s4, h6, d3]} requiredTotal={7} onDiscard={onDiscard} />);
    fireEvent.click(screen.getByText('TEST_4_of_TEST_Spades').closest('button')!);
    fireEvent.click(screen.getByText('TEST_3_of_TEST_Diamonds').closest('button')!); // 4 + 3 = 7.
    fireEvent.click(screen.getByText('TEST_Discard'));
    expect(onDiscard).toHaveBeenCalledWith(['S4', 'D3']);

    // Selection cleared -- Discard disabled again.
    expect(screen.getByText('TEST_Discard')).toBeDisabled();
  });

  it('deselecting a card lowers the running total', () => {
    render(<DefendPanel hand={[s4, h6]} requiredTotal={10} onDiscard={vi.fn()} />);
    const s4Button = screen.getByText('TEST_4_of_TEST_Spades').closest('button')!;
    const h6Button = screen.getByText('TEST_6_of_TEST_Hearts').closest('button')!;
    fireEvent.click(s4Button);
    fireEvent.click(h6Button);
    expect(screen.getByText('TEST_Discard')).not.toBeDisabled();
    fireEvent.click(h6Button); // deselect -- back to 4 < 10.
    expect(screen.getByText('TEST_Discard')).toBeDisabled();
  });
});
