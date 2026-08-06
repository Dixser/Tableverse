// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import './i18nFixture.js';
import { HandView } from './HandView.js';
import type { Card } from './deck.js';

const s4: Card = { id: 'S4', kind: 'number', suit: 'S', rank: 4 };
const h4: Card = { id: 'H4', kind: 'number', suit: 'H', rank: 4 };
const d4: Card = { id: 'D4', kind: 'number', suit: 'D', rank: 4 };
const c4: Card = { id: 'C4', kind: 'number', suit: 'C', rank: 4 };
const s7: Card = { id: 'S7', kind: 'number', suit: 'S', rank: 7 };
const faceJ: Card = { id: 'SJ', kind: 'face', suit: 'S', rank: 'J' };
const companion: Card = { id: 'HAC', kind: 'companion', suit: 'H' };
const jester: Card = { id: 'Jester1', kind: 'jester' };

/**
 * feature 031's hand-order props. The ordering state itself is the shared
 * hook's concern (src/ui/useHandOrder.test.tsx); these tests only need
 * HandView to render, so `itemIds` is the hand in whatever order it was given.
 */
function orderProps(hand: Card[]) {
  return {
    itemIds: hand.map((c) => c.id),
    onReorder: vi.fn(),
    onSort: vi.fn(),
    onResetOrder: vi.fn(),
    isCustomised: false,
  };
}

/**
 * The card buttons only. Since feature 031 each card also renders a drag
 * grip, and the sort controls add their own buttons below the hand -- so a
 * bare `getAllByRole('button')` no longer indexes cards positionally.
 */
function cardButtons() {
  const hand = screen.getByRole('group', { name: 'TEST_your_hand' });
  return within(hand)
    .getAllByRole('button')
    .filter((b) => !b.getAttribute('aria-label')?.startsWith('TEST_reorder'));
}

/** The drag grips, in hand order. */
function handleButtons() {
  const hand = screen.getByRole('group', { name: 'TEST_your_hand' });
  return within(hand)
    .getAllByRole('button')
    .filter((b) => b.getAttribute('aria-label')?.startsWith('TEST_reorder'));
}

describe('HandView', () => {
  it('AC1: every card is enabled when nothing is selected yet', () => {
    const hand = [s4, s7, faceJ];
    render(
      <HandView
        hand={hand}
        selectedCardIds={[]}
        interactive
        onCardClicked={vi.fn()}
        {...orderProps(hand)}
      />,
    );
    for (const button of cardButtons()) {
      expect(button).not.toBeDisabled();
    }
  });

  it('AC1: clicking an unselected but still-legal card calls onCardClicked, and a selected card is marked pressed', () => {
    const onCardClicked = vi.fn();
    const hand = [s4, h4];
    render(
      <HandView
        hand={hand}
        selectedCardIds={['S4']}
        interactive
        onCardClicked={onCardClicked}
        {...orderProps(hand)}
      />,
    );
    const buttons = cardButtons();
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'false');
    buttons[1]!.click(); // H4 -- same rank as S4, sum 8 <= 10, still legal.
    expect(onCardClicked).toHaveBeenCalledWith('H4');
  });

  it('AC1: a selected card remains clickable (to deselect)', () => {
    const onCardClicked = vi.fn();
    const hand = [s4];
    render(
      <HandView
        hand={hand}
        selectedCardIds={['S4']}
        interactive
        onCardClicked={onCardClicked}
        {...orderProps(hand)}
      />,
    );
    const button = cardButtons()[0]!;
    expect(button).not.toBeDisabled();
    button.click();
    expect(onCardClicked).toHaveBeenCalledWith('S4');
  });

  it('AC2: after selecting a number card, a different rank and every face/jester card disables', () => {
    const hand = [s4, h4, s7, faceJ, jester];
    render(
      <HandView
        hand={hand}
        selectedCardIds={['S4']}
        interactive
        onCardClicked={vi.fn()}
        {...orderProps(hand)}
      />,
    );
    const buttons = cardButtons();
    expect(buttons[0]).not.toBeDisabled(); // S4 itself -- selected, deselectable.
    expect(buttons[1]).not.toBeDisabled(); // H4 -- same rank, sum 8 <= 10.
    expect(buttons[2]).toBeDisabled(); // S7 -- different rank.
    expect(buttons[3]).toBeDisabled(); // face card.
    expect(buttons[4]).toBeDisabled(); // jester.
  });

  it('AC2: a same-rank combo disables once a further card would exceed sum 10', () => {
    // S4 + H4 + D4 = 12 > 10 for a 3rd 4 -- but a 3-card same-rank combo is
    // only illegal here because the sum exceeds 10; C4 (a 4th) must also
    // disable once 3 are already selected (4*4=16 > 10 regardless).
    const hand = [s4, h4, d4, c4];
    render(
      <HandView
        hand={hand}
        selectedCardIds={['S4', 'H4']}
        interactive
        onCardClicked={vi.fn()}
        {...orderProps(hand)}
      />,
    );
    const buttons = cardButtons();
    expect(buttons[2]).toBeDisabled(); // D4 -- sum would be 12.
    expect(buttons[3]).toBeDisabled(); // C4 -- same reason.
  });

  it('AC3: after selecting one Animal Companion, every card except exactly one more disables once 2 are selected', () => {
    const hand = [companion, s4, s7, jester];
    render(
      <HandView
        hand={hand}
        selectedCardIds={['HAC', 'S4']}
        interactive
        onCardClicked={vi.fn()}
        {...orderProps(hand)}
      />,
    );
    const buttons = cardButtons();
    expect(buttons[0]).not.toBeDisabled(); // HAC -- selected.
    expect(buttons[1]).not.toBeDisabled(); // S4 -- selected.
    expect(buttons[2]).toBeDisabled(); // S7 -- would make a 3-card selection.
    expect(buttons[3]).toBeDisabled(); // jester -- never combos.
  });

  it('AC3: a lone Jester disables every other card', () => {
    const hand = [jester, s4, faceJ];
    render(
      <HandView
        hand={hand}
        selectedCardIds={['Jester1']}
        interactive
        onCardClicked={vi.fn()}
        {...orderProps(hand)}
      />,
    );
    const buttons = cardButtons();
    expect(buttons[0]).not.toBeDisabled(); // jester itself -- selected.
    expect(buttons[1]).toBeDisabled();
    expect(buttons[2]).toBeDisabled();
  });

  it('is entirely non-interactive (no onClick fires) when interactive is false', () => {
    const onCardClicked = vi.fn();
    const hand = [s4];
    render(
      <HandView
        hand={hand}
        selectedCardIds={[]}
        interactive={false}
        onCardClicked={onCardClicked}
        {...orderProps(hand)}
      />,
    );
    expect(cardButtons()[0]).toBeDisabled();
  });
});

