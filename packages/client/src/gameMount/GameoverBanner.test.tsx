// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GameoverBanner, resolveGameoverMessage } from './GameoverBanner.js';

const NAMES = { '0': 'Alice', '1': 'Bob', '2': 'Carol' };

describe('resolveGameoverMessage', () => {
  it('returns null when gameover is undefined (match still in progress)', () => {
    expect(resolveGameoverMessage(undefined, '0', NAMES)).toBeNull();
  });

  it("returns a draw message regardless of viewer, ignoring names entirely", () => {
    expect(resolveGameoverMessage({ draw: true }, '0', NAMES)).toBe("It's a draw.");
    expect(resolveGameoverMessage({ draw: true }, null, {})).toBe("It's a draw.");
  });

  it('AC1: the sole winner sees "You win!" with no name attached', () => {
    expect(resolveGameoverMessage({ winner: '0' }, '0', NAMES)).toBe('You win!');
  });

  it('AC2: a non-winner sees the winner named by display name, not "you lose"', () => {
    expect(resolveGameoverMessage({ winner: '0' }, '1', NAMES)).toBe('Alice wins!');
  });

  it('AC4: a spectator sees the winner named by display name', () => {
    expect(resolveGameoverMessage({ winner: '0' }, null, NAMES)).toBe('Alice wins!');
  });

  it('AC5: falls back to a seat label when the winner has no synced name', () => {
    expect(resolveGameoverMessage({ winner: '0' }, '1', {})).toBe('Seat 0 wins!');
  });

  it('AC1/AC6: a co-winner sees "You and <other winners> win!"', () => {
    expect(resolveGameoverMessage({ winner: ['0', '1'] }, '0', NAMES)).toBe(
      'You and Bob win!',
    );
  });

  it('AC2/AC6: a non-winner sees every winner named, joined naturally, for two winners', () => {
    expect(resolveGameoverMessage({ winner: ['0', '1'] }, '2', NAMES)).toBe(
      'Alice and Bob win!',
    );
  });

  it('AC2/AC6: a non-winner sees every winner named for three or more winners', () => {
    expect(
      resolveGameoverMessage({ winner: ['0', '1', '2'] }, '3', {
        ...NAMES,
        '3': 'Dave',
      }),
    ).toBe('Alice, Bob and Carol win!');
  });

  it('AC4/AC6: a spectator sees every winner named for a multi-winner result', () => {
    expect(resolveGameoverMessage({ winner: ['0', '1'] }, null, NAMES)).toBe(
      'Alice and Bob win!',
    );
  });

  it('AC8: an unrecognized gameover shape falls back to a generic message', () => {
    expect(resolveGameoverMessage({ someOtherShape: true }, '0', NAMES)).toBe('Game over.');
  });

  it('AC8: a truthy non-object gameover falls back to null (never throws)', () => {
    expect(resolveGameoverMessage('unexpected-string', '0', NAMES)).toBeNull();
  });
});

describe('GameoverBanner', () => {
  it('renders nothing when the match is still in progress', () => {
    const { container } = render(
      <GameoverBanner gameover={undefined} playerID="0" playerNames={NAMES} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the resolved message with role="status"', () => {
    render(<GameoverBanner gameover={{ winner: '0' }} playerID="0" playerNames={NAMES} />);
    expect(screen.getByRole('status')).toHaveTextContent('You win!');
  });

  it('renders a named winner for a spectator', () => {
    render(<GameoverBanner gameover={{ winner: '0' }} playerID={null} playerNames={NAMES} />);
    expect(screen.getByRole('status')).toHaveTextContent('Alice wins!');
  });
});
