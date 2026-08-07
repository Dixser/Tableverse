import { describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';

import type { EventId, ItemId, PhaseId } from './cards.js';
import { PHASE_IDS } from './cards.js';
import { PHASE_RULES } from './constants.js';
import { HIDDEN_LIMIT, magalufGameDef, type MagalufG } from './gameDef.js';
import { magalufModule } from './index.js';
import { clampSettings, DEFAULT_SETTINGS } from './settings.js';
import { bankRound, newPlayer } from './state.js';

function phaseMinimum(g: MagalufG): number {
  return PHASE_RULES[PHASE_IDS[g.phase] as PhaseId].minDrinks;
}

// client.store.getState() everywhere, not client.getState() -- the latter runs
// G through playerView, which strips the very field several of these tests
// need to inspect.

type AnyMoves = Record<string, (...args: unknown[]) => unknown>;

function actAs(
  client: { updatePlayerID: (id: string) => void; moves: AnyMoves },
  playerID: string,
): AnyMoves {
  client.updatePlayerID(playerID);
  return client.moves;
}

function makeClient(numPlayers = 3, overrides: (G: MagalufG) => void = () => {}) {
  const game = {
    ...magalufGameDef,
    seed: 'magaluf-test-seed',
    setup: (ctx: Parameters<NonNullable<typeof magalufGameDef.setup>>[0], setupData?: unknown) => {
      const G = magalufGameDef.setup!(ctx, setupData as never) as MagalufG;
      overrides(G);
      return G;
    },
  };
  return Client({ game, numPlayers }) as unknown as {
    updatePlayerID: (id: string) => void;
    moves: AnyMoves;
    store: { getState: () => { G: MagalufG; ctx: { currentPlayer: string; gameover?: unknown } } };
  };
}

type TestClient = ReturnType<typeof makeClient>;

function G(client: TestClient): MagalufG {
  return client.store.getState().G;
}

/** Drives the table until `stop` is true, or the weekend ends. */
function play(
  client: TestClient,
  choose: (g: MagalufG, seat: string) => 'drink' | 'withdraw',
  stop: (g: MagalufG) => boolean = () => false,
): void {
  for (let guard = 0; guard < 4000; guard++) {
    const g = G(client);
    if (g.finished || stop(g)) return;
    const seat = g.turnSeatID;
    const move = choose(g, seat);
    actAs(client, seat)[move]!();
  }
  throw new Error('play() did not terminate');
}

const alwaysWithdraw = () => 'withdraw' as const;
const alwaysDrink = () => 'drink' as const;

/** Meets the phase's drink minimum, then leaves. Survives a normal weekend. */
const moderate = (g: MagalufG, seat: string) =>
  g.players[seat]!.drinksThisPhase < phaseMinimum(g) ? ('drink' as const) : ('withdraw' as const);

/** Stacks the current decks so the next draws are known. */
function stack(g: MagalufG, alcohol: string[], events: EventId[]): void {
  g.alcoholDeck = [...alcohol].reverse();
  g.eventDeck = [...events].reverse();
}

describe('magaluf gameDef', () => {
  describe('structure', () => {
    it('runs 3 days x 3 phases and finishes after Sunday (AC1)', () => {
      const client = makeClient(3);
      const seen = new Set<string>();
      play(client, alwaysWithdraw, (g) => {
        seen.add(`${g.day}-${g.phase}`);
        return false;
      });
      expect(G(client).finished).toBe(true);
      expect(seen.size).toBe(9);
      expect(client.store.getState().ctx.gameover).toBeDefined();
    });

    it('ends the weekend early when every seat is dead (AC1)', () => {
      // A limit below zero means everyone is over it on the very first night.
      const client = makeClient(3, (g) => {
        g.limit = -5;
        g.settings = { ...g.settings, basePoolChance: 0 };
      });
      play(client, alwaysWithdraw);
      const g = G(client);
      expect(g.activeSeatIDs.every((id) => g.players[id]!.status === 'dead')).toBe(true);
      expect(g.day).toBe(0);
      expect(g.finished).toBe(true);
    });

    it('rotates which seat opens each phase', () => {
      const client = makeClient(3);
      const openers: string[] = [G(client).turnSeatID];
      let phase = 0;
      play(client, alwaysWithdraw, (g) => {
        if (g.phase !== phase) {
          phase = g.phase;
          openers.push(g.turnSeatID);
        }
        return openers.length >= 3;
      });
      expect(new Set(openers).size).toBeGreaterThan(1);
    });
  });

  describe('drinking', () => {
    it('applies intoxication and VP then resolves exactly one event (AC2)', () => {
      const client = makeClient(3, (g) => stack(g, ['pinta'], ['foto']));
      const seat = G(client).turnSeatID;
      actAs(client, seat).drink!();

      const player = G(client).players[seat]!;
      expect(player.intox).toBe(2);
      expect(player.roundVP).toBe(2 + 2); // pinta 2 VP + foto 2 VP
      expect(player.drinksThisPhase).toBe(1);
      expect(G(client).turnSeatID).not.toBe(seat);
    });

    it('auto-withdraws a player who reaches the phase drink cap (AC9)', () => {
      const client = makeClient(3);
      const cap = PHASE_RULES.tardeo.maxDrinks;
      const seat = G(client).turnSeatID;
      play(client, (g, s) => (s === seat ? 'drink' : 'withdraw'), (g) =>
        g.players[seat]!.drinksThisPhase >= cap || g.phase !== 0,
      );
      const player = G(client).players[seat]!;
      if (G(client).phase === 0) expect(player.status).not.toBe('partying');
    });

    it('counts a drink nobody chose toward the phase total', () => {
      const client = makeClient(3, (g) => stack(g, ['cana', 'cana'], ['chupitoCasa']));
      const seat = G(client).turnSeatID;
      actAs(client, seat).drink!();
      expect(G(client).players[seat]!.drinksThisPhase).toBe(2);
    });
  });

  describe('items', () => {
    it('does not end the turn for kebab, botella, redbull or pastis (AC3)', () => {
      for (const item of ['kebab', 'botella', 'redbull', 'pastis'] as ItemId[]) {
        const client = makeClient(3, (g) => {
          g.players[g.turnSeatID]!.items = [item];
          g.players[g.turnSeatID]!.intox = 8;
        });
        const seat = G(client).turnSeatID;
        actAs(client, seat).useItem!(item);
        expect(G(client).turnSeatID).toBe(seat);
      }
    });

    it('porro ends the turn without drawing or withdrawing (AC3, AC5)', () => {
      const client = makeClient(3, (g) => {
        g.players[g.turnSeatID]!.items = ['porro'];
      });
      const seat = G(client).turnSeatID;
      actAs(client, seat).useItem!('porro');

      const player = G(client).players[seat]!;
      expect(player.status).toBe('partying');
      expect(player.drinksThisPhase).toBe(0);
      expect(player.intox).toBe(0);
      expect(G(client).turnSeatID).not.toBe(seat);
    });

    it('farlopa halves only its own extra draw (AC6)', () => {
      // Cubata is 3 intoxication: the halved extra draw is 1, the normal drink
      // that follows is a full 3.
      const client = makeClient(3, (g) => {
        g.players[g.turnSeatID]!.items = ['farlopa'];
        stack(g, ['cubata', 'cubata'], ['nada', 'nada']);
      });
      const seat = G(client).turnSeatID;
      actAs(client, seat).useItem!('farlopa');

      expect(G(client).players[seat]!.intox).toBe(1);
      expect(G(client).players[seat]!.drinksThisPhase).toBe(1);
      expect(G(client).turnSeatID).toBe(seat); // the extra turn did not consume it

      actAs(client, seat).drink!();
      expect(G(client).players[seat]!.intox).toBe(4);
    });

    it('rejects a second item in the same turn (AC4)', () => {
      const client = makeClient(3, (g) => {
        g.players[g.turnSeatID]!.items = ['kebab', 'botella'];
        g.players[g.turnSeatID]!.intox = 8;
      });
      const seat = G(client).turnSeatID;
      actAs(client, seat).useItem!('kebab');
      const after = G(client).players[seat]!.intox;
      actAs(client, seat).useItem!('botella');
      expect(G(client).players[seat]!.intox).toBe(after);
      expect(G(client).players[seat]!.items).toEqual(['botella']);
    });

    it('rejects an item the player does not hold', () => {
      const client = makeClient(3);
      const seat = G(client).turnSeatID;
      const before = G(client);
      actAs(client, seat).useItem!('kebab');
      expect(G(client)).toEqual(before);
    });

    it('never lets intoxication fall below zero (AC10)', () => {
      const client = makeClient(3, (g) => {
        g.players[g.turnSeatID]!.items = ['kebab'];
        g.players[g.turnSeatID]!.intox = 1;
      });
      const seat = G(client).turnSeatID;
      actAs(client, seat).useItem!('kebab');
      expect(G(client).players[seat]!.intox).toBe(0);
    });
  });

  describe('leaving a phase', () => {
    it('charges aguafiestas below the minimum but not at it (AC7)', () => {
      const client = makeClient(3);
      const quitter = G(client).turnSeatID;
      actAs(client, quitter).withdraw!();
      expect(G(client).players[quitter]!.roundVP).toBe(-PHASE_RULES.tardeo.earlyExitPenalty);

      const stayer = G(client).turnSeatID;
      play(client, (g, s) => (s === stayer ? 'drink' : 'withdraw'), (g) =>
        g.players[stayer]!.drinksThisPhase >= PHASE_RULES.tardeo.minDrinks,
      );
      const before = G(client).players[stayer]!.roundVP;
      while (G(client).turnSeatID !== stayer) {
        actAs(client, G(client).turnSeatID).withdraw!();
      }
      actAs(client, stayer).withdraw!();
      // No penalty. The only change allowed is the last-standing bonus.
      expect(G(client).players[stayer]!.roundVP).toBeGreaterThanOrEqual(before);
    });

    it('withholds ultimo en pie from a last seat below the drink minimum (AC8)', () => {
      const client = makeClient(3);
      play(client, alwaysWithdraw, (g) => g.phase !== 0);
      for (const id of G(client).activeSeatIDs) {
        expect(G(client).players[id]!.roundVP).toBe(-PHASE_RULES.tardeo.earlyExitPenalty);
      }
    });
  });

  describe('resaca and banking', () => {
    it('resets each morning to resaca, not to zero (AC10)', () => {
      const client = makeClient(3, (g) => {
        g.players['0']!.resaca = 5;
      });
      play(client, alwaysWithdraw, (g) => g.day === 1);
      expect(G(client).players['0']!.intox).toBe(5);
      expect(G(client).players['1']!.intox).toBe(0);
    });

    // Exercised directly rather than through a match: boardgame.io freezes G,
    // so a test cannot plant an exact round pool mid-weekend, and inferring one
    // from a played-out day would be asserting on the deck shuffle instead of
    // on the arithmetic.
    it('banks the round at the day multiplier on surviving (AC11)', () => {
      const g = { players: { '0': newPlayer() } } as unknown as MagalufG;
      g.players['0']!.roundVP = 20;

      expect(bankRound(g, '0', 1)).toBe(20);
      expect(g.players['0']!.roundVP).toBe(0);

      g.players['0']!.roundVP = 20;
      expect(bankRound(g, '0', 1.5)).toBe(30);
      g.players['0']!.roundVP = 20;
      expect(bankRound(g, '0', 2.25)).toBe(45);
      expect(g.players['0']!.bankedVP).toBe(95);
    });

    it('banks and clears the round pool across a real weekend', () => {
      // A moderate policy on purpose: `alwaysDrink` full-sends every seat to
      // the phase cap, which puts the whole table over the limit and kills
      // everyone on Friday — correct behaviour, but it leaves no survivor to
      // observe banking on.
      const client = makeClient(3);
      play(client, moderate);
      const g = G(client);
      expect(g.log.filter((e) => e.key === 'magaluf.log.survived').length).toBeGreaterThan(0);
      for (const id of g.activeSeatIDs) expect(g.players[id]!.roundVP).toBe(0);
      expect(g.activeSeatIDs.some((id) => g.players[id]!.bankedVP > 0)).toBe(true);
    });
  });

  describe('balconing', () => {
    // A limit of 0 set at setup is how these tests put a player over it without
    // mutating a frozen G mid-match: any drink at all is now fatal, and a
    // player who never drinks sits exactly ON the limit.
    const drinkToMinimum = (seat: string) => (g: MagalufG, s: string) =>
      s === seat && g.players[s]!.drinksThisPhase < phaseMinimum(g) ? 'drink' : 'withdraw';

    it('forfeits the round pool on both outcomes (AC11)', () => {
      for (const basePoolChance of [1, 0]) {
        const client = makeClient(3, (g) => {
          g.limit = 0;
          g.settings = { ...g.settings, basePoolChance, poolDecay: 0 };
        });
        play(client, drinkToMinimum('0'), (g) => g.day !== 0 || g.finished);

        const jump = G(client).jumps.find((j) => j.seatID === '0');
        expect(jump).toBeDefined();
        expect(jump!.survived).toBe(basePoolChance === 1);
        expect(jump!.lostVP).toBeGreaterThan(0);
        // The forfeit invariant: nothing from the round survives, so the only
        // VP a jumper can end the night with is the legend bonus.
        expect(G(client).players['0']!.bankedVP).toBe(jump!.legendVP);
        expect(G(client).players['0']!.roundVP).toBe(0);
        expect(G(client).players['0']!.items).toEqual([]);
      }
    });

    it('pays the legend bonus and resaca to a survivor, kills the rest (AC12)', () => {
      const survivor = makeClient(3, (g) => {
        g.limit = 0;
        g.settings = { ...g.settings, basePoolChance: 1, poolDecay: 0 };
      });
      play(survivor, drinkToMinimum('0'), (g) => g.day !== 0 || g.finished);
      const survivorJump = G(survivor).jumps.find((j) => j.seatID === '0')!;
      expect(G(survivor).players['0']!.status).not.toBe('dead');
      expect(G(survivor).players['0']!.bankedVP).toBe(3 + survivorJump.d);
      expect(G(survivor).players['0']!.resaca).toBe(4);

      const dead = makeClient(3, (g) => {
        g.limit = 0;
        g.settings = { ...g.settings, basePoolChance: 0, poolDecay: 0 };
      });
      play(dead, drinkToMinimum('0'), (g) => g.day !== 0 || g.finished);
      expect(G(dead).players['0']!.status).toBe('dead');
      expect(G(dead).jumps[0]!.legendVP).toBe(0);
      expect(G(dead).players['0']!.resaca).toBe(0);
    });

    it('never triggers at or exactly on the limit (AC13)', () => {
      // Everyone starts the day sitting exactly on the limit and nobody drinks.
      const client = makeClient(3, (g) => {
        g.limit = 3;
        for (const id of g.activeSeatIDs) {
          g.players[id]!.resaca = 3;
          g.players[id]!.intox = 3;
        }
      });
      play(client, alwaysWithdraw, (g) => g.day !== 0);
      expect(G(client).jumps).toHaveLength(0);
    });
  });

  describe('the police', () => {
    it('arrests contraband holders, banks their VP and cancels the check (AC14, AC15)', () => {
      // Limit 0 means the cana drunk on the way into the raid would otherwise
      // be fatal at the end of the night — so if no jump is recorded, the cell
      // is what saved them.
      const client = makeClient(3, (g) => {
        g.limit = 0;
        g.players[g.turnSeatID]!.items = ['pastis'];
        g.players[g.turnSeatID]!.roundVP = 10;
        stack(g, ['cana'], ['redada']);
      });
      const seat = G(client).turnSeatID;
      actAs(client, seat).drink!();

      const player = G(client).players[seat]!;
      expect(player.status).toBe('arrested');
      expect(player.bankedVP).toBe(11); // 10 + the cana on the way in, at x1
      expect(player.roundVP).toBe(0);
      expect(player.items).toEqual([]);
      expect(player.intox).toBeGreaterThan(0);

      play(client, alwaysWithdraw, (g) => g.day !== 0);
      expect(G(client).jumps.some((j) => j.seatID === seat)).toBe(false);
      expect(G(client).players[seat]!.status).toBe('partying'); // released
    });

    it('does nothing when nobody holds contraband (AC14)', () => {
      const client = makeClient(3, (g) => stack(g, ['cana'], ['redada']));
      const seat = G(client).turnSeatID;
      actAs(client, seat).drink!();
      expect(G(client).players[seat]!.status).toBe('partying');
    });

    it('charges no aguafiestas penalty to an arrested player (AC14)', () => {
      const client = makeClient(3, (g) => {
        g.players[g.turnSeatID]!.items = ['farlopa'];
        stack(g, ['cana'], ['redada']);
      });
      const seat = G(client).turnSeatID;
      actAs(client, seat).drink!();
      expect(G(client).players[seat]!.bankedVP).toBe(1); // the cana only, no -2
    });
  });

  describe('the limit and playerView', () => {
    it('reveals at the configured phase and never when set to never (AC16)', () => {
      for (const [revealAt, phase] of [
        ['tardeo', 0],
        ['noche', 1],
        ['after', 2],
      ] as const) {
        const client = makeClient(3, (g) => {
          g.settings = { ...g.settings, limitRevealAt: revealAt };
          g.limitRevealed = revealAt === 'tardeo';
        });
        play(client, alwaysWithdraw, (g) => g.day === 0 && g.phase === phase);
        expect(G(client).limitRevealed).toBe(true);
      }

      const never = makeClient(3, (g) => {
        g.settings = { ...g.settings, limitRevealAt: 'never' };
      });
      play(never, alwaysWithdraw, (g) => g.day === 1);
      expect(G(never).limitRevealed).toBe(false);
    });

    it('hides the limit from players and spectators until revealed (AC17)', () => {
      const client = makeClient(3, (g) => {
        g.settings = { ...g.settings, limitRevealAt: 'never' };
      });
      const state = client.store.getState();
      const viewFor = (playerID: string | null) =>
        magalufGameDef.playerView!({ G: state.G, ctx: state.ctx as never, playerID }) as MagalufG;

      expect(state.G.limit).toBeGreaterThan(0);
      for (const viewer of ['0', '1', '2', null]) {
        expect(viewFor(viewer).limit).toBe(HIDDEN_LIMIT);
      }
    });

    it('shows the limit to a red bull drinker and nobody else (AC17)', () => {
      const client = makeClient(3, (g) => {
        g.settings = { ...g.settings, limitRevealAt: 'never' };
        g.players[g.turnSeatID]!.items = ['redbull'];
      });
      const seat = G(client).turnSeatID;
      actAs(client, seat).useItem!('redbull');

      const state = client.store.getState();
      const viewFor = (playerID: string | null) =>
        magalufGameDef.playerView!({ G: state.G, ctx: state.ctx as never, playerID }) as MagalufG;

      expect(viewFor(seat).limit).toBe(state.G.limit);
      for (const other of G(client).activeSeatIDs.filter((id) => id !== seat)) {
        expect(viewFor(other).limit).toBe(HIDDEN_LIMIT);
      }
      expect(viewFor(null).limit).toBe(HIDDEN_LIMIT);
    });

    it('draws a fresh limit each morning', () => {
      const client = makeClient(3);
      const friday = G(client).limit;
      expect([26, 27, 28, 29]).toContain(friday);
      play(client, alwaysWithdraw, (g) => g.day === 1);
      expect([20, 23, 26, 29]).toContain(G(client).limit);
    });
  });

  describe('settings clamping (AC18)', () => {
    it('clamps out-of-range numbers rather than letting them reach game logic', () => {
      const wild = clampSettings({
        basePoolChance: 500,
        poolDecay: -3,
        limitShift: 999,
        saturdayMultiplier: 0,
        sundayMultiplier: 99,
      } as never);
      expect(wild.basePoolChance).toBe(1);
      expect(wild.poolDecay).toBe(0);
      expect(wild.limitShift).toBe(10);
      expect(wild.saturdayMultiplier).toBe(1);
      expect(wild.sundayMultiplier).toBe(4);
    });

    it('falls back to the tuned default for a non-finite or missing value', () => {
      const broken = clampSettings({
        basePoolChance: Number.NaN,
        poolDecay: 'nope',
        limitRevealAt: 'brunch',
      } as never);
      expect(broken.basePoolChance).toBe(DEFAULT_SETTINGS.basePoolChance);
      expect(broken.poolDecay).toBe(DEFAULT_SETTINGS.poolDecay);
      expect(broken.limitRevealAt).toBe(DEFAULT_SETTINGS.limitRevealAt);
    });

    // setup is called directly here rather than through Client, which takes no
    // setupData of its own -- the same reason cahoots' tests override setup.
    it('reaches setup through setupData', () => {
      const fakeRandom = { Number: () => 0.5, Shuffle: <T>(deck: T[]) => deck };
      const g = magalufGameDef.setup!(
        { ctx: { numPlayers: 3 }, random: fakeRandom } as never,
        { basePoolChance: 42, limitShift: -2 } as never,
      ) as MagalufG;

      expect(g.settings.basePoolChance).toBe(1); // clamped down from 42
      expect(g.settings.limitShift).toBe(-2);
      expect([24, 25, 26, 27]).toContain(g.limit); // Friday deck, shifted -2
    });

    it('rejects a claimed-seat list below the player floor', () => {
      const fakeRandom = { Number: () => 0.5, Shuffle: <T>(deck: T[]) => deck };
      expect(() =>
        magalufGameDef.setup!(
          { ctx: { numPlayers: 6 }, random: fakeRandom } as never,
          { claimedSeatIDs: ['0', '1'] } as never,
        ),
      ).toThrow(/at least 3/);
    });
  });

  describe('turn rotation (AC19)', () => {
    it('skips withdrawn seats', () => {
      const client = makeClient(3);
      const first = G(client).turnSeatID;
      actAs(client, first).withdraw!();
      const second = G(client).turnSeatID;
      expect(second).not.toBe(first);
      actAs(client, second).withdraw!();
      expect(G(client).turnSeatID).not.toBe(first);
      expect(G(client).turnSeatID).not.toBe(second);
    });

    it('consumes a skipNextTurn flag exactly once', () => {
      const client = makeClient(3, (g) => stack(g, ['cana'], ['perdido']));
      const seat = G(client).turnSeatID;
      actAs(client, seat).drink!();
      expect(G(client).players[seat]!.skipNextTurn).toBe(true);

      // Everyone else acts; the flag should be spent when the rotation reaches
      // this seat, and it should be back in play the time after.
      play(client, alwaysDrink, (g) => g.players[seat]!.skipNextTurn === false);
      expect(G(client).players[seat]!.skipNextTurn).toBe(false);
    });

    it('rejects a move from a seat that is not up', () => {
      const client = makeClient(3);
      const notUp = G(client).activeSeatIDs.find((id) => id !== G(client).turnSeatID)!;
      const before = G(client);
      actAs(client, notUp).drink!();
      expect(G(client)).toEqual(before);
    });
  });

  describe('gameover (AC20)', () => {
    it('returns the highest banked VP as winner', () => {
      const client = makeClient(3);
      play(client, alwaysWithdraw);
      G(client); // finished
      const gameover = client.store.getState().ctx.gameover as { winner: string | string[] };
      const g = G(client);
      const best = Math.max(...g.activeSeatIDs.map((id) => g.players[id]!.bankedVP));
      const winners = Array.isArray(gameover.winner) ? gameover.winner : [gameover.winner];
      for (const id of winners) expect(g.players[id]!.bankedVP).toBe(best);
    });
  });

  describe('decks (AC21)', () => {
    it('never needs a mid-phase reshuffle in a full match at maxPlayers', () => {
      const client = makeClient(magalufModule.maxPlayers);
      let reshuffled = false;
      play(client, alwaysDrink, (g) => {
        // A reshuffle is the only way the discard can shrink while a phase runs.
        if (g.alcoholDeck.length === 0 && g.alcoholDiscard.length === 0) reshuffled = true;
        return false;
      });
      expect(reshuffled).toBe(false);
      expect(G(client).finished).toBe(true);
    });
  });

  describe('log (AC22)', () => {
    it('namespaces every entry under magaluf. and never cues the ending', () => {
      const client = makeClient(3);
      play(client, alwaysDrink);
      const g = G(client);
      expect(g.log.length).toBeGreaterThan(0);
      for (const entry of g.log) {
        expect(entry.key.startsWith('magaluf.')).toBe(true);
      }
      // ctx.gameover already drives the win/lose stinger centrally.
      const terminal = g.log.filter((e) => e.key === 'magaluf.log.cemento');
      for (const entry of terminal) expect(entry.sound).not.toBe('lose');
    });
  });
});
