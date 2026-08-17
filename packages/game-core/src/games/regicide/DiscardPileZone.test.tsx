// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import './i18nFixture.js';
import { DiscardPileZone } from './DiscardPileZone.js';
import type { Card } from './deck.js';

const s4: Card = { id: 'S4', kind: 'number', suit: 'S', rank: 4 };
const h6: Card = { id: 'H6', kind: 'number', suit: 'H', rank: 6 };

function trigger() {
  return screen.getByTestId('discard-pile-toggle');
}

describe('DiscardPileZone', () => {
  it('shows only the count stack until pressed -- the cards cost no board height while closed', () => {
    render(<DiscardPileZone discardPile={[s4, h6]} />);
    expect(screen.getByLabelText('TEST_discard_count 2')).toBeInTheDocument();
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'TEST_S 4' })).toBeNull();
    expect(screen.queryByText('TEST_discarded_cards_title')).toBeNull();
  });

  it('reveals every discarded card on press, and hides them again on a second press', () => {
    render(<DiscardPileZone discardPile={[s4, h6]} />);

    fireEvent.click(trigger());
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'TEST_S 4' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'TEST_H 6' })).toBeInTheDocument();

    fireEvent.click(trigger());
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'TEST_S 4' })).toBeNull();
  });

  it('names the trigger with the pile size, so the count is not carried by decoration alone', () => {
    render(<DiscardPileZone discardPile={[s4, h6]} />);
    // DeckStack's own count text is aria-hidden -- without this label the
    // button would reach a screen reader as an unnamed control.
    expect(screen.getByRole('button', { name: 'TEST_discard_toggle 2' })).toBe(trigger());
  });

  it('points the trigger at the list it opens', () => {
    render(<DiscardPileZone discardPile={[s4]} />);
    fireEvent.click(trigger());
    expect(screen.getByRole('group')).toHaveAttribute(
      'id',
      trigger().getAttribute('aria-controls'),
    );
  });

  it('closes on a press that lands outside the pile', () => {
    render(
      <>
        <DiscardPileZone discardPile={[s4]} />
        <button type="button">elsewhere on the board</button>
      </>,
    );
    fireEvent.click(trigger());
    // mousedown, not click: the pile is meant to be out of the way by the
    // time the press it was covering resolves.
    fireEvent.mouseDown(screen.getByRole('button', { name: 'elsewhere on the board' }));
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes on a touch that lands outside the pile', () => {
    render(
      <>
        <DiscardPileZone discardPile={[s4]} />
        <button type="button">elsewhere on the board</button>
      </>,
    );
    fireEvent.click(trigger());
    fireEvent.touchStart(screen.getByRole('button', { name: 'elsewhere on the board' }));
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('stays open when the press lands inside the list itself', () => {
    render(<DiscardPileZone discardPile={[s4]} />);
    fireEvent.click(trigger());
    // Scrolling a long pile means pressing inside it -- that must not be
    // read as "done looking".
    fireEvent.mouseDown(screen.getByText('TEST_discarded_cards_title'));
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes on Escape and hands focus back to the stack', () => {
    render(<DiscardPileZone discardPile={[s4]} />);
    fireEvent.click(trigger());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(trigger()).toHaveFocus();
  });

  it('shows a placeholder rather than an empty list when nothing has been discarded yet', () => {
    render(<DiscardPileZone discardPile={[]} />);
    expect(screen.getByLabelText('TEST_discard_count 0')).toBeInTheDocument();
    fireEvent.click(trigger());
    expect(screen.getByText('TEST_discarded_cards_empty')).toBeInTheDocument();
  });

  it('renders inert (non-interactive) cards -- this is a public history list, not a hand to select from', () => {
    render(<DiscardPileZone discardPile={[s4]} />);
    fireEvent.click(trigger());
    expect(screen.getByRole('button', { name: 'TEST_S 4' })).toBeDisabled();
  });
});
