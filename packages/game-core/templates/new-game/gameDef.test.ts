import { describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';
import { __SLUG__GameDef } from './gameDef.js';

describe('__SLUG__ gameDef', () => {
  it('TODO: replace with real rules tests. Placeholder move toggles state.', () => {
    const client = Client({ game: __SLUG__GameDef, numPlayers: 2 });
    client.moves.noop!();
    expect(client.getState()?.G.placeholder).toBe(false);
  });
});
