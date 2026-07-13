import { describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';
import {
  loveletterGameDef,
  type LoveLetterG,
  type LoveLetterSetupData,
} from './gameDef.js';

function clientWithFixture(
  numPlayers: number,
  fixture: (base: LoveLetterG) => Partial<LoveLetterG>,
  setupData?: LoveLetterSetupData,
) {
  return Client({
    game: {
      ...loveletterGameDef,
      setup: (context) => {
        const base = loveletterGameDef.setup!(context, setupData) as LoveLetterG;
        return { ...base, ...fixture(base) };
      },
    },
    numPlayers,
  });
}

/**
 * spec.md AC9: `_deck`/`_setAsideFacedown` are hidden from EVERY player and
 * spectator equally -- structurally different from the conformance suite's
 * per-owner secretKeys check (hands/privateReveals), which only verifies a
 * field isn't leaked to a NON-owner. This needs its own assertion, run at
 * multiple points along a played-out game (not just at setup), since a
 * Chancellor draw or a Prince-triggered empty-deck draw are exactly the
 * moments a leak here would be easiest to introduce by accident.
 */
function assertDeckNeverLeaks(G: LoveLetterG, playerIDs: (string | null)[]): void {
  for (const viewerID of playerIDs) {
    const view = loveletterGameDef.playerView!({
      G,
      ctx: { numPlayers: playerIDs.length - 1 } as never,
      playerID: viewerID,
    }) as Record<string, unknown>;
    expect('_deck' in view).toBe(false);
    expect('_setAsideFacedown' in view).toBe(false);
    expect(view.deckCount).toBe(G._deck.length);
  }
}

describe('loveletter playerView (AC9)', () => {
  it('never exposes _deck or _setAsideFacedown at setup', () => {
    const client = Client({ game: loveletterGameDef, numPlayers: 2 });
    assertDeckNeverLeaks(client.store.getState().G, ['0', '1', null]);
  });

  it('never exposes _deck or _setAsideFacedown after a Chancellor draw', () => {
    const client = clientWithFixture(2, () => ({
      hands: { '0': [6], '1': [9] },
      _deck: [3, 4, 0],
    }));
    client.moves.playCard!(0, { chancellorKeep: 0 });
    assertDeckNeverLeaks(client.store.getState().G, ['0', '1', null]);
  });

  it('never exposes _deck or _setAsideFacedown after a Prince-triggered empty-deck draw', () => {
    const client = clientWithFixture(2, () => ({
      hands: { '0': [5], '1': [2] },
      _deck: [0],
      _setAsideFacedown: 8,
    }));
    client.moves.playCard!(0, { target: '1' });
    assertDeckNeverLeaks(client.store.getState().G, ['0', '1', null]);
  });

  it("hands/privateReveals are narrowed to the viewer's own entry", () => {
    const client = clientWithFixture(2, () => ({
      hands: { '0': [2], '1': [9] },
      _deck: [0],
    }));
    client.moves.playCard!(0, { target: '1' }); // Priest -- populates '0's privateReveals.
    const G = client.store.getState().G;

    const viewAsZero = loveletterGameDef.playerView!({
      G,
      ctx: { numPlayers: 2 } as never,
      playerID: '0',
    }) as { hands: Record<string, unknown>; privateReveals: Record<string, unknown> };
    expect(Object.keys(viewAsZero.hands)).toEqual(['0']);
    expect(Object.keys(viewAsZero.privateReveals)).toEqual(['0']);

    const viewAsSpectator = loveletterGameDef.playerView!({
      G,
      ctx: { numPlayers: 2 } as never,
      playerID: null,
    }) as { hands: Record<string, unknown>; privateReveals: Record<string, unknown> };
    expect(Object.keys(viewAsSpectator.hands)).toEqual([]);
    expect(Object.keys(viewAsSpectator.privateReveals)).toEqual([]);
  });
});
