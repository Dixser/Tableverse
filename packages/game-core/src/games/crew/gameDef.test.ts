import { describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';
import { crewGameDef, type CrewG, type CrewSetupData } from './gameDef.js';
import { COMMANDER_CARD_ID, type Card } from './deck.js';
import type { Task } from './constraints.js';

function card(suit: Card['suit'], rank: number): Card {
  return { id: `${suit}${rank}`, suit, rank };
}

function task(overrides: Partial<Task> & Pick<Task, 'targetCardId' | 'ownerSeatID' | 'draftIndex'>): Task {
  return { taskCardId: `T${overrides.targetCardId}`, fulfilled: false, ...overrides };
}

/** Same fixture pattern as regicide/themind's gameDef.test.ts: real setup, test-chosen overrides layered on top. */
function clientWithFixture(numPlayers: number, fixture: (base: CrewG) => Partial<CrewG>, setupData?: CrewSetupData) {
  return Client({
    game: {
      ...crewGameDef,
      setup: (context) => {
        const base = crewGameDef.setup!(context, setupData) as CrewG;
        return { ...base, ...fixture(base) };
      },
    },
    numPlayers,
  });
}

function newClient(numPlayers: number, setupData?: CrewSetupData) {
  return Client({
    game: { ...crewGameDef, setup: (context) => crewGameDef.setup!(context, setupData) },
    numPlayers,
  });
}

/** Dispatches a move as a specific seat -- same as themind/gameDef.test.ts's actAs helper. */
function actAs<T extends Record<string, (...args: unknown[]) => unknown>>(
  client: { updatePlayerID: (id: string) => void; moves: T },
  playerID: string,
): T {
  client.updatePlayerID(playerID);
  return client.moves;
}

describe('crew gameDef', () => {
  describe('setup', () => {
    it('deals correct hand sizes and totalTricks at 3/4/5 players', () => {
      for (const [count, totalTricks] of [
        [3, 13],
        [4, 10],
        [5, 8],
      ] as const) {
        const G = newClient(count, { level: 1 }).store.getState().G;
        expect(G.totalTricks).toBe(totalTricks);
        const sizes = G.activeSeatIDs.map((id: string) => G.hands[id].length as number);
        expect(sizes.reduce((a: number, b: number) => a + b, 0)).toBe(40);
        // At 3 players only, one seat gets exactly one extra card (see deck.ts).
        const expectedMax = count === 3 ? totalTricks + 1 : totalTricks;
        expect(Math.max(...sizes)).toBe(expectedMax);
        expect(Math.min(...sizes)).toBe(totalTricks);
      }
    });

    it('identifies whoever holds the rocket 4 as commander', () => {
      const G = newClient(4, { level: 1 }).store.getState().G;
      expect(G.activeSeatIDs).toContain(G.commanderSeatID);
      expect(G.hands[G.commanderSeatID].some((c: Card) => c.id === COMMANDER_CARD_ID)).toBe(true);
      expect(G.nextTrickLeaderSeatID).toBe(G.commanderSeatID);
    });

    it('draws exactly level.taskCount task cards face-up, unclaimed', () => {
      const G = newClient(4, { level: 2 }).store.getState().G; // level 2: taskCount 2
      expect(G.taskLayout).toHaveLength(2);
      expect(G.unclaimedTaskCardIds).toEqual(G.taskLayout.map((t: { id: string }) => t.id));
      expect(G.tasks).toHaveLength(0);
    });

    it('rejects fewer than 3 or more than 5 claimed players', () => {
      expect(() => newClient(5, { claimedSeatIDs: ['0', '1', '2', '3', '4'] } as CrewSetupData)).not.toThrow();
      expect(() =>
        Client({
          game: { ...crewGameDef, setup: (ctx) => crewGameDef.setup!(ctx, { claimedSeatIDs: ['0', '1'] }) },
          numPlayers: 5,
        }),
      ).toThrow();
      expect(() =>
        Client({
          game: {
            ...crewGameDef,
            setup: (ctx) => crewGameDef.setup!(ctx, { claimedSeatIDs: ['0', '1', '2', '3', '4', '5'] }),
          },
          numPlayers: 6,
        }),
      ).toThrow();
    });

    it('rejects a level outside 1-50', () => {
      expect(() =>
        Client({ game: { ...crewGameDef, setup: (ctx) => crewGameDef.setup!(ctx, { level: 0 }) }, numPlayers: 4 }),
      ).toThrow();
      expect(() =>
        Client({ game: { ...crewGameDef, setup: (ctx) => crewGameDef.setup!(ctx, { level: 51 }) }, numPlayers: 4 }),
      ).toThrow();
    });
  });

  describe('mission draft', () => {
    it('commander picks first, then clockwise, until the pool is empty', () => {
      const client = clientWithFixture(
        3,
        () => ({
          activeSeatIDs: ['0', '1', '2'],
          commanderSeatID: '1',
          nextTrickLeaderSeatID: '1',
        }),
        { level: 4 }, // taskCount 3 -- enough for every seat to pick at least once
      );
      expect(client.store.getState().ctx.phase).toBe('missionDraft');
      expect(client.store.getState().ctx.currentPlayer).toBe('1');
      const pool = client.store.getState().G.unclaimedTaskCardIds as string[];
      expect(pool.length).toBeGreaterThan(0);

      actAs(client, '1').pickTask!(pool[0]);
      expect(client.store.getState().ctx.currentPlayer).toBe('2'); // clockwise from 1
      actAs(client, '2').pickTask!(pool[1]);
      expect(client.store.getState().ctx.currentPlayer).toBe('0');
    });

    it('a level with 0 tasks transitions straight through to the pre-trick-1 communication wait', () => {
      const client = clientWithFixture(
        3,
        () => ({ activeSeatIDs: ['0', '1', '2'], commanderSeatID: '0', nextTrickLeaderSeatID: '0' }),
        { level: 5 }, // level 5: taskCount 0
      );
      const state = client.store.getState();
      expect(state.G.unclaimedTaskCardIds).toHaveLength(0);
      expect(state.ctx.phase).toBe('trickConfirm');
      expect(state.G.roundConfirm).toEqual({ pendingSeatIDs: ['0', '1', '2'], confirmedSeatIDs: [] });
      expect(state.G.lastTrick).toBeNull(); // nothing played yet -- this is the pre-game window.
    });
  });

  describe('a full trick', () => {
    /** 3 seats, 1 task (pink1 owned by seat 2), each hand exactly 1 card, 1 total trick -- the whole mission resolves in one play each. */
    function winScenarioFixture(): Partial<CrewG> {
      return {
        activeSeatIDs: ['0', '1', '2'],
        commanderSeatID: '0',
        nextTrickLeaderSeatID: '0',
        totalTricks: 1,
        hands: { '0': [card('pink', 1)], '1': [card('pink', 5)], '2': [card('pink', 9)] },
        taskLayout: [],
        unclaimedTaskCardIds: [],
        tasks: [task({ targetCardId: 'pink1', ownerSeatID: '2', draftIndex: 0 })],
      };
    }

    function playThroughToTrick1(client: ReturnType<typeof clientWithFixture>) {
      actAs(client, '0').confirmRoundReady!();
      actAs(client, '1').confirmRoundReady!();
      actAs(client, '2').confirmRoundReady!();
      expect(client.store.getState().ctx.phase).toBe('trick');
    }

    it('the trick winner takes the whole trick -- a task is fulfilled even when its target card is not the winning card', () => {
      const client = clientWithFixture(3, winScenarioFixture, { level: 1 });
      playThroughToTrick1(client);

      actAs(client, '0').playCard!('pink1'); // task target, but NOT played by its owner and NOT the highest card
      actAs(client, '1').playCard!('pink5');
      actAs(client, '2').playCard!('pink9'); // owner of the task, wins the trick outright

      const state = client.store.getState();
      expect(state.G.tasks[0].fulfilled).toBe(true);
      expect(state.G.matchResult).toBe('won');
      expect(state.ctx.gameover).toEqual({ winner: ['0', '1', '2'] });
    });

    it('is an immediate loss when the task target card ends up in a trick won by someone other than its owner', () => {
      const client = clientWithFixture(
        3,
        () => ({ ...winScenarioFixture(), tasks: [task({ targetCardId: 'pink1', ownerSeatID: '0', draftIndex: 0 })] }),
        { level: 1 },
      );
      playThroughToTrick1(client);

      actAs(client, '0').playCard!('pink1');
      actAs(client, '1').playCard!('pink5');
      actAs(client, '2').playCard!('pink9'); // wins the trick, but is not pink1's task owner ('0' is)

      const state = client.store.getState();
      expect(state.G.tasks[0].fulfilled).toBe(false);
      expect(state.G.matchResult).toBe('lost');
      expect(state.ctx.gameover).toEqual({});
    });

    it('a rocket wins over any color card regardless of led suit, and only follow-suit-legal cards may be played', () => {
      const client = clientWithFixture(3, () => ({
        activeSeatIDs: ['0', '1', '2'],
        commanderSeatID: '0',
        nextTrickLeaderSeatID: '0',
        totalTricks: 1,
        hands: {
          '0': [card('blue', 3), card('pink', 2)],
          '1': [card('rocket', 1)],
          '2': [card('blue', 9)],
        },
        taskLayout: [],
        unclaimedTaskCardIds: [],
        tasks: [],
      }));
      playThroughToTrick1(client);

      actAs(client, '0').playCard!('blue3');
      // '1' is up next -- verify an unheld card is rejected without mutating state.
      const before = client.store.getState().G;
      actAs(client, '1').playCard!('nonexistent');
      expect(client.store.getState().G).toEqual(before);

      actAs(client, '1').playCard!('rocket1'); // no blue in hand -- free to cut with the rocket
      actAs(client, '2').playCard!('blue9'); // must follow blue (it's not a rocket trick winner), but loses to the rocket anyway

      const state = client.store.getState();
      expect(state.G.matchResult).toBe('won'); // 0 tasks, last (only) trick reached unscathed
    });

    it('rejects an off-suit play when the hand holds the led suit', () => {
      const client = clientWithFixture(3, () => ({
        activeSeatIDs: ['0', '1', '2'],
        commanderSeatID: '0',
        nextTrickLeaderSeatID: '0',
        totalTricks: 1,
        hands: {
          '0': [card('blue', 3)],
          '1': [card('blue', 5), card('green', 9)],
          '2': [card('green', 2)],
        },
        taskLayout: [],
        unclaimedTaskCardIds: [],
        tasks: [],
      }));
      playThroughToTrick1(client);
      actAs(client, '0').playCard!('blue3');
      const before = client.store.getState().G;
      actAs(client, '1').playCard!('green9'); // holds blue5, must follow blue
      expect(client.store.getState().G).toEqual(before);
      actAs(client, '1').playCard!('blue5');
      expect(client.store.getState().G.currentTrick.plays).toHaveLength(2);
    });
  });

  describe('task order tokens', () => {
    const orderedTasks: Task[] = [
      task({ targetCardId: 'blue2', ownerSeatID: '0', draftIndex: 0 }), // position 1
      task({ targetCardId: 'green3', ownerSeatID: '1', draftIndex: 1 }), // position 2
    ];

    function baseFixture(): Partial<CrewG> {
      return {
        activeSeatIDs: ['0', '1', '2'],
        commanderSeatID: '0',
        nextTrickLeaderSeatID: '0',
        totalTricks: 2,
        taskLayout: [],
        unclaimedTaskCardIds: [],
        tasks: orderedTasks.map((t) => ({ ...t })),
      };
    }

    it('is an immediate loss when a later-position task is fulfilled before the earlier one', () => {
      const client = clientWithFixture(
        3,
        () => ({
          ...baseFixture(),
          // green3 (position 2, owned by '1') resolves in trick 1, before blue2 (position 1) has even been played.
          hands: { '0': [card('green', 5)], '1': [card('green', 9)], '2': [card('green', 3)] },
        }),
        { level: 3 },
      );
      actAs(client, '0').confirmRoundReady!();
      actAs(client, '1').confirmRoundReady!();
      actAs(client, '2').confirmRoundReady!();

      actAs(client, '0').playCard!('green5');
      actAs(client, '1').playCard!('green9'); // '1' wins, fulfilling their position-2 task early
      actAs(client, '2').playCard!('green3');

      const state = client.store.getState();
      expect(state.G.matchResult).toBe('lost');
    });

    it('is not a violation when position tokens resolve in order', () => {
      const client = clientWithFixture(
        3,
        () => ({
          ...baseFixture(),
          // task0 targets blue2 (owner '0'), task1 targets green3 (owner '1').
          hands: {
            '0': [card('blue', 9), card('green', 1)],
            '1': [card('blue', 2), card('green', 9)],
            '2': [card('blue', 5), card('green', 3)],
          },
        }),
        { level: 3 },
      );
      actAs(client, '0').confirmRoundReady!();
      actAs(client, '1').confirmRoundReady!();
      actAs(client, '2').confirmRoundReady!();

      // Trick 1 (leader '0'): '0' wins with blue9, fulfilling position-1 task (blue2 played by '1').
      actAs(client, '0').playCard!('blue9');
      actAs(client, '1').playCard!('blue2');
      actAs(client, '2').playCard!('blue5');
      expect(client.store.getState().G.matchResult).toBeNull();
      expect(client.store.getState().G.tasks[0].fulfilled).toBe(true);

      // Advance through the trickConfirm wait between trick 1 and trick 2.
      actAs(client, '0').confirmRoundReady!();
      actAs(client, '1').confirmRoundReady!();
      actAs(client, '2').confirmRoundReady!();

      // Trick 2 (leader is trick 1's winner, '0' again): '1' wins with green9, fulfilling position-2 task (green3 played by '2') -- after position-1's task, not before.
      actAs(client, '0').playCard!('green1');
      actAs(client, '1').playCard!('green9');
      actAs(client, '2').playCard!('green3');

      const state = client.store.getState();
      // No order violation, and (both of this mission's 2 tasks now fulfilled) the mission is won.
      expect(state.G.matchResult).toBe('won');
      expect(state.G.tasks.every((t: Task) => t.fulfilled)).toBe(true);
    });
  });

  describe('sick crewmate choice (mission 5)', () => {
    function fixture(hands: Record<string, Card[]>): Partial<CrewG> {
      return {
        activeSeatIDs: ['0', '1', '2'],
        commanderSeatID: '0',
        nextTrickLeaderSeatID: '0',
        totalTricks: 1,
        hands,
        taskLayout: [],
        unclaimedTaskCardIds: [],
        tasks: [],
      };
    }

    it('chooseSickSeat is restricted to the commander, targeting another seat, exactly once, before trick 1', () => {
      const client = clientWithFixture(
        3,
        () => fixture({ '0': [card('pink', 1)], '1': [card('blue', 1)], '2': [card('green', 1)] }),
        { level: 5 },
      );

      actAs(client, '1').chooseSickSeat!('2'); // not the commander -- rejected
      expect(client.store.getState().G.sickSeatID).toBeNull();

      actAs(client, '0').chooseSickSeat!('0'); // can't choose self
      expect(client.store.getState().G.sickSeatID).toBeNull();

      actAs(client, '0').chooseSickSeat!('1'); // valid
      expect(client.store.getState().G.sickSeatID).toBe('1');

      actAs(client, '0').chooseSickSeat!('2'); // already chosen -- rejected, stays '1'
      expect(client.store.getState().G.sickSeatID).toBe('1');
    });

    it('is an immediate loss when the chosen sick seat wins a trick', () => {
      const client = clientWithFixture(
        3,
        () => fixture({ '0': [card('pink', 1)], '1': [card('pink', 9)], '2': [card('pink', 5)] }),
        { level: 5 },
      );
      actAs(client, '0').chooseSickSeat!('1');
      actAs(client, '0').confirmRoundReady!();
      actAs(client, '1').confirmRoundReady!();
      actAs(client, '2').confirmRoundReady!();

      actAs(client, '0').playCard!('pink1');
      actAs(client, '1').playCard!('pink9'); // the chosen sick seat wins the trick
      actAs(client, '2').playCard!('pink5');

      expect(client.store.getState().G.matchResult).toBe('lost');
    });

    it('wins by surviving the mission without the sick seat ever winning a trick', () => {
      const client = clientWithFixture(
        3,
        () => fixture({ '0': [card('pink', 9)], '1': [card('pink', 1)], '2': [card('pink', 5)] }),
        { level: 5 },
      );
      actAs(client, '0').chooseSickSeat!('1');
      actAs(client, '0').confirmRoundReady!();
      actAs(client, '1').confirmRoundReady!();
      actAs(client, '2').confirmRoundReady!();

      actAs(client, '0').playCard!('pink9'); // commander wins, not the sick seat
      actAs(client, '1').playCard!('pink1');
      actAs(client, '2').playCard!('pink5');

      expect(client.store.getState().G.matchResult).toBe('won');
    });
  });

  describe('omega ("last") order token (mission 7)', () => {
    function baseFixture(): Partial<CrewG> {
      return {
        activeSeatIDs: ['0', '1', '2'],
        commanderSeatID: '0',
        nextTrickLeaderSeatID: '0',
        totalTricks: 1,
        taskLayout: [],
        unclaimedTaskCardIds: [],
        tasks: [
          task({ targetCardId: 'pink1', ownerSeatID: '0', draftIndex: 0 }), // the Omega-tokened task
          task({ targetCardId: 'blue2', ownerSeatID: '0', draftIndex: 1 }), // untokened
          task({ targetCardId: 'green3', ownerSeatID: '0', draftIndex: 2 }), // untokened
        ],
      };
    }

    it('is a violation when the Omega task resolves while an untokened task is still pending', () => {
      const client = clientWithFixture(
        3,
        () => ({
          ...baseFixture(),
          // pink1 (the Omega task) and blue2 both resolve in this single trick, but green3 never gets played at all.
          hands: { '0': [card('pink', 1)], '1': [card('blue', 2)], '2': [card('yellow', 5)] },
        }),
        { level: 7 },
      );
      actAs(client, '0').confirmRoundReady!();
      actAs(client, '1').confirmRoundReady!();
      actAs(client, '2').confirmRoundReady!();
      actAs(client, '0').playCard!('pink1');
      actAs(client, '1').playCard!('blue2');
      actAs(client, '2').playCard!('yellow5');

      expect(client.store.getState().G.matchResult).toBe('lost');
    });

    it('is not a violation once the Omega task resolves after every other task in the mission', () => {
      const client = clientWithFixture(
        3,
        () => ({
          ...baseFixture(),
          tasks: [
            task({ targetCardId: 'pink1', ownerSeatID: '0', draftIndex: 0 }),
            task({ targetCardId: 'blue2', ownerSeatID: '0', draftIndex: 1, fulfilled: true }),
            task({ targetCardId: 'green3', ownerSeatID: '0', draftIndex: 2, fulfilled: true }),
          ],
          hands: { '0': [card('pink', 1)], '1': [card('yellow', 4)], '2': [card('yellow', 5)] },
        }),
        { level: 7 },
      );
      actAs(client, '0').confirmRoundReady!();
      actAs(client, '1').confirmRoundReady!();
      actAs(client, '2').confirmRoundReady!();
      actAs(client, '0').playCard!('pink1');
      actAs(client, '1').playCard!('yellow4');
      actAs(client, '2').playCard!('yellow5');

      const state = client.store.getState();
      expect(state.G.matchResult).toBe('won'); // all 3 tasks (including the Omega one, last) now fulfilled.
    });
  });

  describe('achievement mission: win a trick with each color\'s 1 (mission 9)', () => {
    function fixture(overrides: Partial<CrewG>): Partial<CrewG> {
      return {
        activeSeatIDs: ['0', '1', '2'],
        commanderSeatID: '0',
        nextTrickLeaderSeatID: '0',
        taskLayout: [],
        unclaimedTaskCardIds: [],
        tasks: [],
        ...overrides,
      };
    }

    it('wins the instant the 4th color\'s 1 wins a trick, even before the mission\'s last trick', () => {
      const client = clientWithFixture(
        3,
        () =>
          fixture({
            totalTricks: 5,
            trickNumber: 3, // pretend 3 tricks already happened
            winningCardIdsSeen: ['pink1', 'blue1', 'green1'], // 3 of the 4 needed already won
            hands: { '0': [card('yellow', 1)], '1': [card('blue', 6)], '2': [card('green', 7)] },
          }),
        { level: 9 },
      );
      actAs(client, '0').confirmRoundReady!();
      actAs(client, '1').confirmRoundReady!();
      actAs(client, '2').confirmRoundReady!();
      actAs(client, '0').playCard!('yellow1'); // only yellow card in the trick -- wins outright, completing the achievement
      actAs(client, '1').playCard!('blue6');
      actAs(client, '2').playCard!('green7');

      const state = client.store.getState();
      expect(state.G.matchResult).toBe('won');
      expect(state.G.trickNumber).toBeLessThan(state.G.totalTricks); // won early, not on the last trick.
    });

    it('loses if the mission\'s last trick arrives without every color\'s 1 having won one', () => {
      const client = clientWithFixture(
        3,
        () =>
          fixture({
            totalTricks: 4,
            trickNumber: 3, // this trick (once the confirm window advances it to 4) IS the last trick
            winningCardIdsSeen: ['pink1', 'blue1', 'green1'], // yellow1 never won a trick
            hands: { '0': [card('yellow', 3)], '1': [card('yellow', 6)], '2': [card('green', 2)] },
          }),
        { level: 9 },
      );
      actAs(client, '0').confirmRoundReady!();
      actAs(client, '1').confirmRoundReady!();
      actAs(client, '2').confirmRoundReady!();
      actAs(client, '0').playCard!('yellow3');
      actAs(client, '1').playCard!('yellow6'); // wins, but it's not the rank-1 achievement needs
      actAs(client, '2').playCard!('green2');

      expect(client.store.getState().G.matchResult).toBe('lost');
    });
  });

  describe('radio communication', () => {
    function fixture(): Partial<CrewG> {
      return {
        activeSeatIDs: ['0', '1', '2'],
        commanderSeatID: '0',
        nextTrickLeaderSeatID: '0',
        totalTricks: 1,
        hands: {
          '0': [card('pink', 2), card('pink', 8), card('blue', 6)],
          '1': [card('green', 4)],
          '2': [card('yellow', 1)],
        },
        taskLayout: [],
        unclaimedTaskCardIds: [],
        tasks: [],
      };
    }

    it('accepts a truthful highest/only/lowest claim, rejects an untruthful one, a rocket, and a second use', () => {
      const client = clientWithFixture(3, fixture, { level: 5 });
      expect(client.store.getState().ctx.phase).toBe('trickConfirm'); // pre-trick-1 window

      actAs(client, '0').communicateCard!('pink2', 'highest'); // false -- pink8 is higher
      expect(client.store.getState().G.communications['0'].used).toBe(false);

      actAs(client, '0').communicateCard!('pink8', 'highest'); // true
      let state = client.store.getState();
      expect(state.G.communications['0']).toEqual({ used: true, cardId: 'pink8', position: 'highest' });

      actAs(client, '0').communicateCard!('blue6', 'only'); // already used this mission
      state = client.store.getState();
      expect(state.G.communications['0'].cardId).toBe('pink8'); // unchanged

      actAs(client, '1').communicateCard!('green4', 'only'); // true, single green card
      expect(client.store.getState().G.communications['1']).toEqual({ used: true, cardId: 'green4', position: 'only' });
    });

    it('clears the communicated card marker once it is actually played, but leaves the token spent', () => {
      const client = clientWithFixture(3, fixture, { level: 5 });
      actAs(client, '0').communicateCard!('pink8', 'highest');
      actAs(client, '0').confirmRoundReady!();
      actAs(client, '1').confirmRoundReady!();
      actAs(client, '2').confirmRoundReady!();

      actAs(client, '0').playCard!('pink8');
      actAs(client, '1').playCard!('green4');
      actAs(client, '2').playCard!('yellow1');

      const comm = client.store.getState().G.communications['0'];
      expect(comm.used).toBe(true);
      expect(comm.cardId).toBeNull();
    });
  });

  describe('muted crewmate (mission 11)', () => {
    function fixture(hands: Record<string, Card[]>): Partial<CrewG> {
      return {
        activeSeatIDs: ['0', '1', '2'],
        commanderSeatID: '0',
        nextTrickLeaderSeatID: '0',
        totalTricks: 1,
        hands,
        taskLayout: [],
        unclaimedTaskCardIds: [],
        tasks: [],
      };
    }

    it('chooseMutedSeat is restricted to the commander, targeting another seat, exactly once, before trick 1', () => {
      const client = clientWithFixture(
        3,
        () => fixture({ '0': [card('pink', 1)], '1': [card('blue', 1)], '2': [card('green', 1)] }),
        { level: 11 },
      );

      actAs(client, '1').chooseMutedSeat!('2'); // not the commander -- rejected
      expect(client.store.getState().G.mutedSeatID).toBeNull();

      actAs(client, '0').chooseMutedSeat!('0'); // can't choose self
      expect(client.store.getState().G.mutedSeatID).toBeNull();

      actAs(client, '0').chooseMutedSeat!('1'); // valid
      expect(client.store.getState().G.mutedSeatID).toBe('1');

      actAs(client, '0').chooseMutedSeat!('2'); // already chosen -- rejected, stays '1'
      expect(client.store.getState().G.mutedSeatID).toBe('1');
    });

    it('rejects communicateCard from the muted seat, but not from any other seat', () => {
      const client = clientWithFixture(
        3,
        () =>
          fixture({
            '0': [card('pink', 5)],
            '1': [card('blue', 5)],
            '2': [card('green', 5)],
          }),
        { level: 11 },
      );
      actAs(client, '0').chooseMutedSeat!('1');

      actAs(client, '1').communicateCard!('blue5', 'only'); // muted -- rejected
      expect(client.store.getState().G.communications['1'].used).toBe(false);

      actAs(client, '2').communicateCard!('green5', 'only'); // not muted -- accepted
      expect(client.store.getState().G.communications['2'].used).toBe(true);
    });
  });

  describe('random card pass after trick 1 (mission 12)', () => {
    it('passes exactly one card clockwise per seat, exempting a communicated card, conserving every card', () => {
      const client = clientWithFixture(
        3,
        () => ({
          activeSeatIDs: ['0', '1', '2'],
          commanderSeatID: '0',
          nextTrickLeaderSeatID: '0',
          totalTricks: 5, // continues well past trick 1 -- just not reached in this test.
          taskLayout: [],
          unclaimedTaskCardIds: [],
          tasks: [],
          hands: {
            '0': [card('pink', 1), card('blue', 1), card('green', 1)],
            '1': [card('pink', 2), card('blue', 2)],
            '2': [card('pink', 3), card('green', 3)],
          },
        }),
        { level: 12 },
      );
      // '0' communicates blue1 (their only blue card) before trick 1 -- must survive the pass.
      actAs(client, '0').communicateCard!('blue1', 'only');
      actAs(client, '0').confirmRoundReady!();
      actAs(client, '1').confirmRoundReady!();
      actAs(client, '2').confirmRoundReady!();

      actAs(client, '0').playCard!('pink1');
      actAs(client, '1').playCard!('pink2');
      actAs(client, '2').playCard!('pink3'); // wins trick 1 -- triggers the one-time pass immediately after.

      const G = client.store.getState().G;
      // '0''s only non-communicated remaining card (green1) was the sole
      // eligible pick, given to '1'; '1''s only remaining card (blue2) was
      // given to '2'; '2''s only remaining card (green3) was given to '0'
      // -- deterministic, since each seat had exactly one eligible card.
      expect(G.hands['0'].map((c: Card) => c.id).sort()).toEqual(['blue1', 'green3']);
      expect(G.hands['1'].map((c: Card) => c.id)).toEqual(['green1']);
      expect(G.hands['2'].map((c: Card) => c.id)).toEqual(['blue2']);
      // The communicated card survived, untouched, in its owner's hand.
      expect(G.communications['0']).toEqual({ used: true, cardId: 'blue1', position: 'only' });
    });
  });

  describe('achievement mission: win a trick with each rocket (mission 13)', () => {
    function fixture(overrides: Partial<CrewG>): Partial<CrewG> {
      return {
        activeSeatIDs: ['0', '1', '2'],
        commanderSeatID: '0',
        nextTrickLeaderSeatID: '0',
        taskLayout: [],
        unclaimedTaskCardIds: [],
        tasks: [],
        ...overrides,
      };
    }

    it('wins the instant the 4th rocket wins a trick, even before the mission\'s last trick', () => {
      const client = clientWithFixture(
        3,
        () =>
          fixture({
            totalTricks: 5,
            trickNumber: 3,
            winningCardIdsSeen: ['rocket1', 'rocket2', 'rocket3'],
            hands: { '0': [card('rocket', 4)], '1': [card('blue', 6)], '2': [card('green', 7)] },
          }),
        { level: 13 },
      );
      actAs(client, '0').confirmRoundReady!();
      actAs(client, '1').confirmRoundReady!();
      actAs(client, '2').confirmRoundReady!();
      actAs(client, '0').playCard!('rocket4'); // a rocket always wins -- completes the achievement.
      actAs(client, '1').playCard!('blue6');
      actAs(client, '2').playCard!('green7');

      const state = client.store.getState();
      expect(state.G.matchResult).toBe('won');
      expect(state.G.trickNumber).toBeLessThan(state.G.totalTricks);
    });

    it('loses if the mission\'s last trick arrives without every rocket having won one', () => {
      const client = clientWithFixture(
        3,
        () =>
          fixture({
            totalTricks: 4,
            trickNumber: 3,
            winningCardIdsSeen: ['rocket1', 'rocket2', 'rocket3'], // rocket4 never won a trick
            hands: { '0': [card('pink', 3)], '1': [card('pink', 6)], '2': [card('green', 2)] },
          }),
        { level: 13 },
      );
      actAs(client, '0').confirmRoundReady!();
      actAs(client, '1').confirmRoundReady!();
      actAs(client, '2').confirmRoundReady!();
      actAs(client, '0').playCard!('pink3');
      actAs(client, '1').playCard!('pink6');
      actAs(client, '2').playCard!('green2');

      expect(client.store.getState().G.matchResult).toBe('lost');
    });
  });

  describe('commander assigns tasks (mission 20)', () => {
    it('pickTask is always rejected on a commanderAssignsTasks mission', () => {
      const client = clientWithFixture(
        3,
        () => ({ activeSeatIDs: ['0', '1', '2'], commanderSeatID: '0', nextTrickLeaderSeatID: '0' }),
        { level: 20 },
      );
      const pool = client.store.getState().G.unclaimedTaskCardIds as string[];
      actAs(client, '0').pickTask!(pool[0]);
      expect(client.store.getState().G.unclaimedTaskCardIds).toEqual(pool); // untouched
      expect(client.store.getState().G.tasks).toHaveLength(0);
    });

    it('chooseTaskRecipient is restricted to the commander, targeting another seat, and assigns every task card at once', () => {
      const client = clientWithFixture(
        3,
        () => ({ activeSeatIDs: ['0', '1', '2'], commanderSeatID: '0', nextTrickLeaderSeatID: '0' }),
        { level: 20 }, // taskCount 2
      );
      const taskLayout = client.store.getState().G.taskLayout as { id: string }[];
      expect(taskLayout).toHaveLength(2);

      actAs(client, '1').chooseTaskRecipient!('2'); // not the commander -- rejected
      expect(client.store.getState().G.tasks).toHaveLength(0);

      actAs(client, '0').chooseTaskRecipient!('0'); // can't choose self
      expect(client.store.getState().G.tasks).toHaveLength(0);

      actAs(client, '0').chooseTaskRecipient!('1'); // valid -- assigns both tasks to '1' at once
      const state = client.store.getState();
      expect(state.G.unclaimedTaskCardIds).toHaveLength(0);
      expect(state.G.tasks).toHaveLength(2);
      expect(state.G.tasks.every((t: Task) => t.ownerSeatID === '1')).toBe(true);
      expect(state.ctx.phase).toBe('trickConfirm'); // draft phase ended in one move.
    });
  });

  describe('playerView', () => {
    it('exposes only the viewing seat\'s own hand, and every seat\'s hand count', () => {
      const state = newClient(4, { level: 1 }).store.getState();
      const ownView = crewGameDef.playerView!({ G: state.G, ctx: state.ctx, playerID: '0' });
      expect(Object.keys(ownView.hands)).toEqual(['0']);
      expect(ownView.handCounts['1']).toBe(state.G.hands['1'].length);

      const otherView = crewGameDef.playerView!({ G: state.G, ctx: state.ctx, playerID: '1' });
      expect(Object.keys(otherView.hands)).toEqual(['1']);

      const spectatorView = crewGameDef.playerView!({ G: state.G, ctx: state.ctx, playerID: null });
      expect(spectatorView.hands).toEqual({});
    });
  });

  describe('disruption (mission 18: disruptionResumesAtTrick 2)', () => {
    function fixture(trickNumber: number): Partial<CrewG> {
      return {
        activeSeatIDs: ['0', '1', '2'],
        commanderSeatID: '0',
        nextTrickLeaderSeatID: '0',
        trickNumber,
        hands: { '0': [card('pink', 5)], '1': [card('blue', 2)], '2': [card('green', 2)] },
        taskLayout: [],
        unclaimedTaskCardIds: [],
        tasks: [],
      };
    }

    it('blocks communicateCard before the mission has played through trick 2', () => {
      const client = clientWithFixture(3, () => fixture(0), { level: 18 });
      actAs(client, '0').communicateCard!('pink5', 'only');
      expect(client.store.getState().G.communications['0'].used).toBe(false);
    });

    it('still blocks communicateCard right before trick 2 (trickNumber 1)', () => {
      const client = clientWithFixture(3, () => fixture(1), { level: 18 });
      actAs(client, '0').communicateCard!('pink5', 'only');
      expect(client.store.getState().G.communications['0'].used).toBe(false);
    });

    it('allows communicateCard once the mission has played through trick 2 (trickNumber 2)', () => {
      const client = clientWithFixture(3, () => fixture(2), { level: 18 });
      actAs(client, '0').communicateCard!('pink5', 'only');
      expect(client.store.getState().G.communications['0'].used).toBe(true);
    });
  });

  describe('dead zone (mission 6)', () => {
    function fixture(): Partial<CrewG> {
      return {
        activeSeatIDs: ['0', '1', '2'],
        commanderSeatID: '0',
        nextTrickLeaderSeatID: '0',
        hands: { '0': [card('pink', 5)], '1': [], '2': [] },
        taskLayout: [],
        unclaimedTaskCardIds: [],
        tasks: [],
      };
    }

    it('hides the claimed position from every other seat and from a spectator, but not from the seat who made it', () => {
      const client = clientWithFixture(3, fixture, { level: 6 });
      actAs(client, '0').communicateCard!('pink5', 'only');
      const state = client.store.getState();

      // The underlying G (server-authoritative, used for move validation) always keeps the real position.
      expect(state.G.communications['0'].position).toBe('only');

      const ownView = crewGameDef.playerView!({ G: state.G, ctx: state.ctx, playerID: '0' });
      expect(ownView.communications['0']).toEqual({ used: true, cardId: 'pink5', position: 'only' });

      const otherView = crewGameDef.playerView!({ G: state.G, ctx: state.ctx, playerID: '1' });
      expect(otherView.communications['0']).toEqual({ used: true, cardId: 'pink5', position: null });

      const spectatorView = crewGameDef.playerView!({ G: state.G, ctx: state.ctx, playerID: null });
      expect(spectatorView.communications['0'].position).toBeNull();
    });

    it('does not mask a communication on a mission without Dead Zone', () => {
      const client = clientWithFixture(3, fixture, { level: 1 });
      actAs(client, '0').communicateCard!('pink5', 'only');
      const state = client.store.getState();
      const otherView = crewGameDef.playerView!({ G: state.G, ctx: state.ctx, playerID: '1' });
      expect(otherView.communications['0'].position).toBe('only');
    });
  });

  describe("commander's distribution (mission 22 placeholder)", () => {
    it('pickTask is always rejected on a commanderDistribution mission', () => {
      const client = clientWithFixture(
        3,
        () => ({ activeSeatIDs: ['0', '1', '2'], commanderSeatID: '0', nextTrickLeaderSeatID: '0' }),
        { level: 22 },
      );
      const pool = client.store.getState().G.unclaimedTaskCardIds as string[];
      actAs(client, '0').pickTask!(pool[0]);
      expect(client.store.getState().G.unclaimedTaskCardIds).toEqual(pool);
      expect(client.store.getState().G.tasks).toHaveLength(0);
    });

    it('distributeTask is restricted to the commander and reveals task cards one at a time, in fixed layout order', () => {
      const client = clientWithFixture(
        3,
        () => ({ activeSeatIDs: ['0', '1', '2'], commanderSeatID: '0', nextTrickLeaderSeatID: '0' }),
        { level: 22 }, // taskCount 3
      );
      const taskLayout = client.store.getState().G.taskLayout as { id: string }[];
      expect(taskLayout).toHaveLength(3);

      actAs(client, '1').distributeTask!('2'); // not the commander -- rejected
      expect(client.store.getState().G.tasks).toHaveLength(0);

      actAs(client, '0').distributeTask!('0'); // the commander CAN choose themselves here, unlike chooseTaskRecipient
      const state = client.store.getState();
      expect(state.G.tasks).toHaveLength(1);
      expect(state.G.tasks[0]!.taskCardId).toBe(taskLayout[0]!.id);
      expect(state.G.tasks[0]!.ownerSeatID).toBe('0');
    });

    it('enforces the even-split rule: no seat may ever end up two tasks ahead of another', () => {
      const client = clientWithFixture(
        3,
        () => ({ activeSeatIDs: ['0', '1', '2'], commanderSeatID: '0', nextTrickLeaderSeatID: '0' }),
        { level: 22 }, // taskCount 3
      );
      actAs(client, '0').distributeTask!('0'); // seat0: 1, seat1: 0, seat2: 0
      actAs(client, '0').distributeTask!('0'); // rejected -- seat0 already ahead of the minimum
      expect(client.store.getState().G.tasks).toHaveLength(1);

      actAs(client, '0').distributeTask!('1'); // valid -- seat1 tied for the minimum (0)
      expect(client.store.getState().G.tasks).toHaveLength(2);

      actAs(client, '0').distributeTask!('0'); // still rejected -- seat0 (1) > seat2's minimum (0)
      expect(client.store.getState().G.tasks).toHaveLength(2);

      actAs(client, '0').distributeTask!('2'); // valid -- last task, ties everyone at 1
      const state = client.store.getState();
      expect(state.G.tasks).toHaveLength(3);
      expect(state.G.tasks.map((t: Task) => t.ownerSeatID).sort()).toEqual(['0', '1', '2']);
      expect(state.G.unclaimedTaskCardIds).toHaveLength(0);
      expect(state.ctx.phase).toBe('trickConfirm'); // draft phase ended once every task was assigned.
    });
  });

  describe('task handover (mission 23 placeholder, 5 players only)', () => {
    function fixture(): Partial<CrewG> {
      return {
        activeSeatIDs: ['0', '1', '2', '3', '4'],
        commanderSeatID: '0',
        nextTrickLeaderSeatID: '0',
        trickNumber: 0,
        taskLayout: [],
        unclaimedTaskCardIds: [],
        tasks: [
          task({ ownerSeatID: '1', targetCardId: 'pink1', draftIndex: 0 }),
          task({ ownerSeatID: '2', targetCardId: 'blue2', draftIndex: 1 }),
        ],
      };
    }

    it('is rejected outside a 5-player game even when the level allows it', () => {
      const client = clientWithFixture(3, () => ({ ...fixture(), activeSeatIDs: ['0', '1', '2'] }), { level: 23 });
      actAs(client, '1').handoverTask!('Tpink1', '0');
      expect(client.store.getState().G.tasks[0].ownerSeatID).toBe('1');
    });

    it('is rejected once trick 1 has already been played', () => {
      const client = clientWithFixture(5, () => ({ ...fixture(), trickNumber: 1 }), { level: 23 });
      actAs(client, '1').handoverTask!('Tpink1', '0');
      expect(client.store.getState().G.tasks[0].ownerSeatID).toBe('1');
    });

    it('is rejected for a task the caller does not own', () => {
      const client = clientWithFixture(5, fixture, { level: 23 });
      actAs(client, '3').handoverTask!('Tpink1', '0'); // seat 3 doesn't own this task -- rejected
      expect(client.store.getState().G.tasks[0].ownerSeatID).toBe('1');
    });

    it('is rejected when handing the task to oneself', () => {
      const client = clientWithFixture(5, fixture, { level: 23 });
      actAs(client, '1').handoverTask!('Tpink1', '1');
      expect(client.store.getState().G.tasks[0].ownerSeatID).toBe('1');
    });

    it('transfers ownership exactly once for the whole mission', () => {
      const client = clientWithFixture(5, fixture, { level: 23 });
      actAs(client, '1').handoverTask!('Tpink1', '0');
      let state = client.store.getState();
      expect(state.G.tasks[0].ownerSeatID).toBe('0');
      expect(state.G.handoverUsed).toBe(true);

      // A second handover attempt, even of a different task by a different seat, is rejected.
      actAs(client, '2').handoverTask!('Tblue2', '3');
      state = client.store.getState();
      expect(state.G.tasks[1].ownerSeatID).toBe('2');
    });
  });
});
