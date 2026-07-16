// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { Ctx } from 'boardgame.io';
import './i18nFixture.js';
import { RegicideBoard } from './BoardComponent.js';
import type { RegicideView } from './gameDef.js';
import type { Card, FaceCard } from './deck.js';

const s4: Card = { id: 'S4', kind: 'number', suit: 'S', rank: 4 };
const h4: Card = { id: 'H4', kind: 'number', suit: 'H', rank: 4 };
const jester: Card = { id: 'Jester1', kind: 'jester' };
const kingS: FaceCard = { id: 'SK', kind: 'face', suit: 'S', rank: 'K' };

function makeCtx(overrides: Partial<Ctx> = {}): Ctx {
  return {
    numPlayers: 2,
    playOrder: ['0', '1'],
    playOrderPos: 0,
    activePlayers: null,
    currentPlayer: '0',
    turn: 1,
    phase: 'combat',
    ...overrides,
  };
}

function seatedView(overrides: Partial<RegicideView> = {}): RegicideView {
  return {
    activeSeatIDs: ['0', '1'],
    roundConfirm: null,
    hostPlayerID: null,
    currentEnemy: kingS,
    discardPile: [],
    cardsInPlay: [],
    damageDealt: 0,
    spadeShieldTotal: 0,
    enemyImmunityCancelled: false,
    lastActionWasYield: { '0': false, '1': false },
    pendingDefense: null,
    pendingEnemyDisposal: null,
    forcedNextSeatID: null,
    nextTurnStartSeatID: null,
    log: [],
    matchResult: null,
    tavernCount: 30,
    enemyNumber: 1,
    handCounts: { '0': 7, '1': 7 },
    hands: { '0': [] },
    ...overrides,
  };
}

function spectatorView(overrides: Partial<RegicideView> = {}): RegicideView {
  return { ...seatedView(overrides), hands: {} };
}

const noopMoves = {
  playCards: vi.fn(),
  yield: vi.fn(),
  discardCards: vi.fn(),
  confirmRoundReady: vi.fn(),
  forceAdvanceRound: vi.fn(),
};

