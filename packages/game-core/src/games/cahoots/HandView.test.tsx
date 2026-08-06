// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import './i18nFixture.js';
import { HandView } from './HandView.js';
import type { Card } from './deck.js';

const blue3: Card = { id: 'blue3-0', color: 'blue', number: 3 };
const blue3b: Card = { id: 'blue3-1', color: 'blue', number: 3 };
const red5: Card = { id: 'red5-0', color: 'red', number: 5 };
const green1: Card = { id: 'green1-0', color: 'green', number: 1 };

/** feature 031's hand-order props -- the ordering state itself is covered in src/ui/useHandOrder.test.tsx. */
function orderProps(hand: Card[]) {
  return {
    itemIds: hand.map((c) => c.id),
    onSort: vi.fn(),
    onResetOrder: vi.fn(),
    isCustomised: false,
  };
}

/**
 * HandView's SortableContext requires an enclosing DndContext, which in
 * production is the board's (it also covers the piles). A bare one here keeps
 * this component mountable on its own.
 */
function renderHand(hand: Card[], props: Partial<Parameters<typeof HandView>[0]> = {}) {
  return render(
    <DndContext>
      <HandView hand={hand} interactive {...orderProps(hand)} {...props} />
    </DndContext>,
  );
}

function cardLabels() {
  const hand = screen.getByRole('group', { name: 'TEST_your_hand' });
  return within(hand)
    .getAllByLabelText(/^TEST_reorder /)
    .map((el) => el.getAttribute('aria-label'));
}

describe('cahoots HandView', () => {
  it('renders every card in the order given', () => {
    renderHand([red5, blue3, green1]);
    expect(cardLabels()).toEqual([
      'TEST_reorder TEST_red 5',
      'TEST_reorder TEST_blue 3',
      'TEST_reorder TEST_green 1',
    ]);
  });

  it('makes the whole card slot the drag activator, with no separate grip', () => {
    // Unlike Regicide/Crew, this game's CardTile is an inert <div> with no
    // click semantics to collide with, and a drag has to be able to land on a
    // pile rather than only on a neighbouring card. dnd-kit puts role="button"
    // on whichever node is the activator, so the assertion is that the
    // activator CONTAINS the card, rather than sitting beside it as a grip.
    renderHand([blue3, red5]);
    const hand = screen.getByRole('group', { name: 'TEST_your_hand' });
    const activators = within(hand).getAllByRole('button');

    expect(activators).toHaveLength(2);
    expect(activators[0]).toHaveAttribute('aria-label', 'TEST_reorder TEST_blue 3');
    expect(within(activators[0]!).getByLabelText('TEST_blue 3')).toBeInTheDocument();
    // No nested activator: the card inside is not itself a button.
    expect(within(activators[0]!).queryAllByRole('button')).toHaveLength(0);
  });

  it('distinguishes the two copies of the same colour/number pair', () => {
    renderHand([blue3, blue3b]);
    expect(cardLabels()).toHaveLength(2);
  });
});

describe('cahoots HandView hand arrangement (feature 031)', () => {
  it('offers both presets and calls onSort with a comparator', () => {
    const onSort = vi.fn();
    renderHand([red5, blue3], { onSort });

    expect(screen.getByRole('button', { name: 'TEST_by_color' })).toBeInTheDocument();
    screen.getByRole('button', { name: 'TEST_by_number' }).click();

    expect(onSort).toHaveBeenCalledTimes(1);
    expect(typeof onSort.mock.calls[0]![0]).toBe('function');
  });

  it('AC: the sort controls stay enabled when it is not this seat\'s turn', () => {
    renderHand([red5, blue3], { interactive: false });
    expect(screen.getByRole('button', { name: 'TEST_by_color' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'TEST_by_number' })).not.toBeDisabled();
  });

  it('disables Reset until the hand is customised', () => {
    const { rerender } = renderHand([red5, blue3]);
    expect(screen.getByRole('button', { name: 'TEST_dealt_order' })).toBeDisabled();

    const hand = [red5, blue3];
    rerender(
      <DndContext>
        <HandView hand={hand} interactive {...orderProps(hand)} isCustomised />
      </DndContext>,
    );
    expect(screen.getByRole('button', { name: 'TEST_dealt_order' })).not.toBeDisabled();
  });
});
