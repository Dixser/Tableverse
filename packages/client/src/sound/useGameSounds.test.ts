// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Ctx } from 'boardgame.io';
import type { BoardProps, GameLogEntry } from '@tableverse/game-core';

const { mockPlayCue } = vi.hoisted(() => ({ mockPlayCue: vi.fn() }));
vi.mock('./soundPlayer.js', () => ({ playCue: mockPlayCue }));

const { useGameSounds } = await import('./useGameSounds.js');

interface BoardShape {
  log?: GameLogEntry[];
  roundConfirm?: unknown;
}

function board(
  G: BoardShape = {},
  overrides: Partial<Omit<BoardProps, 'G'>> = {},
): BoardProps {
  return {
    G,
    ctx: { gameover: undefined } as unknown as Ctx,
    moves: {},
    playerID: '0',
    isActive: false,
    ...overrides,
  };
}

/** Renders the hook and returns a rerender helper typed for BoardProps. */
function mount(initial: BoardProps | null) {
  return renderHook((props: BoardProps | null) => useGameSounds(props), {
    initialProps: initial,
  });
}

describe('useGameSounds — per-game log cues', () => {
  beforeEach(() => mockPlayCue.mockClear());

  it('plays nothing for entries already present on first sight', () => {
    mount(
      board({
        log: [
          { key: 'regicide.log.cardsPlayed', sound: 'play' },
          { key: 'regicide.log.enemyDefeated', sound: 'success' },
        ],
      }),
    );

    expect(mockPlayCue).not.toHaveBeenCalled();
  });

  it('plays a newly appended entry exactly once', () => {
    const { rerender } = mount(board({ log: [{ key: 'a', sound: 'play' }] }));

    rerender(
      board({ log: [{ key: 'a', sound: 'play' }, { key: 'b', sound: 'success' }] }),
    );

    expect(mockPlayCue).toHaveBeenCalledTimes(1);
    expect(mockPlayCue).toHaveBeenCalledWith('success');
  });

  it('does not replay on a re-render that does not change the log length', () => {
    const log: GameLogEntry[] = [{ key: 'a' }];
    const { rerender } = mount(board({ log }));

    rerender(board({ log: [...log, { key: 'b', sound: 'failure' }] }));
    rerender(board({ log: [...log, { key: 'b', sound: 'failure' }] }));
    rerender(board({ log: [...log, { key: 'b', sound: 'failure' }] }));

    expect(mockPlayCue).toHaveBeenCalledTimes(1);
  });

  it('plays nothing for an appended entry with no sound field', () => {
    const { rerender } = mount(board({ log: [] }));

    rerender(board({ log: [{ key: 'theMind.log.levelComplete' }] }));

    expect(mockPlayCue).not.toHaveBeenCalled();
  });

  it('plays each cue when several entries are appended in one update', () => {
    const { rerender } = mount(board({ log: [] }));

    rerender(
      board({
        log: [
          { key: 'a', sound: 'play' },
          { key: 'b' },
          { key: 'c', sound: 'failure' },
        ],
      }),
    );

    expect(mockPlayCue).toHaveBeenCalledTimes(2);
    expect(mockPlayCue).toHaveBeenNthCalledWith(1, 'play');
    expect(mockPlayCue).toHaveBeenNthCalledWith(2, 'failure');
  });

  it('re-baselines silently when the log shrinks (a rematch reset it)', () => {
    const { rerender } = mount(
      board({ log: [{ key: 'a' }, { key: 'b' }, { key: 'c' }] }),
    );

    // Rematch: the new match's log starts empty again.
    rerender(board({ log: [] }));
    expect(mockPlayCue).not.toHaveBeenCalled();

    // And the new match's first real entry still plays.
    rerender(board({ log: [{ key: 'fresh', sound: 'play' }] }));
    expect(mockPlayCue).toHaveBeenCalledTimes(1);
    expect(mockPlayCue).toHaveBeenCalledWith('play');
  });

  it('resets when the match goes away, then baselines the next one silently', () => {
    const { rerender } = mount(board({ log: [{ key: 'a', sound: 'play' }] }));

    rerender(null);
    rerender(board({ log: [{ key: 'x', sound: 'success' }, { key: 'y', sound: 'success' }] }));

    expect(mockPlayCue).not.toHaveBeenCalled();
  });

  it('plays log cues for a spectator too', () => {
    const { rerender } = mount(board({ log: [] }, { playerID: null, isActive: false }));

    rerender(board({ log: [{ key: 'a', sound: 'special' }] }, { playerID: null }));

    expect(mockPlayCue).toHaveBeenCalledWith('special');
  });

  it('tolerates a malformed log without throwing', () => {
    const { rerender } = mount(board({ log: undefined }));
    expect(() =>
      rerender(board({ log: 'not an array' as unknown as GameLogEntry[] })),
    ).not.toThrow();
    expect(mockPlayCue).not.toHaveBeenCalled();
  });
});