describe('HandView hand arrangement (feature 031)', () => {
  it('renders one drag grip per card, labelled with that card', () => {
    const hand = [s4, jester];
    render(
      <HandView
        hand={hand}
        selectedCardIds={[]}
        interactive
        onCardClicked={vi.fn()}
        {...orderProps(hand)}
      />,
    );
    const handles = handleButtons();
    expect(handles).toHaveLength(2);
    expect(handles[0]).toHaveAccessibleName('TEST_reorder TEST_S 4');
    expect(handles[1]).toHaveAccessibleName('TEST_reorder TEST_Jester');
  });

  it('AC: the grip stays ENABLED off-turn, when the card button itself is disabled', () => {
    // The core of the feature: a waiting player must be able to tidy their
    // hand. CardTile renders `disabled={disabled || !onClick}`, and a
    // disabled <button> dispatches no pointer events -- hence the separate grip.
    const hand = [s4, s7];
    render(
      <HandView
        hand={hand}
        selectedCardIds={[]}
        interactive={false}
        onCardClicked={vi.fn()}
        {...orderProps(hand)}
      />,
    );
    for (const card of cardButtons()) expect(card).toBeDisabled();
    for (const handle of handleButtons()) expect(handle).not.toBeDisabled();
  });

  it('AC: the sort controls stay enabled off-turn and call onSort with a comparator', () => {
    const onSort = vi.fn();
    const hand = [s7, s4];
    render(
      <HandView
        hand={hand}
        selectedCardIds={[]}
        interactive={false}
        onCardClicked={vi.fn()}
        {...orderProps(hand)}
        onSort={onSort}
      />,
    );
    const bySuit = screen.getByRole('button', { name: 'TEST_by_suit' });
    expect(bySuit).not.toBeDisabled();
    bySuit.click();
    expect(onSort).toHaveBeenCalledTimes(1);
    expect(typeof onSort.mock.calls[0]![0]).toBe('function');
  });

  it('offers both presets, and Reset is disabled until the hand is customised', () => {
    const hand = [s4, s7];
    const { rerender } = render(
      <HandView
        hand={hand}
        selectedCardIds={[]}
        interactive
        onCardClicked={vi.fn()}
        {...orderProps(hand)}
      />,
    );
    expect(screen.getByRole('button', { name: 'TEST_by_suit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'TEST_by_rank' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'TEST_dealt_order' })).toBeDisabled();

    rerender(
      <HandView
        hand={hand}
        selectedCardIds={[]}
        interactive
        onCardClicked={vi.fn()}
        {...orderProps(hand)}
        isCustomised
      />,
    );
    expect(screen.getByRole('button', { name: 'TEST_dealt_order' })).not.toBeDisabled();
  });

  it('renders no sort controls for a single-card hand', () => {
    const hand = [s4];
    render(
      <HandView
        hand={hand}
        selectedCardIds={[]}
        interactive
        onCardClicked={vi.fn()}
        {...orderProps(hand)}
      />,
    );
    expect(screen.queryByRole('button', { name: 'TEST_by_suit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'TEST_arrange_hand' })).not.toBeInTheDocument();
  });

  it('renders cards in the order given, not in the deck-defined order', () => {
    const hand = [jester, s7, s4];
    render(
      <HandView
        hand={hand}
        selectedCardIds={[]}
        interactive
        onCardClicked={vi.fn()}
        {...orderProps(hand)}
      />,
    );
    expect(cardButtons().map((b) => b.getAttribute('aria-label'))).toEqual([
      'TEST_Jester',
      'TEST_S 7',
      'TEST_S 4',
    ]);
  });
});
