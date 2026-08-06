// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import './i18nFixture.js';
import { HandView } from './HandView.js';
import type { Card } from './deck.js';

const pink2: Card = { id: 'pink2', suit: 'pink', rank: 2 };
const pink9: Card = { id: 'pink9', suit: 'pink', rank: 9 };
const blue3: Card = { id: 'blue3', suit: 'blue', rank: 3 };
const green7: Card = { id: 'green7', suit: 'green', rank: 7 };
const rocket1: Card = { id: 'rocket1', suit: 'rocket', rank: 1 };

/** feature 031's hand-order props -- the ordering state itself is covered in src/ui/useHandOrder.test.tsx. */
function orderProps(hand: Card[]) {
  return {
    itemIds: hand.map((c) => c.id),
    onReorder: vi.fn(),
    onSort: vi.fn(),
    onResetOrder: vi.fn(),
    isCustomised: false,
  };
}

function handButtons() {
  const hand = screen.getByRole('group', { name: 'TEST_your_hand' });
  return within(hand).getAllByRole('button');
}

function cardButtons() {
  return handButtons().filter((b) => !b.getAttribute('aria-label')?.startsWith('TEST_reorder'));
}

function handleButtons() {
  return handButtons().filter((b) => b.getAttribute('aria-label')?.startsWith('TEST_reorder'));
}

function renderHand(hand: Card[], props: Partial<Parameters<typeof HandView>[0]> = {}) {
  return render(
    <HandView
      hand={hand}
      ledSuit={null}
      interactive
      onCardClicked={vi.fn()}
      {...orderProps(hand)}
      {...props}
    />,
  );
}

describe('crew HandView', () => {
  it('renders every card in the order given', () => {
    renderHand([green7, pink2, rocket1]);
    expect(cardButtons().map((b) => b.getAttribute('aria-label'))).toEqual([
      'TEST_green 7',
      'TEST_pink 2',
      'TEST_rocket 1',
    ]);
  });

  it('clicking a legal card plays it exactly once -- the 8px drag threshold does not swallow the click', () => {
    // Guards the sensor decision in src/ui/useHandSortSensors.ts: without an
    // activation constraint, PointerSensor activates on pointerdown and the
    // click never lands.
    const onCardClicked = vi.fn();
    renderHand([pink2, blue3], { onCardClicked });

    screen.getByRole('button', { name: 'TEST_pink 2' }).click();

    expect(onCardClicked).toHaveBeenCalledTimes(1);
    expect(onCardClicked).toHaveBeenCalledWith('pink2');
  });

  it('disables a card that does not follow the led suit', () => {
    renderHand([pink2, blue3], { ledSuit: 'pink' });
    expect(screen.getByRole('button', { name: 'TEST_pink 2' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'TEST_blue 3' })).toBeDisabled();
  });
});

describe('crew HandView hand arrangement (feature 031)', () => {
  it('renders one drag grip per card, labelled with that card', () => {
    renderHand([pink2, rocket1]);
    const handles = handleButtons();
    expect(handles).toHaveLength(2);
    expect(handles[0]).toHaveAccessibleName('TEST_reorder TEST_pink 2');
    expect(handles[1]).toHaveAccessibleName('TEST_reorder TEST_rocket 1');
  });

  it('AC: the grip stays ENABLED off-turn, when every card button is disabled', () => {
    renderHand([pink2, blue3], { interactive: false });
    for (const card of cardButtons()) expect(card).toBeDisabled();
    for (const handle of handleButtons()) expect(handle).not.toBeDisabled();
  });

  it('AC: the grip stays enabled on an ILLEGAL card, which is disabled for play', () => {
    renderHand([pink2, blue3], { ledSuit: 'pink' });
    expect(screen.getByRole('button', { name: 'TEST_blue 3' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'TEST_reorder TEST_blue 3' })).not.toBeDisabled();
  });

  it('AC: the sort controls stay enabled off-turn and call onSort with a comparator', () => {
    const onSort = vi.fn();
    renderHand([pink9, pink2], { interactive: false, onSort });

    const byRank = screen.getByRole('button', { name: 'TEST_by_rank' });
    expect(byRank).not.toBeDisabled();
    byRank.click();

    expect(onSort).toHaveBeenCalledTimes(1);
    expect(typeof onSort.mock.calls[0]![0]).toBe('function');
  });

  it('renders no sort controls for a single-card hand', () => {
    renderHand([pink2]);
    expect(screen.queryByRole('group', { name: 'TEST_arrange_hand' })).not.toBeInTheDocument();
  });
});