describe('useGameSounds — turn cue', () => {
  beforeEach(() => mockPlayCue.mockClear());

  it('plays on a false -> true transition', () => {
    const { rerender } = mount(board({}, { isActive: false }));

    rerender(board({}, { isActive: true }));

    expect(mockPlayCue).toHaveBeenCalledTimes(1);
    expect(mockPlayCue).toHaveBeenCalledWith('turn');
  });

  it('does not play on true -> true', () => {
    const { rerender } = mount(board({}, { isActive: true }));
    rerender(board({}, { isActive: true }));
    expect(mockPlayCue).not.toHaveBeenCalled();
  });

  it('does not play on true -> false', () => {
    const { rerender } = mount(board({}, { isActive: true }));
    rerender(board({}, { isActive: false }));
    expect(mockPlayCue).not.toHaveBeenCalled();
  });

  it('does not play on the first observation of an already-active seat', () => {
    // Reconnecting into your own live turn should not ping you.
    mount(board({}, { isActive: true }));
    expect(mockPlayCue).not.toHaveBeenCalled();
  });

  it('does not play when the focused seat changes, even false -> true', () => {
    // The SeatSwitcher case: boardProps swaps seats without ever nulling.
    const { rerender } = mount(board({}, { playerID: '0', isActive: false }));

    rerender(board({}, { playerID: '1', isActive: true }));

    expect(mockPlayCue).not.toHaveBeenCalled();
  });

  it('still plays for the new seat once it has been baselined', () => {
    const { rerender } = mount(board({}, { playerID: '0', isActive: false }));

    rerender(board({}, { playerID: '1', isActive: false }));
    expect(mockPlayCue).not.toHaveBeenCalled();

    rerender(board({}, { playerID: '1', isActive: true }));
    expect(mockPlayCue).toHaveBeenCalledTimes(1);
    expect(mockPlayCue).toHaveBeenCalledWith('turn');
  });

  it('stays silent for a permanently-active turnless game', () => {
    // The Mind: ActivePlayers.ALL means isActive is true from setup and
    // never transitions, so no edge ever occurs.
    const { rerender } = mount(board({ log: [] }, { isActive: true }));
    rerender(board({ log: [{ key: 'theMind.log.cardPlayed' }] }, { isActive: true }));
    rerender(board({ log: [{ key: 'a' }, { key: 'b' }] }, { isActive: true }));

    expect(mockPlayCue).not.toHaveBeenCalled();
  });
});

