import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GameMount } from './GameMount.js';

describe('GameMount', () => {
  it('renders a placeholder without throwing when no game is selected', () => {
    expect(() =>
      render(<GameMount selectedGameID={null} boardProps={null} playerNames={{}} />),
    ).not.toThrow();
    expect(screen.getByText(/no game selected/i)).toBeInTheDocument();
  });

  it('renders a placeholder without throwing for a selectedGameID not present in the catalog', () => {
    expect(() =>
      render(
        <GameMount selectedGameID="nonexistent-game-v1" boardProps={null} playerNames={{}} />,
      ),
    ).not.toThrow();
    expect(screen.getByText(/unknown game/i)).toBeInTheDocument();
  });

  it('renders the registered tictactoe-v1 module\'s BoardComponent when a seat is claimed (boardProps present)', () => {
    render(
      <GameMount
        selectedGameID="tictactoe-v1"
        boardProps={{
          G: { cells: Array(9).fill(null) },
          ctx: {
            numPlayers: 2,
            playOrder: ['0', '1'],
            playOrderPos: 0,
            activePlayers: null,
            currentPlayer: '0',
            turn: 1,
            phase: 'default',
          },
          moves: { play: () => {} },
          playerID: '0',
          isActive: true,
        }}
        playerNames={{}}
      />,
    );
    expect(screen.getByTestId('game-mount')).toBeInTheDocument();
    expect(screen.getAllByRole('gridcell')).toHaveLength(9);
  });

  it('renders the live board for a spectator (playerID: null, empty moves) exactly like a claimed seat', () => {
    render(
      <GameMount
        selectedGameID="tictactoe-v1"
        boardProps={{
          G: { cells: Array(9).fill(null) },
          ctx: {
            numPlayers: 2,
            playOrder: ['0', '1'],
            playOrderPos: 0,
            activePlayers: null,
            currentPlayer: '0',
            turn: 1,
            phase: 'default',
          },
          moves: {},
          playerID: null,
          isActive: false,
        }}
        playerNames={{}}
      />,
    );
    expect(screen.getByTestId('game-mount')).toBeInTheDocument();
    expect(screen.getAllByRole('gridcell')).toHaveLength(9);
  });

  it('shows a waiting placeholder (no throw) when tictactoe-v1 is selected but boardProps is null (no live match/client yet)', () => {
    expect(() =>
      render(<GameMount selectedGameID="tictactoe-v1" boardProps={null} playerNames={{}} />),
    ).not.toThrow();
    expect(screen.getByText(/waiting for the match to start/i)).toBeInTheDocument();
  });

  it('feature 009: renders the gameover banner above the board, naming the winner by display name', () => {
    render(
      <GameMount
        selectedGameID="tictactoe-v1"
        boardProps={{
          G: { cells: ['0', '0', '0', null, null, null, null, null, null] },
          ctx: {
            numPlayers: 2,
            playOrder: ['0', '1'],
            playOrderPos: 1,
            activePlayers: null,
            currentPlayer: '1',
            turn: 5,
            phase: 'default',
            gameover: { winner: '0' },
          },
          moves: { play: () => {} },
          playerID: '1',
          isActive: false,
        }}
        playerNames={{ '0': 'Alice' }}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Alice wins!');
    // Still renders the (now-inert) board underneath the banner.
    expect(screen.getAllByRole('gridcell')).toHaveLength(9);
  });

  it('feature 009: falls back to a seat label when no display name has synced yet', () => {
    render(
      <GameMount
        selectedGameID="tictactoe-v1"
        boardProps={{
          G: { cells: ['0', '0', '0', null, null, null, null, null, null] },
          ctx: {
            numPlayers: 2,
            playOrder: ['0', '1'],
            playOrderPos: 1,
            activePlayers: null,
            currentPlayer: '1',
            turn: 5,
            phase: 'default',
            gameover: { winner: '0' },
          },
          moves: { play: () => {} },
          playerID: '1',
          isActive: false,
        }}
        playerNames={{}}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Seat 1 wins!');
  });

  it('renders the round-confirm banner above the board when G.roundConfirm is set, and wires its Confirm button to boardProps.moves.confirmRoundReady', () => {
    const confirmRoundReady = vi.fn();
    render(
      <GameMount
        selectedGameID="tictactoe-v1"
        boardProps={{
          G: {
            cells: Array(9).fill(null),
            roundConfirm: { pendingSeatIDs: ['0', '1'], confirmedSeatIDs: ['1'] },
            hostPlayerID: null,
          },
          ctx: {
            numPlayers: 2,
            playOrder: ['0', '1'],
            playOrderPos: 0,
            activePlayers: null,
            currentPlayer: '0',
            turn: 1,
            phase: 'default',
          },
          moves: { play: () => {}, confirmRoundReady },
          playerID: '0',
          isActive: true,
        }}
        playerNames={{}}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('1 of 2 confirmed');
    fireEvent.click(screen.getByText('Ready for next round'));
    expect(confirmRoundReady).toHaveBeenCalledTimes(1);
  });

  it('feature 023: skips its own generic round-confirm banner for a game whose GameModule sets ownRoundConfirmUI (regicide-v1), leaving that UI entirely to the board', () => {
    render(
      <GameMount
        selectedGameID="regicide-v1"
        boardProps={{
          G: {
            activeSeatIDs: ['0', '1'],
            roundConfirm: { pendingSeatIDs: ['0', '1'], confirmedSeatIDs: ['1'] },
            hostPlayerID: null,
            currentEnemy: { id: 'SK', kind: 'face', suit: 'S', rank: 'K' },
            discardPile: [],
            cardsInPlay: [],
            damageDealt: 40,
            spadeShieldTotal: 0,
            enemyImmunityCancelled: false,
            lastActionWasYield: { '0': false, '1': false },
            pendingDefense: null,
            pendingEnemyDisposal: null,
            forcedNextSeatID: null,
            nextTurnStartSeatID: null,
            log: [],
            matchResult: null,
            tavernCount: 20,
            enemyNumber: 1,
            handCounts: { '0': 6, '1': 6 },
            hands: { '0': [] },
          },
          ctx: {
            numPlayers: 2,
            playOrder: ['0', '1'],
            playOrderPos: 0,
            activePlayers: null,
            currentPlayer: '0',
            turn: 1,
            phase: 'roundConfirm',
          },
          moves: { confirmRoundReady: () => {}, forceAdvanceRound: () => {} },
          playerID: '0',
          isActive: false,
        }}
        playerNames={{}}
      />,
    );
    // RegicideBoard's own EnemyPanel reuses the exact same roundConfirm.*
    // strings/roles as the generic banner (see roundConfirmDisplay.ts's
    // doc comment) -- so the real regression this guards against is a
    // literal duplicate control, not merely "a status role exists".
    expect(screen.getAllByText('Ready for next round')).toHaveLength(1);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByTestId('game-mount')).toBeInTheDocument();
  });

  it('renders no round-confirm banner for a game whose G has no roundConfirm field at all', () => {
    render(
      <GameMount
        selectedGameID="tictactoe-v1"
        boardProps={{
          G: { cells: Array(9).fill(null) },
          ctx: {
            numPlayers: 2,
            playOrder: ['0', '1'],
            playOrderPos: 0,
            activePlayers: null,
            currentPlayer: '0',
            turn: 1,
            phase: 'default',
          },
          moves: { play: () => {} },
          playerID: '0',
          isActive: true,
        }}
        playerNames={{}}
      />,
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
