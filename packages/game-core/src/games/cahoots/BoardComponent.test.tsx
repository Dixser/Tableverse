// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { Ctx } from 'boardgame.io';
import './i18nFixture.js';
import { CahootsBoard } from './BoardComponent.js';
import type { CahootsView } from './gameDef.js';
import type { Card } from './deck.js';
import type { GoalDefinition } from './goals.js';

const red5: Card = { id: 'red5-0', color: 'red', number: 5 };
const blue3: Card = { id: 'blue3-0', color: 'blue', number: 3 };
const green1: Card = { id: 'green1-0', color: 'green', number: 1 };
const yellow7: Card = { id: 'yellow7-0', color: 'yellow', number: 7 };

const allOdd: GoalDefinition = { id: 'allOdd', kind: 'allOdd' } as GoalDefinition;

function makeCtx(overrides: Partial<Ctx> = {}): Ctx {
  return {
    numPlayers: 4,
    playOrder: ['0', '1', '2', '3'],
    playOrderPos: 0,
    activePlayers: null,
    currentPlayer: '0',
    turn: 1,
    phase: '',
    ...overrides,
  };
}

function seatedView(overrides: Partial<CahootsView> = {}): CahootsView {
  return {
    activeSeatIDs: ['0', '1'],
    difficulty: 'normal',
    targetGoalCount: 4,
    firstSeatID: '0',
    piles: [[red5], [blue3], [green1], [yellow7]],
    drawPile: [],
    goalDeck: [],
    activeGoals: [allOdd],
    completedGoals: [],
    log: [],
    handCounts: { '0': 4, '1': 4 },
    hands: { '0': [] },
    ...overrides,
  };
}

const noopMoves = { playCard: vi.fn() };

/** The card slots in the hand, in render order. dnd-kit marks the activator
 *  node role="button", and here the activator IS the whole card slot. */
function handCardLabels() {
  const hand = screen.getByRole('group', { name: 'TEST_your_hand' });
  return within(hand)
    .getAllByRole('button')
    .map((b) => b.getAttribute('aria-label'));
}

describe('CahootsBoard hand arrangement (feature 031)', () => {
  it('a sort preset reorders the rendered hand without sending any move', () => {
    const playCard = vi.fn();
    render(
      <CahootsBoard
        G={seatedView({ hands: { '0': [yellow7, red5, blue3, green1] } })}
        ctx={makeCtx()}
        moves={{ ...noopMoves, playCard }}
        playerID="0"
        isActive={true}
      />,
    );
    expect(handCardLabels()).toEqual([
      'TEST_reorder TEST_yellow 7',
      'TEST_reorder TEST_red 5',
      'TEST_reorder TEST_blue 3',
      'TEST_reorder TEST_green 1',
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'TEST_by_color' }));

    // COLORS order is blue, yellow, red, green.
    expect(handCardLabels()).toEqual([
      'TEST_reorder TEST_blue 3',
      'TEST_reorder TEST_yellow 7',
      'TEST_reorder TEST_red 5',
      'TEST_reorder TEST_green 1',
    ]);
    expect(playCard).not.toHaveBeenCalled();
  });

  it('AC: arranging works when it is NOT this seat\'s turn', () => {
    const playCard = vi.fn();
    render(
      <CahootsBoard
        G={seatedView({ hands: { '0': [yellow7, blue3] } })}
        ctx={makeCtx({ currentPlayer: '1' })}
        moves={{ ...noopMoves, playCard }}
        playerID="0"
        isActive={false}
      />,
    );
    const byNumber = screen.getByRole('button', { name: 'TEST_by_number' });
    expect(byNumber).not.toBeDisabled();

    fireEvent.click(byNumber);

    expect(handCardLabels()).toEqual(['TEST_reorder TEST_blue 3', 'TEST_reorder TEST_yellow 7']);
    expect(playCard).not.toHaveBeenCalled();
  });

  it('renders no hand or arrangement controls for a spectator', () => {
    render(
      <CahootsBoard
        G={seatedView({ hands: {} })}
        ctx={makeCtx()}
        moves={{ ...noopMoves }}
        playerID={null}
        isActive={false}
      />,
    );
    expect(screen.queryByRole('group', { name: 'TEST_your_hand' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'TEST_arrange_hand' })).not.toBeInTheDocument();
  });

  it('still renders the four piles alongside the hand -- one DndContext serves both', () => {
    render(
      <CahootsBoard
        G={seatedView({ hands: { '0': [yellow7, blue3] } })}
        ctx={makeCtx()}
        moves={{ ...noopMoves }}
        playerID="0"
        isActive={true}
      />,
    );
    for (let i = 1; i <= 4; i++) {
      expect(screen.getByText(`TEST_pile ${i}`)).toBeInTheDocument();
    }
    expect(screen.getByRole('group', { name: 'TEST_your_hand' })).toBeInTheDocument();
  });
});