describe('useGameSounds — round cue', () => {
  beforeEach(() => mockPlayCue.mockClear());

  it('plays when roundConfirm goes null -> non-null', () => {
    const { rerender } = mount(board({ roundConfirm: null }));

    rerender(board({ roundConfirm: { pendingSeatIDs: ['0'], confirmedSeatIDs: [] } }));

    expect(mockPlayCue).toHaveBeenCalledTimes(1);
    expect(mockPlayCue).toHaveBeenCalledWith('round');
  });

  it('does not repeat as individual seats confirm', () => {
    const { rerender } = mount(board({ roundConfirm: null }));

    rerender(board({ roundConfirm: { pendingSeatIDs: ['0', '1'], confirmedSeatIDs: [] } }));
    rerender(board({ roundConfirm: { pendingSeatIDs: ['0', '1'], confirmedSeatIDs: ['0'] } }));
    rerender(board({ roundConfirm: { pendingSeatIDs: ['0', '1'], confirmedSeatIDs: ['0', '1'] } }));

    expect(mockPlayCue).toHaveBeenCalledTimes(1);
  });

  it('does not play when the wait resolves back to null', () => {
    const { rerender } = mount(board({ roundConfirm: { pendingSeatIDs: [], confirmedSeatIDs: [] } }));

    rerender(board({ roundConfirm: null }));

    expect(mockPlayCue).not.toHaveBeenCalled();
  });

  it('never plays for a game whose G has no roundConfirm field', () => {
    // Tic-Tac-Toe and Cahoots -- silent with no special case.
    const { rerender } = mount(board({ log: [] }));
    rerender(board({ log: [{ key: 'tictactoe.log.moved' }] }));

    expect(mockPlayCue).not.toHaveBeenCalled();
  });

  it('plays for a spectator, unlike the outcome cue', () => {
    const { rerender } = mount(board({ roundConfirm: null }, { playerID: null }));

    rerender(
      board({ roundConfirm: { pendingSeatIDs: ['0'], confirmedSeatIDs: [] } }, { playerID: null }),
    );

    expect(mockPlayCue).toHaveBeenCalledTimes(1);
    expect(mockPlayCue).toHaveBeenCalledWith('round');
  });
});

describe('useGameSounds — outcome cue', () => {
  beforeEach(() => mockPlayCue.mockClear());

  function ended(gameover: unknown, playerID: string | null = '0'): BoardProps {
    return {
      ...board({}, { playerID }),
      ctx: { gameover } as unknown as Ctx,
    };
  }

  it('plays win for the winner', () => {
    const { rerender } = mount(board());
    rerender(ended({ winner: '0' }));
    expect(mockPlayCue).toHaveBeenCalledTimes(1);
    expect(mockPlayCue).toHaveBeenCalledWith('win');
  });

  it('plays lose for a non-winner', () => {
    const { rerender } = mount(board());
    rerender(ended({ winner: '1' }));
    expect(mockPlayCue).toHaveBeenCalledTimes(1);
    expect(mockPlayCue).toHaveBeenCalledWith('lose');
  });

  it('plays draw for a draw', () => {
    const { rerender } = mount(board());
    rerender(ended({ draw: true }));
    expect(mockPlayCue).toHaveBeenCalledTimes(1);
    expect(mockPlayCue).toHaveBeenCalledWith('draw');
  });

  it('plays exactly once across repeated renders of the ended match', () => {
    const { rerender } = mount(board());
    rerender(ended({ winner: '0' }));
    rerender(ended({ winner: '0' }));
    rerender(ended({ winner: '0' }));
    expect(mockPlayCue).toHaveBeenCalledTimes(1);
  });

  it('plays nothing for a spectator', () => {
    const { rerender } = mount(board({}, { playerID: null }));
    rerender(ended({ winner: '0' }, null));
    expect(mockPlayCue).not.toHaveBeenCalled();
  });

  it('does not fire a second cue when the game also logged a terminal entry without a sound', () => {
    // The double-fire guard, from the consuming side: regicide pushes
    // matchWon alongside setting matchResult, deliberately with no cue.
    const { rerender } = mount(board({ log: [] }));

    rerender({
      ...board({ log: [{ key: 'regicide.log.matchWon' }] }),
      ctx: { gameover: { winner: '0' } } as unknown as Ctx,
    });

    expect(mockPlayCue).toHaveBeenCalledTimes(1);
    expect(mockPlayCue).toHaveBeenCalledWith('win');
  });
});
