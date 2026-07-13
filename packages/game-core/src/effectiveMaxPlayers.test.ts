import { describe, expect, it } from 'vitest';
import { getEffectiveMaxPlayers } from './effectiveMaxPlayers.js';
import { tictactoeModule } from './games/tictactoe/index.js';
import { loveletterModule } from './games/loveletter/index.js';

describe('getEffectiveMaxPlayers', () => {
  it('falls back to the static maxPlayers when the game has no validateSetupData', () => {
    expect(getEffectiveMaxPlayers(tictactoeModule, undefined)).toBe(2);
  });

  it("returns the static maxPlayers for loveletter's normal edition", () => {
    expect(getEffectiveMaxPlayers(loveletterModule, { edition: 'normal' })).toBe(6);
    expect(getEffectiveMaxPlayers(loveletterModule, undefined)).toBe(6);
  });

  it("caps at 4 for loveletter's classic edition", () => {
    expect(getEffectiveMaxPlayers(loveletterModule, { edition: 'classic' })).toBe(4);
  });
});
