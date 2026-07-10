import { describe, expect, it } from 'vitest';
import { gamesCatalog, getGameModule } from './gamesCatalog.js';

describe('gamesCatalog', () => {
  it('contains exactly tictactoe-v1 as of feature 002', () => {
    expect(gamesCatalog.map((m) => m.id)).toEqual(['tictactoe-v1']);
  });

  it('getGameModule resolves a registered id and returns undefined for an unknown one', () => {
    expect(getGameModule('tictactoe-v1')?.displayName).toBe('Tic-Tac-Toe');
    expect(getGameModule('anything')).toBeUndefined();
  });
});
