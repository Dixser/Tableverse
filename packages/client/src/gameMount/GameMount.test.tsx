import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GameMount } from './GameMount.js';

describe('GameMount', () => {
  it('renders a placeholder without throwing when no game is selected', () => {
    expect(() => render(<GameMount selectedGameID={null} boardProps={null} />)).not.toThrow();
    expect(screen.getByText(/no game selected/i)).toBeInTheDocument();
  });

  it('renders a placeholder without throwing for a selectedGameID not present in the catalog', () => {
    expect(() =>
      render(<GameMount selectedGameID="nonexistent-game-v1" boardProps={null} />),
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
      />,
    );
    expect(screen.getByTestId('game-mount')).toBeInTheDocument();
    expect(screen.getAllByRole('gridcell')).toHaveLength(9);
  });

  it('spectates (no throw) when tictactoe-v1 is selected but no seat is claimed (boardProps null)', () => {
    expect(() =>
      render(<GameMount selectedGameID="tictactoe-v1" boardProps={null} />),
    ).not.toThrow();
    expect(screen.getByText(/spectating tic-tac-toe/i)).toBeInTheDocument();
  });
});
