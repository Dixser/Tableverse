import { describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';
import { cahootsGameDef, type CahootsG, type CahootsSetupData } from './gameDef.js';
import type { Card, Color } from './deck.js';
import type { GoalDefinition } from './goals.js';

function card(color: Color, number: number): Card {
  return { id: `${color}${number}`, color, number };
}

function dummyGoal(id: string): GoalDefinition {
  return { id, kind: 'aboveFour' };
}

/** Same fixture pattern as crew/regicide's gameDef.test.ts: real setup, test-chosen overrides layered on top. */
function clientWithFixture(numPlayers: number, fixture: (base: CahootsG) => Partial<CahootsG>, setupData?: CahootsSetupData) {
  return Client({
    game: {
      ...cahootsGameDef,
      setup: (context) => {
        const base = cahootsGameDef.setup!(context, setupData) as CahootsG;
        return { ...base, ...fixture(base) };
      },
    },
    numPlayers,
  });
}

function newClient(numPlayers: number, setupData?: CahootsSetupData) {
  return Client({
    game: { ...cahootsGameDef, setup: (context) => cahootsGameDef.setup!(context, setupData) },
    numPlayers,
  });
}

function actAs<T extends Record<string, (...args: unknown[]) => unknown>>(
  client: { updatePlayerID: (id: string) => void; moves: T },
  playerID: string,
): T {
  client.updatePlayerID(playerID);
  return client.moves;
}

describe('cahoots gameDef', () => {
  describe('setup', () => {
    it('deals 4 cards to each active hand, seeds 4 single-card piles, and accounts for all 56 cards', () => {
      for (const count of [2, 3, 4]) {
        const G = newClient(count, { difficulty: 'beginner' }).store.getState().G as CahootsG;
        for (const seatID of G.activeSeatIDs) {
          expect(G.hands[seatID]).toHaveLength(4);
        }
        expect(G.piles).toHaveLength(4);
        for (const pile of G.piles) {
          expect(pile.length).toBeGreaterThanOrEqual(1);
        }
        const handTotal = G.activeSeatIDs.reduce((sum, id) => sum + G.hands[id]!.length, 0);
        const pileTotal = G.piles.reduce((sum, p) => sum + p.length, 0);
        expect(handTotal + pileTotal + G.drawPile.length).toBe(56);
      }
    });

    it('sets targetGoalCount from the difficulty x player-count table and slices the goal pool accordingly', () => {
      const G2 = newClient(2, { difficulty: 'expert' }).store.getState().G as CahootsG;
      expect(G2.targetGoalCount).toBe(21);
      expect(G2.activeGoals.length + G2.goalDeck.length + G2.completedGoals.length).toBe(21);
      expect(G2.activeGoals.length).toBeLessThanOrEqual(4);

      const G4 = newClient(4, { difficulty: 'expert' }).store.getState().G as CahootsG;
      expect(G4.targetGoalCount).toBe(18);
      expect(G4.activeGoals.length + G4.goalDeck.length + G4.completedGoals.length).toBe(18);
    });

    it('picks a random first player among active seats, varying across fresh matches', () => {
      const firstSeats = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const G = newClient(4, { difficulty: 'beginner' }).store.getState().G as CahootsG;
        expect(G.activeSeatIDs).toContain(G.firstSeatID);
        firstSeats.add(G.firstSeatID);
      }
      expect(firstSeats.size).toBeGreaterThan(1);
    });

    it('rejects fewer than 2 or more than 4 claimed players', () => {
      expect(() => newClient(4, { claimedSeatIDs: ['0', '1', '2', '3'] })).not.toThrow();
      expect(() => newClient(4, { claimedSeatIDs: ['0'] })).toThrow(/2-4 players/);
      expect(() => newClient(4, { claimedSeatIDs: ['0', '1', '2', '3', '4'] } as CahootsSetupData)).toThrow(/2-4 players/);
    });

    it('rejects an invalid difficulty', () => {
      expect(() => newClient(2, { difficulty: 'nightmare' as never })).toThrow(/difficulty/);
    });
  });

  describe('playCard', () => {
    function fixture(): Partial<CahootsG> {
      return {
        activeSeatIDs: ['0', '1'],
        firstSeatID: '0',
        piles: [[card('blue', 3)], [card('red', 5)], [card('green', 2)], [card('yellow', 7)]],
        hands: { '0': [card('blue', 6), card('red', 1)], '1': [card('green', 4)] },
        drawPile: [card('yellow', 1)],
        activeGoals: [],
        goalDeck: [],
        completedGoals: [],
      };
    }

    it('rejects a card matching neither the color nor the number of the target pile', () => {
      const client = clientWithFixture(2, fixture);
      const before = client.store.getState().G;
      actAs(client, '0').playCard!(1, 'blue6'); // pile 1 top is red5 -- blue6 matches neither
      expect(client.store.getState().G).toEqual(before);
    });

    it('plays a legal card, appends (not replaces) the pile, draws a replacement, and ends the turn', () => {
      const client = clientWithFixture(2, fixture);
      actAs(client, '0').playCard!(0, 'blue6'); // pile 0 top is blue3 -- matches color
      const state = client.store.getState();
      expect(state.G.hands['0']).toEqual([card('red', 1), card('yellow', 1)]); // played card gone, drawn card appended
      expect(state.G.piles[0]).toEqual([card('blue', 3), card('blue', 6)]);
      expect(state.G.drawPile).toHaveLength(0);
      expect(state.ctx.currentPlayer).toBe('1');
    });

    it('does not draw when the draw pile is empty', () => {
      const client = clientWithFixture(2, () => ({ ...fixture(), drawPile: [] }));
      actAs(client, '0').playCard!(0, 'blue6');
      expect(client.store.getState().G.hands['0']).toEqual([card('red', 1)]);
    });

    it('rejects a move from a seat that is not the active player', () => {
      const client = clientWithFixture(2, fixture);
      const before = client.store.getState().G;
      actAs(client, '1').playCard!(2, 'green4'); // it's seat 0's turn
      expect(client.store.getState().G).toEqual(before);
    });
  });

  describe('goal resolution wiring', () => {
    it('completes a goal the instant a play satisfies it, and refills from the goal deck', () => {
      const refill = dummyGoal('refill');
      const client = clientWithFixture(2, () => ({
        activeSeatIDs: ['0', '1'],
        firstSeatID: '0',
        // 2 blue tops already; playing blue2 onto pile 2 (red2, matches by number) makes 3 blue tops.
        piles: [[card('blue', 3)], [card('blue', 5)], [card('red', 2)], [card('yellow', 7)]],
        hands: { '0': [card('blue', 2)], '1': [] },
        drawPile: [],
        activeGoals: [{ id: 'threeBlue', kind: 'exactlyThreeColor', color: 'blue' }],
        goalDeck: [refill],
        completedGoals: [],
      }));

      actAs(client, '0').playCard!(2, 'blue2');

      const state = client.store.getState().G;
      expect(state.completedGoals.map((g: GoalDefinition) => g.id)).toEqual(['threeBlue']);
      expect(state.activeGoals.map((g: GoalDefinition) => g.id)).toEqual(['refill']);
      expect(state.goalDeck).toHaveLength(0);
      expect(state.log).toContainEqual({
        key: 'cahoots.log.goalCompleted',
        params: { completed: 1, totalGoals: 15, descriptionKey: 'cahoots.goal.exactlyThreeColor', color: 'blue' },
      });
    });

    it('logs one goalCompleted entry per goal, with a running count, when a single play satisfies several at once', () => {
      const client = clientWithFixture(2, () => ({
        activeSeatIDs: ['0', '1'],
        firstSeatID: '0',
        targetGoalCount: 15,
        // Playing blue2 onto pile 2 (currently red2, matches by number) makes
        // tops [blue3, blue5, blue2, yellow7]: exactly 3 blue AND sums to 17
        // -- both goals below become true in the same resolution pass.
        piles: [[card('blue', 3)], [card('blue', 5)], [card('red', 2)], [card('yellow', 7)]],
        hands: { '0': [card('blue', 2)], '1': [] },
        drawPile: [],
        activeGoals: [
          { id: 'threeBlue', kind: 'exactlyThreeColor', color: 'blue' },
          { id: 'sum17', kind: 'sumAll', target: 17 },
        ],
        goalDeck: [],
        completedGoals: [],
        // Reset -- the fixture's own base setup() call runs against a real
        // random deal before these overrides apply, and can itself log a
        // goalCompleted entry if the random layout happens to satisfy one
        // of ITS OWN randomly-dealt starting goals; without this the count
        // asserted below would be flaky.
        log: [],
      }));

      actAs(client, '0').playCard!(2, 'blue2');

      const state = client.store.getState().G;
      expect(state.completedGoals.map((g: GoalDefinition) => g.id)).toEqual(['threeBlue', 'sum17']);
      const goalCompletedLogs = state.log.filter((e: { key: string }) => e.key === 'cahoots.log.goalCompleted');
      expect(goalCompletedLogs.map((e: { params: Record<string, unknown> }) => e.params)).toEqual([
        { completed: 1, totalGoals: 15, descriptionKey: 'cahoots.goal.exactlyThreeColor', color: 'blue' },
        { completed: 2, totalGoals: 15, descriptionKey: 'cahoots.goal.sumAll', sumTarget: 17 },
      ]);
    });

    it('logs a mission-completed chat entry the instant a play crosses targetGoalCount', () => {
      const client = clientWithFixture(2, () => ({
        activeSeatIDs: ['0', '1'],
        firstSeatID: '0',
        targetGoalCount: 1,
        piles: [[card('blue', 3)], [card('blue', 5)], [card('red', 2)], [card('yellow', 7)]],
        hands: { '0': [card('blue', 2)], '1': [] },
        drawPile: [],
        activeGoals: [{ id: 'threeBlue', kind: 'exactlyThreeColor', color: 'blue' }],
        goalDeck: [],
        completedGoals: [],
        log: [],
      }));

      actAs(client, '0').playCard!(2, 'blue2');

      const state = client.store.getState().G;
      expect(state.completedGoals.map((g: GoalDefinition) => g.id)).toEqual(['threeBlue']);
      expect(state.log).toContainEqual({ key: 'cahoots.log.missionCompleted', params: { totalGoals: 1 } });
    });
  });

  describe('endIf', () => {
    it('wins immediately once completedGoals reaches targetGoalCount, even before any move', () => {
      const client = clientWithFixture(2, () => ({
        activeSeatIDs: ['0', '1'],
        targetGoalCount: 1,
        completedGoals: [dummyGoal('done')],
      }));
      expect(client.store.getState().ctx.gameover).toEqual({ winner: ['0', '1'] });
    });

    it('loses when the draw pile is empty and every active hand is empty', () => {
      const client = clientWithFixture(2, () => ({
        activeSeatIDs: ['0', '1'],
        drawPile: [],
        hands: { '0': [], '1': [] },
      }));
      expect(client.store.getState().ctx.gameover).toEqual({});
    });

    it('loses when the seat currently up has no card matching any pile', () => {
      const client = clientWithFixture(2, () => ({
        activeSeatIDs: ['0', '1'],
        firstSeatID: '0',
        piles: [[card('blue', 1)], [card('blue', 2)], [card('blue', 3)], [card('blue', 4)]],
        hands: { '0': [card('red', 5)], '1': [card('green', 6)] },
        drawPile: [card('yellow', 7)],
      }));
      const state = client.store.getState();
      expect(state.ctx.currentPlayer).toBe('0');
      expect(state.ctx.gameover).toEqual({});
    });

    it('does not end the match while the current seat still has a legal play', () => {
      const client = clientWithFixture(2, () => ({
        activeSeatIDs: ['0', '1'],
        firstSeatID: '0',
        piles: [[card('blue', 1)], [card('blue', 2)], [card('blue', 3)], [card('blue', 4)]],
        hands: { '0': [card('blue', 5)], '1': [card('green', 6)] },
        drawPile: [card('yellow', 7)],
      }));
      expect(client.store.getState().ctx.gameover).toBeUndefined();
    });
  });

  describe('playerView', () => {
    it('exposes only the viewing seat\'s own hand, and hand counts publicly', () => {
      const G: CahootsG = {
        activeSeatIDs: ['0', '1'],
        difficulty: 'beginner',
        targetGoalCount: 15,
        firstSeatID: '0',
        hands: { '0': [card('blue', 1)], '1': [card('red', 2), card('green', 3)] },
        piles: [[card('blue', 4)], [card('red', 5)], [card('green', 6)], [card('yellow', 7)]],
        drawPile: [],
        goalDeck: [],
        activeGoals: [],
        completedGoals: [],
        log: [],
      };
      const seat0View = cahootsGameDef.playerView!({ G, ctx: {} as never, playerID: '0' }) as ReturnType<
        NonNullable<typeof cahootsGameDef.playerView>
      > & { hands: Record<string, Card[]>; handCounts: Record<string, number> };
      expect(seat0View.hands).toEqual({ '0': [card('blue', 1)] });
      expect(seat0View.handCounts).toEqual({ '0': 1, '1': 2 });

      const spectatorView = cahootsGameDef.playerView!({ G, ctx: {} as never, playerID: null }) as {
        hands: Record<string, Card[]>;
      };
      expect(spectatorView.hands).toEqual({});
    });
  });
});
