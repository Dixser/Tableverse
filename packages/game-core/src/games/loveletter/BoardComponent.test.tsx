// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { Ctx } from 'boardgame.io';
import './i18nFixture.js';
import { LoveLetterBoard } from './BoardComponent.js';
import type { LoveLetterView } from './gameDef.js';

function makeCtx(overrides: Partial<Ctx> = {}): Ctx {
  return {
    numPlayers: 2,
    playOrder: ['0', '1'],
    playOrderPos: 0,
    activePlayers: null,
    currentPlayer: '0',
    turn: 1,
    phase: 'round',
    ...overrides,
  };
}

function seatedView(overrides: Partial<LoveLetterView> = {}): LoveLetterView {
  return {
    edition: 'normal',
    deckCount: 10,
    setAsideFaceup: [],
    hands: { '0': [2, 8] },
    privateReveals: { '0': [] },
    chancellorDraw: { '0': [] },
    eliminated: { '0': false, '1': false },
    handmaidProtected: { '0': false, '1': false },
    playedCards: { '0': [], '1': [3] },
    roundWins: { '0': 1, '1': 0 },
    log: [],
    nextRoundStartPlayerID: null,
    matchWinners: null,
    deckExhausted: false,
    activeSeatIDs: ['0', '1'],
    ...overrides,
  };
}

function spectatorView(overrides: Partial<LoveLetterView> = {}): LoveLetterView {
  return {
    ...seatedView(overrides),
    hands: {},
    privateReveals: {},
    chancellorDraw: {},
  };
}

