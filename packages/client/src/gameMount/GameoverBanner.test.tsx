// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GameoverBanner, resolveGameoverMessage } from './GameoverBanner.js';
import i18n from '../i18n/i18n.js';

const NAMES = { '0': 'Alice', '1': 'Bob', '2': 'Carol' };

// getFixedT returns a t bound to a specific language regardless of i18n's
// current active language -- lets English and Spanish assertions run
// side by side without mutating shared i18next state between tests.
const tEn = i18n.getFixedT('en');
const tEs = i18n.getFixedT('es');

describe('resolveGameoverMessage (en)', () => {
  it('returns null when gameover is undefined (match still in progress)', () => {
    expect(resolveGameoverMessage(undefined, '0', NAMES, tEn)).toBeNull();
  });

  it("returns a draw message regardless of viewer, ignoring names entirely", () => {
    expect(resolveGameoverMessage({ draw: true }, '0', NAMES, tEn)).toBe("It's a draw.");
    expect(resolveGameoverMessage({ draw: true }, null, {}, tEn)).toBe("It's a draw.");
  });

  it('AC1: the sole winner sees "You win!" with no name attached', () => {
    expect(resolveGameoverMessage({ winner: '0' }, '0', NAMES, tEn)).toBe('You win!');
  });

  it('AC2: a non-winner sees the winner named by display name, not "you lose"', () => {
    expect(resolveGameoverMessage({ winner: '0' }, '1', NAMES, tEn)).toBe('Alice wins!');
  });

  it('AC4: a spectator sees the winner named by display name', () => {
    expect(resolveGameoverMessage({ winner: '0' }, null, NAMES, tEn)).toBe('Alice wins!');
  });

  it('AC5: falls back to a seat label when the winner has no synced name', () => {
    expect(resolveGameoverMessage({ winner: '0' }, '1', {}, tEn)).toBe('Seat 0 wins!');
  });

  it('AC1/AC6: a co-winner sees "You and <other winners> win!"', () => {
    expect(resolveGameoverMessage({ winner: ['0', '1'] }, '0', NAMES, tEn)).toBe(
      'You and Bob win!',
    );
  });

  it('AC2/AC6: a non-winner sees every winner named, joined naturally, for two winners', () => {
    expect(resolveGameoverMessage({ winner: ['0', '1'] }, '2', NAMES, tEn)).toBe(
      'Alice and Bob win!',
    );
  });

  it('AC2/AC6: a non-winner sees every winner named for three or more winners', () => {
    expect(
      resolveGameoverMessage({ winner: ['0', '1', '2'] }, '3', { ...NAMES, '3': 'Dave' }, tEn),
    ).toBe('Alice, Bob and Carol win!');
  });

  it('AC4/AC6: a spectator sees every winner named for a multi-winner result', () => {
    expect(resolveGameoverMessage({ winner: ['0', '1'] }, null, NAMES, tEn)).toBe(
      'Alice and Bob win!',
    );
  });

  it('AC8: an unrecognized gameover shape falls back to a generic message', () => {
    expect(resolveGameoverMessage({ someOtherShape: true }, '0', NAMES, tEn)).toBe('Game over.');
  });

  it('AC8: a truthy non-object gameover falls back to null (never throws)', () => {
    expect(resolveGameoverMessage('unexpected-string', '0', NAMES, tEn)).toBeNull();
  });
});

describe('resolveGameoverMessage (es) -- feature 010: same table, Spanish locale', () => {
  it('returns a draw message', () => {
    expect(resolveGameoverMessage({ draw: true }, '0', NAMES, tEs)).toBe('Es un empate.');
  });

  it('the sole winner sees "¡Ganaste!"', () => {
    expect(resolveGameoverMessage({ winner: '0' }, '0', NAMES, tEs)).toBe('¡Ganaste!');
  });

  it('a non-winner sees the winner named, singular verb form (othersWin_one)', () => {
    expect(resolveGameoverMessage({ winner: '0' }, '1', NAMES, tEs)).toBe('¡Alice gana!');
  });

  it('a co-winner sees "Tú y <others> ganan!"', () => {
    expect(resolveGameoverMessage({ winner: ['0', '1'] }, '0', NAMES, tEs)).toBe(
      '¡Tú y Bob ganan!',
    );
  });

  it('a non-winner sees every winner named, plural verb form (othersWin_other) for two winners -- the name-list joiner itself stays English (plan.md open risk 1)', () => {
    expect(resolveGameoverMessage({ winner: ['0', '1'] }, '2', NAMES, tEs)).toBe(
      '¡Alice and Bob ganan!',
    );
  });

  it('falls back to a seat label when the winner has no synced name', () => {
    expect(resolveGameoverMessage({ winner: '0' }, '1', {}, tEs)).toBe('¡Asiento 0 gana!');
  });

  it('falls back to a generic message for an unrecognized shape', () => {
    expect(resolveGameoverMessage({ someOtherShape: true }, '0', NAMES, tEs)).toBe(
      'Fin de la partida.',
    );
  });
});

describe('GameoverBanner', () => {
  afterEach(() => {
    void i18n.changeLanguage('en');
  });

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

  it('renders in Spanish when the active language is es', async () => {
    await i18n.changeLanguage('es');
    render(<GameoverBanner gameover={{ winner: '0' }} playerID="0" playerNames={NAMES} />);
    expect(screen.getByRole('status')).toHaveTextContent('¡Ganaste!');
  });
});
