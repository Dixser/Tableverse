import { describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';
import { themindGameDef, type TheMindG, type TheMindSetupData } from './gameDef.js';

/**
 * Builds a headless Client whose initial G is the real setup's output with
 * a test-chosen override layered on top -- same pattern as Love Letter's
 * gameDef.test.ts fixture helper, letting individual tests pin exact hands
 * while still going through the real setup path for every other field.
 */
function clientWithFixture(
  numPlayers: number,
  fixture: (base: TheMindG) => Partial<TheMindG>,
  setupData?: TheMindSetupData,
) {
  return Client({
    game: {
      ...themindGameDef,
      setup: (context) => {
        const base = themindGameDef.setup!(context, setupData) as TheMindG;
        return { ...base, ...fixture(base) };
      },
    },
    numPlayers,
  });
}

function newClient(numPlayers = 2, setupData?: TheMindSetupData) {
  return Client({
    game: { ...themindGameDef, setup: (context) => themindGameDef.setup!(context, setupData) },
    numPlayers,
  });
}

/**
 * Dispatches a move as a specific seat. A single headless Client's `moves`
 * dispatchers are bound to whatever `playerID` was current when they were
 * (re)created -- `updatePlayerID` rebinds them to the new seat WITHOUT
 * touching the underlying (shared) store, which is exactly what a
 * turn-less, all-active-players game needs to simulate several different
 * seats acting in sequence against one game instance (unlike Love Letter's
 * tests, which never need this: a turn-based game's single client can just
 * always act as whoever `ctx.currentPlayer` already is).
 */
function actAs<T extends Record<string, (...args: unknown[]) => unknown>>(
  client: { updatePlayerID: (id: string) => void; moves: T },
  playerID: string,
): T {
  client.updatePlayerID(playerID);
  return client.moves;
}

describe('themind gameDef', () => {
  describe('setup', () => {
    it.each([
      [2, 12, 2, 1],
      [3, 10, 3, 1],
      [4, 8, 4, 1],
    ])('%i players -> %i levels, %i starting lives, %i starting stars', (numPlayers, levels, lives, stars) => {
      const G = newClient(numPlayers).store.getState().G;
      expect(G.totalLevels).toBe(levels);
      expect(G.lives).toBe(lives);
      expect(G.stars).toBe(stars);
      expect(G.level).toBe(1);
      expect(G.matchResult).toBeNull();
      for (const id of G.activeSeatIDs) expect(G.hands[id]).toHaveLength(1);
    });

    it('rejects a player count outside 2-4', () => {
      expect(() => newClient(1)).toThrow();
      expect(() => newClient(5)).toThrow();
    });

    it('phantom seats (engine numPlayers=maxPlayers regardless of real seat count) get no cards', () => {
      const G = newClient(4, { claimedSeatIDs: ['0', '1'] }).store.getState().G;
      expect(G.activeSeatIDs).toEqual(['0', '1']);
      expect(G.hands['2']).toEqual([]);
      expect(G.hands['3']).toEqual([]);
      // 2 REAL players -- the 2-player table, not the 4-player one.
      expect(G.lives).toBe(2);
      expect(G.totalLevels).toBe(12);
    });
  });

  describe('playCard', () => {
    it('plays the acting seat\'s own lowest card', () => {
      const client = clientWithFixture(2, () => ({ hands: { '0': [10, 50], '1': [30] } }));
      actAs(client, '0').playCard!();
      const G = client.store.getState().G;
      expect(G.playedCards).toEqual([10]);
      expect(G.hands['0']).toEqual([50]);
    });

    it('a player with an empty hand cannot play', () => {
      const client = clientWithFixture(2, () => ({ hands: { '0': [], '1': [30] } }));
      const before = JSON.stringify(client.store.getState().G);
      actAs(client, '0').playCard!();
      expect(JSON.stringify(client.store.getState().G)).toBe(before);
    });

    it('no mistake when the played card really is the lowest across every hand', () => {
      const client = clientWithFixture(2, () => ({ hands: { '0': [10, 50], '1': [30] } }));
      actAs(client, '0').playCard!();
      const G = client.store.getState().G;
      expect(G.lives).toBe(2); // unchanged from the 2-player starting count.
      expect(G.setAsideCards).toEqual({ '0': [], '1': [] });
    });

    it('reveals every lower card across every other seat, attributed to its owner, and costs exactly one life however many cards were revealed', () => {
      const client = clientWithFixture(
        3,
        () => ({ hands: { '0': [40, 90], '1': [10, 15], '2': [5] }, lives: 3 }),
      );
      actAs(client, '0').playCard!();
      const G = client.store.getState().G;
      expect(G.lives).toBe(2);
      expect(G.playedCards).toEqual([40]);
      expect(G.setAsideCards).toEqual({ '0': [], '1': [10, 15], '2': [5] });
      expect(G.hands['0']).toEqual([90]);
      expect(G.hands['1']).toEqual([]);
      expect(G.hands['2']).toEqual([]);
    });

    it('reaching 0 lives ends the match in a loss and blocks further moves', () => {
      const client = clientWithFixture(
        2,
        () => ({ hands: { '0': [50], '1': [10] }, lives: 1 }),
      );
      actAs(client, '0').playCard!();
      let G = client.store.getState().G;
      expect(G.lives).toBe(0);
      expect(G.matchResult).toBe('lost');
      expect(client.store.getState().ctx.gameover).toEqual({});

      const before = JSON.stringify(G);
      actAs(client, '1').playCard!();
      G = client.store.getState().G;
      expect(JSON.stringify(G)).toBe(before);
    });

    it('a shuriken vote in progress blocks playCard', () => {
      const client = clientWithFixture(2, () => ({ hands: { '0': [10], '1': [20] } }));
      actAs(client, '0').proposeShuriken!();
      const before = JSON.stringify(client.store.getState().G);
      actAs(client, '1').playCard!();
      expect(JSON.stringify(client.store.getState().G)).toBe(before);
    });
  });

  describe('level completion', () => {
    it('deals the next level and grants its reward once every hand empties', () => {
      const client = clientWithFixture(
        2,
        () => ({ hands: { '0': [5, 15], '1': [10, 20] }, stars: 1, level: 2 }),
      );
      actAs(client, '0').playCard!(); // plays 5
      actAs(client, '1').playCard!(); // plays 10
      actAs(client, '0').playCard!(); // plays 15
      actAs(client, '1').playCard!(); // plays 20 -- both hands now empty.
      const G = client.store.getState().G;
      expect(G.level).toBe(3);
      expect(G.hands['0']).toHaveLength(3);
      expect(G.hands['1']).toHaveLength(3);
      expect(G.playedCards).toEqual([]); // reset for the new level.
      expect(G.stars).toBe(2); // completing level 2 rewards a star.
    });

    it('completing the final level ends the match in a win for every active seat', () => {
      const client = clientWithFixture(
        2,
        () => ({ hands: { '0': [1], '1': [2] }, level: 12 }),
      );
      actAs(client, '0').playCard!();
      actAs(client, '1').playCard!();
      const state = client.store.getState();
      expect(state.G.matchResult).toBe('won');
      expect(state.ctx.gameover).toEqual({ winner: ['0', '1'] });
    });

    it('a reward never exceeds the physical component cap', () => {
      const client = clientWithFixture(
        2,
        () => ({ hands: { '0': [1], '1': [2] }, level: 9, lives: 5 }),
      );
      actAs(client, '0').playCard!();
      actAs(client, '1').playCard!();
      // Level 9's reward is a life, but lives were already at the cap (5).
      expect(client.store.getState().G.lives).toBe(5);
    });

    it('a shuriken that empties every hand also completes the level', () => {
      const client = clientWithFixture(
        3,
        () => ({ hands: { '0': [5], '1': [6], '2': [7] }, stars: 1, level: 2 }),
      );
      actAs(client, '0').proposeShuriken!();
      actAs(client, '1').voteShuriken!(true);
      actAs(client, '2').voteShuriken!(true);
      const G = client.store.getState().G;
      expect(G.level).toBe(3);
      // Completing level 2 rewards a star: 1 spent on the shuriken, +1 reward = 1.
      expect(G.stars).toBe(1);
      expect(G.hands['0']).toHaveLength(3);
    });

    it('level 1 is the natural case where a shuriken alone always completes the level -- every hand starts with exactly 1 card', () => {
      // Real setup/deal (no hand-value fixture needed): level 1 always deals
      // exactly 1 card per active seat, so resolving a shuriken before
      // anyone has played empties every hand unconditionally, and the level
      // must advance rather than getting stuck with 0-card hands.
      const client = newClient(2);
      expect(client.store.getState().G.hands['0']).toHaveLength(1); // sanity: level 1's real deal.
      actAs(client, '0').proposeShuriken!();
      actAs(client, '1').voteShuriken!(true);
      const G = client.store.getState().G;
      expect(G.level).toBe(2); // advanced, not stuck on an emptied level 1.
      expect(G.hands['0']).toHaveLength(2); // freshly dealt for level 2, not left empty.
      expect(G.hands['1']).toHaveLength(2);
      expect(G.matchResult).toBeNull(); // 2-player match has 12 levels -- nowhere near a win yet.
    });
  });

  describe('shuriken vote', () => {
    it('requires at least one available star', () => {
      const client = clientWithFixture(2, () => ({ stars: 0 }));
      const before = JSON.stringify(client.store.getState().G);
      actAs(client, '0').proposeShuriken!();
      expect(JSON.stringify(client.store.getState().G)).toBe(before);
    });

    it('a second proposal while one is pending is rejected', () => {
      const client = clientWithFixture(3, () => ({ hands: { '0': [5, 80], '1': [6, 90], '2': [7, 95] }, stars: 1 }));
      actAs(client, '0').proposeShuriken!();
      const afterFirst = JSON.stringify(client.store.getState().G);
      actAs(client, '1').proposeShuriken!();
      expect(JSON.stringify(client.store.getState().G)).toBe(afterFirst);
    });

    it('any single decline cancels the proposal without spending a star', () => {
      const client = clientWithFixture(3, () => ({ hands: { '0': [5, 80], '1': [6, 90], '2': [7, 95] }, stars: 1 }));
      actAs(client, '0').proposeShuriken!();
      actAs(client, '1').voteShuriken!(true);
      actAs(client, '2').voteShuriken!(false);
      const G = client.store.getState().G;
      expect(G.shurikenVote).toBeNull();
      expect(G.stars).toBe(1);
    });

    it('unanimous agreement discards every active seat\'s lowest card, attributed to its owner, and spends one star', () => {
      const client = clientWithFixture(3, () => ({ hands: { '0': [5, 80], '1': [6, 90], '2': [7, 95] }, stars: 1 }));
      actAs(client, '0').proposeShuriken!();
      actAs(client, '1').voteShuriken!(true);
      actAs(client, '2').voteShuriken!(true);
      const G = client.store.getState().G;
      expect(G.stars).toBe(0);
      expect(G.starDiscards).toEqual({ '0': [5], '1': [6], '2': [7] });
      expect(G.hands['0']).toEqual([80]);
      expect(G.hands['1']).toEqual([90]);
      expect(G.hands['2']).toEqual([95]);
      expect(G.shurikenVote).toBeNull();
    });

    it('only the proposer may cancel their own pending vote', () => {
      const client = clientWithFixture(3, () => ({ hands: { '0': [5], '1': [6], '2': [7] }, stars: 1 }));
      actAs(client, '0').proposeShuriken!();
      const pending = JSON.stringify(client.store.getState().G);
      actAs(client, '1').cancelShurikenVote!();
      expect(JSON.stringify(client.store.getState().G)).toBe(pending);
      actAs(client, '0').cancelShurikenVote!();
      expect(client.store.getState().G.shurikenVote).toBeNull();
    });
  });

  describe('playerView', () => {
    it('exposes only the viewer\'s own hand plus every seat\'s public hand count', () => {
      const G: TheMindG = {
        activeSeatIDs: ['0', '1'],
        totalLevels: 12,
        level: 1,
        lives: 2,
        stars: 1,
        hands: { '0': [5, 20], '1': [30] },
        playedCards: [],
        setAsideCards: { '0': [], '1': [] },
        starDiscards: { '0': [], '1': [] },
        shurikenVote: null,
        log: [],
        matchResult: null,
      };
      const view = themindGameDef.playerView!({ G, ctx: {} as never, playerID: '0' });
      expect(view.hands).toEqual({ '0': [5, 20] });
      expect(view.handCounts).toEqual({ '0': 2, '1': 1 });

      const spectatorView = themindGameDef.playerView!({ G, ctx: {} as never, playerID: null });
      expect(spectatorView.hands).toEqual({});
      expect(spectatorView.handCounts).toEqual({ '0': 2, '1': 1 });
    });
  });
});