describe('LoveLetterBoard', () => {
  it('AC10: renders no player list, seat controls, presence badges, or chat', () => {
    const { container } = render(
      <LoveLetterBoard
        G={seatedView()}
        ctx={makeCtx()}
        moves={{ playCard: vi.fn(), chancellorKeep: vi.fn() }}
        playerID="0"
        isActive={true}
      />,
    );
    expect(container.querySelector('ul[aria-label="Chat"]')).toBeNull();
    expect(container.querySelector('[role=tablist]')).toBeNull();
    expect(container.querySelector('h1, h2')).toBeNull();
    expect(screen.queryByText('Players')).toBeNull();
  });

  it('AC9: a seated player sees their own hand', () => {
    render(
      <LoveLetterBoard
        G={seatedView()}
        ctx={makeCtx()}
        moves={{ playCard: vi.fn(), chancellorKeep: vi.fn() }}
        playerID="0"
        isActive={true}
      />,
    );
    expect(screen.getByText('TEST_Priest')).toBeInTheDocument();
    expect(screen.getByText('TEST_Countess')).toBeInTheDocument();
  });

  it('AC9: a spectator sees the same public state but no hand for any player', () => {
    render(
      <LoveLetterBoard
        G={spectatorView()}
        ctx={makeCtx()}
        moves={{ playCard: vi.fn(), chancellorKeep: vi.fn() }}
        playerID={null}
        isActive={false}
      />,
    );
    // Public state still visible: round wins, play areas.
    expect(screen.getByText('Seat 1: 1')).toBeInTheDocument();
    expect(screen.getByText('Seat 2: 0')).toBeInTheDocument();
    expect(screen.getByText('TEST_Baron')).toBeInTheDocument(); // '1's played card.
    // No hand rendered for anyone.
    expect(screen.queryByText('TEST_Priest')).toBeNull();
    expect(screen.queryByText('TEST_Countess')).toBeNull();
  });

  it('composes the full Guard flow: pick card -> pick target -> pick guess -> playCard', () => {
    const playCard = vi.fn();
    render(
      <LoveLetterBoard
        G={seatedView({ hands: { '0': [1, 0] } })}
        ctx={makeCtx()}
        moves={{ playCard, chancellorKeep: vi.fn() }}
        playerID="0"
        isActive={true}
      />,
    );
    fireEvent.click(screen.getByText('TEST_Guard').closest('button')!);
    fireEvent.click(screen.getByText('TEST_play')); // play-or-discard step -- choose Play.
    const targetPicker = screen.getByRole('group', { name: 'TEST_pick_a_target' });
    fireEvent.click(within(targetPicker).getByText('Seat 2')); // target '1'.
    const guessPicker = screen.getByRole('group', { name: 'TEST_guess_a_rank' });
    fireEvent.click(within(guessPicker).getByText('TEST_Princess')); // guess rank 9.
    expect(playCard).toHaveBeenCalledWith(0, { target: '1', guessRank: 9 });
  });

  it('discarding a targeted card skips targeting entirely and calls playCard with discard: true', () => {
    const playCard = vi.fn();
    render(
      <LoveLetterBoard
        G={seatedView({ hands: { '0': [1, 0] } })}
        ctx={makeCtx()}
        moves={{ playCard, chancellorKeep: vi.fn() }}
        playerID="0"
        isActive={true}
      />,
    );
    fireEvent.click(screen.getByText('TEST_Guard').closest('button')!);
    fireEvent.click(screen.getByText('TEST_discard'));
    expect(playCard).toHaveBeenCalledWith(0, { discard: true });
    // No target/guess picker ever appears for a discard.
    expect(screen.queryByRole('group', { name: 'TEST_pick_a_target' })).toBeNull();
  });

  it('cancelling the play-or-discard step returns to idle without calling playCard', () => {
    const playCard = vi.fn();
    render(
      <LoveLetterBoard
        G={seatedView({ hands: { '0': [1, 0] } })}
        ctx={makeCtx()}
        moves={{ playCard, chancellorKeep: vi.fn() }}
        playerID="0"
        isActive={true}
      />,
    );
    fireEvent.click(screen.getByText('TEST_Guard').closest('button')!);
    fireEvent.click(screen.getByText('TEST_cancel'));
    expect(playCard).not.toHaveBeenCalled();
    expect(screen.queryByRole('group', { name: 'TEST_play_or_discard' })).toBeNull();
  });

  it('renders ChancellorPicker once G.chancellorDraw is populated, and wires chancellorKeep', () => {
    const chancellorKeep = vi.fn();
    render(
      <LoveLetterBoard
        G={seatedView({ hands: { '0': [] }, chancellorDraw: { '0': [0, 4, 3] } })}
        ctx={makeCtx()}
        moves={{ playCard: vi.fn(), chancellorKeep }}
        playerID="0"
        isActive={true}
      />,
    );
    fireEvent.click(screen.getByText('TEST_Handmaid').closest('button')!); // keep candidate index 1 (rank 4).
    // 2 non-kept candidates remain (Spy=0, Baron=3) -- the order step.
    // Scoped via the group (seatedView's own PlayArea also has a Baron).
    const orderPicker = screen.getByRole('group', { name: 'TEST_choose_return_order' });
    fireEvent.click(within(orderPicker).getByText('TEST_Baron').closest('button')!); // index 2 returns first.
    expect(chancellorKeep).toHaveBeenCalledWith(1, [2, 0]);
  });

  it('renders the private reveal toast from privateReveals, only for the acting player', () => {
    render(
      <LoveLetterBoard
        G={seatedView({
          privateReveals: {
            '0': [{ key: 'loveLetter.reveal.priestViewed', params: { opponent: '1', opponentRank: 9 } }],
          },
        })}
        ctx={makeCtx()}
        moves={{ playCard: vi.fn(), chancellorKeep: vi.fn() }}
        playerID="0"
        isActive={true}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('TEST_priest_viewed 1 9');
  });

  it('does not leak a private reveal across a SeatSwitcher change to a different viewed seat', () => {
    const { rerender } = render(
      <LoveLetterBoard
        G={seatedView({
          hands: { '0': [2, 0] },
          privateReveals: {
            '0': [{ key: 'loveLetter.reveal.priestViewed', params: { opponent: '1', opponentRank: 9 } }],
          },
        })}
        ctx={makeCtx()}
        moves={{ playCard: vi.fn(), chancellorKeep: vi.fn() }}
        playerID="0"
        isActive={true}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('TEST_priest_viewed 1 9');

    // Switching the viewed seat (as SeatSwitcher does) to a different
    // playerID whose own privateReveals is empty must not keep showing
    // seat '0's already-rendered reveal.
    rerender(
      <LoveLetterBoard
        G={seatedView({ hands: { '1': [7] }, privateReveals: { '1': [] } })}
        ctx={makeCtx()}
        moves={{ playCard: vi.fn(), chancellorKeep: vi.fn() }}
        playerID="1"
        isActive={false}
      />,
    );
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows whose turn it is and how many cards remain in the deck', () => {
    render(
      <LoveLetterBoard
        G={seatedView({ deckCount: 7 })}
        ctx={makeCtx({ currentPlayer: '1' })}
        moves={{ playCard: vi.fn(), chancellorKeep: vi.fn() }}
        playerID="0"
        isActive={false}
      />,
    );
    expect(screen.getByText('TEST_current_turn Seat 2')).toBeInTheDocument();
    expect(screen.getByText('TEST_deck_count 7')).toBeInTheDocument();
  });

  it('shows a username instead of a seat label once playerNames has synced, and reflects it in the turn indicator', () => {
    render(
      <LoveLetterBoard
        G={seatedView()}
        ctx={makeCtx({ currentPlayer: '1' })}
        moves={{ playCard: vi.fn(), chancellorKeep: vi.fn() }}
        playerID="0"
        isActive={true}
        playerNames={{ '0': 'Alice', '1': 'Bob' }}
      />,
    );
    expect(screen.getByText('TEST_current_turn Bob')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument(); // PlayArea's seat header.
    expect(screen.queryByText('Seat 2')).toBeNull();
  });

  it('renders only claimed seats (per playerNames) in PlayArea/RoundWinsTracker, excluding phantom unclaimed seats', () => {
    render(
      <LoveLetterBoard
        G={seatedView({
          eliminated: { '0': false, '1': false, '2': false },
          handmaidProtected: { '0': false, '1': false, '2': false },
          playedCards: { '0': [], '1': [3], '2': [] },
          roundWins: { '0': 1, '1': 0, '2': 0 },
        })}
        ctx={makeCtx({ numPlayers: 3, playOrder: ['0', '1', '2'] })}
        moves={{ playCard: vi.fn(), chancellorKeep: vi.fn() }}
        playerID="0"
        isActive={true}
        playerNames={{ '0': 'Alice', '1': 'Bob' }} // seat '2' never claimed.
      />,
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.queryByText('Seat 3')).toBeNull();
    expect(screen.getByText('Bob: 0')).toBeInTheDocument();
    expect(screen.queryByText('Seat 3: 0')).toBeNull();
  });

  it('excludes an unclaimed phantom seat from the TargetPicker even when it would otherwise be eligible', () => {
    render(
      <LoveLetterBoard
        G={seatedView({
          hands: { '0': [7, 0] }, // King -- targeted rank.
          eliminated: { '0': false, '1': false, '2': false },
          handmaidProtected: { '0': false, '1': false, '2': false },
          playedCards: { '0': [], '1': [], '2': [] },
        })}
        ctx={makeCtx({ numPlayers: 3, playOrder: ['0', '1', '2'] })}
        moves={{ playCard: vi.fn(), chancellorKeep: vi.fn() }}
        playerID="0"
        isActive={true}
        playerNames={{ '0': 'Alice', '1': 'Bob' }} // seat '2' never claimed.
      />,
    );
    fireEvent.click(screen.getByText('TEST_King').closest('button')!);
    fireEvent.click(screen.getByText('TEST_play')); // play-or-discard step -- choose Play.
    const targetPicker = screen.getByRole('group', { name: 'TEST_pick_a_target' });
    expect(within(targetPicker).getByText('Bob')).toBeInTheDocument();
    expect(within(targetPicker).queryByText('Seat 3')).toBeNull();
  });
});
