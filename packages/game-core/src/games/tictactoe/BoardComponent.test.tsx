// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Ctx } from 'boardgame.io';
import { TicTacToeBoard } from './BoardComponent.js';
import type { TicTacToeG } from './gameDef.js';

function makeCtx(overrides: Partial<Ctx> = {}): Ctx {
  return {
    numPlayers: 2,
    playOrder: ['0', '1'],
    playOrderPos: 0,
    activePlayers: null,
    currentPlayer: '0',
    turn: 1,
    phase: 'default',
    ...overrides,
  };
}

describe('TicTacToeBoard', () => {
  it('AC7: renders a 3x3 grid reflecting the current board state', () => {
    const G: TicTacToeG = {
      cells: ['0', '1', null, null, null, null, null, null, null],
    };
    render(
      <TicTacToeBoard
        G={G}
        ctx={makeCtx()}
        moves={{ play: vi.fn() }}
        playerID="0"
        isActive={true}
      />,
    );
    const cells = screen.getAllByRole('gridcell');
    expect(cells).toHaveLength(9);
    expect(cells[0]).toHaveTextContent('X');
    expect(cells[1]).toHaveTextContent('O');
    expect(cells[2]).toHaveTextContent('');
  });

  it('AC7: clicking an empty cell calls play with the correct cell index', () => {
    const play = vi.fn();
    const G: TicTacToeG = { cells: Array(9).fill(null) };
    render(
      <TicTacToeBoard
        G={G}
        ctx={makeCtx()}
        moves={{ play }}
        playerID="0"
        isActive={true}
      />,
    );
    screen.getAllByRole('gridcell')[4]!.click();
    expect(play).toHaveBeenCalledWith(4);
  });

  it('AC7: clicking an occupied cell does not call play', () => {
    const play = vi.fn();
    const G: TicTacToeG = {
      cells: ['0', null, null, null, null, null, null, null, null],
    };
    render(
      <TicTacToeBoard
        G={G}
        ctx={makeCtx()}
        moves={{ play }}
        playerID="1"
        isActive={true}
      />,
    );
    const firstCell = screen.getAllByRole('gridcell')[0]!;
    expect(firstCell).toBeDisabled();
    firstCell.click();
    expect(play).not.toHaveBeenCalled();
  });

  it('AC7: clicking any cell after game-over does not call play', () => {
    const play = vi.fn();
    const G: TicTacToeG = {
      cells: ['0', '0', '0', null, null, null, null, null, null],
    };
    render(
      <TicTacToeBoard
        G={G}
        ctx={makeCtx({ gameover: { winner: '0' } })}
        moves={{ play }}
        playerID="1"
        isActive={true}
      />,
    );
    screen.getAllByRole('gridcell')[4]!.click();
    expect(play).not.toHaveBeenCalled();
  });

  it('AC8: renders only the grid -- no chrome (player list, seat controls, presence)', () => {
    const G: TicTacToeG = { cells: Array(9).fill(null) };
    const { container } = render(
      <TicTacToeBoard
        G={G}
        ctx={makeCtx()}
        moves={{ play: vi.fn() }}
        playerID="0"
        isActive={true}
      />,
    );
    expect(container.querySelectorAll('[role=grid]')).toHaveLength(1);
    expect(container.querySelectorAll('[role=gridcell]')).toHaveLength(9);
    // No headings, lists, or anything resembling room chrome.
    expect(container.querySelector('h1, h2, ul, [role=status]')).toBeNull();
  });
});