describe('RegicideBoard', () => {
  it('AC1: toggling a card selects/deselects it, and Play enables/disables accordingly', () => {
    render(
      <RegicideBoard
        G={seatedView({ hands: { '0': [s4, h4] } })}
        ctx={makeCtx()}
        moves={{ ...noopMoves }}
        playerID="0"
        isActive={true}
      />,
    );
    const playButton = screen.getByText('TEST_Play');
    expect(playButton).toBeDisabled(); // empty selection.

    fireEvent.click(screen.getByText('TEST_4_of_TEST_Spades').closest('button')!);
    expect(playButton).not.toBeDisabled(); // single card always legal.

    fireEvent.click(screen.getByText('TEST_4_of_TEST_Spades').closest('button')!); // deselect.
    expect(playButton).toBeDisabled();
  });

  it('AC4: pressing Play calls playCards with exactly the selected ids and clears the selection', () => {
    const playCards = vi.fn();
    render(
      <RegicideBoard
        G={seatedView({ hands: { '0': [s4, h4] } })}
        ctx={makeCtx()}
        moves={{ ...noopMoves, playCards }}
        playerID="0"
        isActive={true}
      />,
    );
    fireEvent.click(screen.getByText('TEST_4_of_TEST_Spades').closest('button')!);
    fireEvent.click(screen.getByText('TEST_4_of_TEST_Hearts').closest('button')!); // same rank, sum 8.
    fireEvent.click(screen.getByText('TEST_Play'));
    expect(playCards).toHaveBeenCalledWith(['S4', 'H4']);
    // Selection cleared -- neither card still marked selected.
    expect(screen.getByText('TEST_4_of_TEST_Spades').closest('button')).toHaveAttribute('aria-pressed', 'false');
  });

  describe('AC5: Yield button', () => {
    it('is disabled with a visible reason when every other player yielded last turn', () => {
      render(
        <RegicideBoard
          G={seatedView({ hands: { '0': [s4] }, lastActionWasYield: { '0': false, '1': true } })}
          ctx={makeCtx()}
          moves={{ ...noopMoves }}
          playerID="0"
          isActive={true}
        />,
      );
      expect(screen.getByText('TEST_Yield')).toBeDisabled();
      expect(screen.getByText('TEST_yield_disabled_reason')).toBeInTheDocument();
    });

    it('is enabled with no reason text when at least one other player did not yield', () => {
      const yieldMove = vi.fn();
      render(
        <RegicideBoard
          G={seatedView({ hands: { '0': [s4] }, lastActionWasYield: { '0': false, '1': false } })}
          ctx={makeCtx()}
          moves={{ ...noopMoves, yield: yieldMove }}
          playerID="0"
          isActive={true}
        />,
      );
      const yieldButton = screen.getByText('TEST_Yield');
      expect(yieldButton).not.toBeDisabled();
      expect(screen.queryByText('TEST_yield_disabled_reason')).toBeNull();
      fireEvent.click(yieldButton);
      expect(yieldMove).toHaveBeenCalled();
    });
  });

  it("AC7: never leaks another seat's hand contents even when a broken fixture exposes them in G.hands", () => {
    render(
      <RegicideBoard
        // Simulates a broken playerView that (incorrectly) left another
        // seat's hand in G.hands alongside the viewer's own.
        G={seatedView({ hands: { '0': [s4], '1': [{ id: 'DQ', kind: 'face', suit: 'D', rank: 'Q' }] } })}
        ctx={makeCtx()}
        moves={{ ...noopMoves }}
        playerID="0"
        isActive={true}
      />,
    );
    expect(screen.getByText('TEST_4_of_TEST_Spades')).toBeInTheDocument(); // own hand.
    expect(screen.queryByText(/TEST_Queen_of_TEST_Diamonds/)).toBeNull(); // seat '1' never rendered.
  });

  describe('AC8: Jester next-player choice', () => {
    it("prompts the acting seat's own view with a seat picker, and calls playCards with jesterNextPlayerID", () => {
      const playCards = vi.fn();
      render(
        <RegicideBoard
          G={seatedView({ activeSeatIDs: ['0', '1', '2'], hands: { '0': [jester] } })}
          ctx={makeCtx({ numPlayers: 3, playOrder: ['0', '1', '2'] })}
          moves={{ ...noopMoves, playCards }}
          playerID="0"
          isActive={true}
          playerNames={{ '0': 'Alice', '1': 'Bob', '2': 'Carol' }}
        />,
      );
      fireEvent.click(screen.getByText('TEST_Jester').closest('button')!);
      fireEvent.click(screen.getByText('TEST_Play'));
      expect(playCards).not.toHaveBeenCalled(); // not yet -- next player still unchosen.
      const picker = screen.getByRole('group', { name: 'TEST_choose_who_goes_next' });
      expect(within(picker).queryByText('Alice')).toBeNull(); // acting seat itself excluded.
      fireEvent.click(within(picker).getByText('Bob'));
      expect(playCards).toHaveBeenCalledWith(['Jester1'], { jesterNextPlayerID: '1' });
    });

    it("shows no picker and only the current-turn indicator for every other seat's view", () => {
      render(
        <RegicideBoard
          G={seatedView({ activeSeatIDs: ['0', '1'] })}
          ctx={makeCtx({ currentPlayer: '0' })}
          moves={{ ...noopMoves }}
          playerID="1"
          isActive={false}
          playerNames={{ '0': 'Alice', '1': 'Bob' }}
        />,
      );
      expect(screen.queryByRole('group', { name: 'TEST_choose_who_goes_next' })).toBeNull();
      expect(screen.getByText('TEST_current_turn Alice')).toBeInTheDocument();
    });
  });

  describe('AC9a: round-defeat confirmation gates Play/Yield', () => {
    it('disables Play and Yield while G.roundConfirm is non-null, re-enabling once null again', () => {
      const { rerender } = render(
        <RegicideBoard
          G={seatedView({
            hands: { '0': [s4] },
            roundConfirm: { pendingSeatIDs: ['0', '1'], confirmedSeatIDs: [] },
          })}
          ctx={makeCtx()}
          moves={{ ...noopMoves }}
          playerID="0"
          isActive={true}
        />,
      );
      expect(screen.getByText('TEST_Play')).toBeDisabled();
      expect(screen.getByText('TEST_Yield')).toBeDisabled();

      rerender(
        <RegicideBoard
          G={seatedView({ hands: { '0': [s4] }, roundConfirm: null })}
          ctx={makeCtx()}
          moves={{ ...noopMoves }}
          playerID="0"
          isActive={true}
        />,
      );
      fireEvent.click(screen.getByText('TEST_4_of_TEST_Spades').closest('button')!);
      expect(screen.getByText('TEST_Play')).not.toBeDisabled();
      expect(screen.getByText('TEST_Yield')).not.toBeDisabled();
    });
  });

  it('AC10: a spectator sees the enemy panel, hand counts, and deck counts identically, but no hand for any seat', () => {
    render(
      <RegicideBoard
        G={spectatorView({ hands: {} })}
        ctx={makeCtx()}
        moves={{ ...noopMoves }}
        playerID={null}
        isActive={false}
      />,
    );
    expect(screen.getByText('TEST_tavern_count 30')).toBeInTheDocument();
    expect(screen.getByText('TEST_enemy_number 1')).toBeInTheDocument();
    expect(screen.getAllByText(/TEST_cards_left 7/)).toHaveLength(2); // both seats' hand counts.
    expect(screen.queryByText('TEST_Play')).toBeNull(); // no hand -> no Play/Yield controls at all.
    expect(screen.queryByText('TEST_Yield')).toBeNull();
  });

  it('AC11: renders no player list, seat controls, presence badges, or chat', () => {
    const { container } = render(
      <RegicideBoard
        G={seatedView()}
        ctx={makeCtx()}
        moves={{ ...noopMoves }}
        playerID="0"
        isActive={true}
      />,
    );
    expect(container.querySelector('ul[aria-label="Chat"]')).toBeNull();
    expect(container.querySelector('[role=tablist]')).toBeNull();
    expect(container.querySelector('h1, h2')).toBeNull();
    expect(screen.queryByText('Players')).toBeNull();
  });

  it('renders the defend panel instead of the hand/Play/Yield controls during the defend stage', () => {
    const discardCards = vi.fn();
    render(
      <RegicideBoard
        G={seatedView({ hands: { '0': [s4, h4] }, pendingDefense: { requiredTotal: 4 } })}
        ctx={makeCtx()}
        moves={{ ...noopMoves, discardCards }}
        playerID="0"
        isActive={true}
      />,
    );
    expect(screen.queryByText('TEST_Play')).toBeNull();
    expect(screen.queryByText('TEST_Yield')).toBeNull();
    fireEvent.click(screen.getByText('TEST_4_of_TEST_Spades').closest('button')!);
    fireEvent.click(screen.getByText('TEST_Discard'));
    expect(discardCards).toHaveBeenCalledWith(['S4']);
  });
});
