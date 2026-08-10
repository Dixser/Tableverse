import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import type { BoardProps } from '@tableverse/game-core';

/**
 * The chrome half of the balcony fix, tested against a stub board rather than
 * Magaluf.
 *
 * `onRevealPending` is a platform contract, not a Magaluf one: any game that
 * ends on a reveal of its own gets to hold the banner the same way. Testing it
 * through a real game would tie this to that game's state shape and prove less.
 */
const STUB_BOARD_ID = 'tictactoe-v1';

/**
 * Reports pending while `G.revealing` is true, exactly as MagalufBoard reports
 * while it still has an unseen jump, and offers a button to finish the reveal.
 */
function StubBoard({ G, onRevealPending }: BoardProps) {
  const [revealing, setRevealing] = useState(
    () => (G as { revealing?: boolean }).revealing === true,
  );
  useEffect(() => {
    onRevealPending?.(revealing);
    return () => onRevealPending?.(false);
  }, [revealing, onRevealPending]);

  return (
    <button type="button" data-testid="finish-reveal" onClick={() => setRevealing(false)}>
      finish
    </button>
  );
}

vi.mock('../boardRegistry.js', () => ({
  boardComponents: { [STUB_BOARD_ID]: StubBoard },
}));

const { GameMount } = await import('./GameMount.js');

function renderMount(revealing: boolean) {
  return render(
    <GameMount
      selectedGameID={STUB_BOARD_ID}
      boardProps={{
        G: { revealing },
        ctx: {
          numPlayers: 2,
          playOrder: ['0', '1'],
          playOrderPos: 0,
          activePlayers: null,
          currentPlayer: '0',
          turn: 1,
          phase: 'default',
          gameover: {
            winner: '0',
            standings: [
              { playerID: '0', score: 40 },
              { playerID: '1', score: 30 },
            ],
          },
        } as never,
        moves: {},
        playerID: '0',
        isActive: true,
      }}
      playerNames={{ '0': 'Alice', '1': 'Bob' }}
    />,
  );
}

describe('GameMount holding the gameover banner', () => {
  it('shows the banner immediately when the board has nothing to reveal', () => {
    renderMount(false);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('holds the banner back while the board is still revealing', () => {
    renderMount(true);
    // The whole bug: the winner was announced over the top of the die that
    // decides whether they are the winner.
    expect(screen.queryByRole('status')).toBeNull();
    // The board itself is still mounted and playing its reveal.
    expect(screen.getByTestId('finish-reveal')).toBeInTheDocument();
  });

  it('releases the banner once the reveal finishes', () => {
    renderMount(true);
    expect(screen.queryByRole('status')).toBeNull();

    fireEvent.click(screen.getByTestId('finish-reveal'));
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('releases the banner if the board unmounts mid-reveal', () => {
    const { unmount } = renderMount(true);
    expect(screen.queryByRole('status')).toBeNull();
    unmount();

    // A board torn down mid-reveal must not strand the banner for good -- the
    // next mount starts from a clean "nothing pending".
    renderMount(false);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
