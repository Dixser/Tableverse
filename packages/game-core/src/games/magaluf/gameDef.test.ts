import { describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';

import type { EventId, ItemId, PhaseId } from './cards.js';
import { PHASE_IDS } from './cards.js';
import { PHASE_RULES } from './constants.js';
import { HIDDEN_LIMIT, magalufGameDef, type MagalufG } from './gameDef.js';
import { magalufModule } from './index.js';
import { clampSettings, DEFAULT_SETTINGS } from './settings.js';
import { poolChance } from './balconing.js';
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

function makeClient(
  numPlayers = 3,
  overrides: (G: MagalufG) => void = () => {},
  seed = 'magaluf-test-seed',
) {
  const game = {
    ...magalufGameDef,
    seed,
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

/**
 * Drives the table until `stop` is true, or the weekend ends.
 *
 * Clears round-confirm gates automatically. Tests that care about the gate
 * itself drive it by hand instead; everything else wants to look through it at
 * the game underneath.
 */
function play(
  client: TestClient,
  choose: (g: MagalufG, seat: string) => 'drink' | 'withdraw',
  stop: (g: MagalufG) => boolean = () => false,
): void {
  for (let guard = 0; guard < 6000; guard++) {
    const g = G(client);
    if (g.finished || stop(g)) return;

    if (g.pendingEvent) {
      actAs(client, g.pendingEvent.seatID).revealEvent!();
      continue;
    }

    if (g.roundConfirm) {
      const waitingOn = g.roundConfirm.pendingSeatIDs.find(
        (id) => !g.roundConfirm!.confirmedSeatIDs.includes(id),
      );
      if (waitingOn === undefined) throw new Error('a complete wait did not advance');
      actAs(client, waitingOn).confirmRoundReady!();
      continue;
    }

    const seat = g.turnSeatID;
    actAs(client, seat)[choose(g, seat)]!();
  }
  throw new Error('play() did not terminate');
}

/** Drinks and immediately turns the event over, the way the old single move did. */
function drinkAndReveal(client: TestClient, seat: string): void {
  actAs(client, seat).drink!();
  const pending = G(client).pendingEvent;
  if (pending) actAs(client, pending.seatID).revealEvent!();
}

/** Plays until a gate opens, leaving it un-confirmed for the test to inspect. */
function playToGate(
  client: TestClient,
  choose: (g: MagalufG, seat: string) => 'drink' | 'withdraw' = alwaysWithdraw,
): void {
  for (let guard = 0; guard < 6000; guard++) {
    const g = G(client);
    if (g.finished || g.roundConfirm) return;
    if (g.pendingEvent) {
      actAs(client, g.pendingEvent.seatID).revealEvent!();
      continue;
    }
    const seat = g.turnSeatID;
    actAs(client, seat)[choose(g, seat)]!();
  }
  throw new Error('playToGate() did not reach a gate');
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
      // A limit below zero means everyone is over it on the very first night,
      // and a one-faced die can never beat it -- certain death, no seed-hunting.
      const client = makeClient(3, (g) => {
        g.limit = -5;
        g.settings = { ...g.settings, balconyDie: 1 };
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
    it('applies the drink, then stops with the event still face-down (AC2)', () => {
      const client = makeClient(3, (g) => stack(g, ['pinta'], ['foto']));
      const seat = G(client).turnSeatID;
      actAs(client, seat).drink!();

      const afterDrink = G(client).players[seat]!;
      expect(afterDrink.intox).toBe(2);
      expect(afterDrink.roundVP).toBe(2); // the pinta only -- the foto has not landed
      expect(afterDrink.drinksThisPhase).toBe(1);
      expect(G(client).pendingEvent).toEqual({ seatID: seat, endsTurn: true });
      // The turn has NOT moved on: the drawer still owes the reveal.
      expect(G(client).turnSeatID).toBe(seat);

      actAs(client, seat).revealEvent!();
      expect(G(client).players[seat]!.roundVP).toBe(2 + 2); // pinta + foto
      expect(G(client).pendingEvent).toBeNull();
      expect(G(client).turnSeatID).not.toBe(seat);
    });

    it('refuses every other move while an event is face-down', () => {
      const client = makeClient(3, (g) => {
        stack(g, ['pinta', 'pinta'], ['foto', 'foto']);
        g.players[g.turnSeatID]!.items = ['kebab'];
      });
      const seat = G(client).turnSeatID;
      actAs(client, seat).drink!();
      const held = G(client);

      actAs(client, seat).drink!();
      actAs(client, seat).withdraw!();
      actAs(client, seat).useItem!('kebab');
      expect(G(client)).toEqual(held);
    });

    it('only the seat that drew may turn the event over', () => {
      const client = makeClient(3, (g) => stack(g, ['pinta'], ['foto']));
      const seat = G(client).turnSeatID;
      actAs(client, seat).drink!();
      const held = G(client);

      const other = G(client).activeSeatIDs.find((id) => id !== seat)!;
      actAs(client, other).revealEvent!();
      expect(G(client)).toEqual(held);
    });

    it('rejects a reveal when no event is owed', () => {
      const client = makeClient(3);
      const before = G(client);
      actAs(client, G(client).turnSeatID).revealEvent!();
      expect(G(client)).toEqual(before);
    });

    it('auto-withdraws a player who reaches the phase drink cap (AC9)', () => {
      const client = makeClient(3);
      const cap = PHASE_RULES.tardeo.maxDrinks;
      const seat = G(client).turnSeatID;
      // The cap is only enforced once the event is turned over, so wait for a
      // settled state rather than catching the player mid-draw.
      play(client, (g, s) => (s === seat ? 'drink' : 'withdraw'), (g) =>
        (g.pendingEvent === null && g.players[seat]!.drinksThisPhase >= cap) || g.phase !== 0,
      );
      const player = G(client).players[seat]!;
      if (G(client).phase === 0) expect(player.status).not.toBe('partying');
    });

    it('puts the drink on the table before the event, then fills it in', () => {
      const client = makeClient(3, (g) => stack(g, ['pinta'], ['foto']));
      const seat = G(client).turnSeatID;
      expect(G(client).lastDraw).toBeNull();

      actAs(client, seat).drink!();
      // The drink is readable while the event is still face-down -- the whole
      // point of splitting the two.
      expect(G(client).lastDraw).toEqual({ seatID: seat, alcohol: 'pinta', event: null });

      actAs(client, seat).revealEvent!();
      expect(G(client).lastDraw).toEqual({ seatID: seat, alcohol: 'pinta', event: 'foto' });
    });

    it('keeps lastDraw on the draw that caused a ronda, not its knock-on drinks', () => {
      const client = makeClient(3, (g) => stack(g, ['pinta', 'cana', 'cana', 'cana'], ['ronda']));
      const seat = G(client).turnSeatID;
      drinkAndReveal(client, seat);

      expect(G(client).lastDraw).toEqual({ seatID: seat, alcohol: 'pinta', event: 'ronda' });
      // The ronda really did pour for everyone; it just did not claim the reveal.
      for (const id of G(client).activeSeatIDs) {
        expect(G(client).players[id]!.drinksThisPhase).toBeGreaterThan(0);
      }
    });

    it('clears lastDraw when a new phase opens', () => {
      const client = makeClient(3);
      play(client, alwaysDrink, (g) => g.lastDraw !== null);
      expect(G(client).lastDraw).not.toBeNull();

      const phase = G(client).phase;
      play(client, alwaysWithdraw, (g) => g.phase !== phase);
      expect(G(client).lastDraw).toBeNull();
    });

    it('counts a drink nobody chose toward the phase total', () => {
      const client = makeClient(3, (g) => stack(g, ['cana', 'cana'], ['chupitoCasa']));
      const seat = G(client).turnSeatID;
      drinkAndReveal(client, seat);
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
      // The extra draw owes its event like any other, but resolving it must not
      // hand the turn on -- the player still has their own action to take.
      expect(G(client).pendingEvent).toEqual({ seatID: seat, endsTurn: false });

      actAs(client, seat).revealEvent!();
      expect(G(client).turnSeatID).toBe(seat); // the extra turn did not consume it

      drinkAndReveal(client, seat);
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

    const SEEDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];

    /**
     * Plays seat 0 over a limit of 0 on each seed and returns what happened.
     *
     * A d20 rather than the default d6: drinking each venue's minimum against
     * a limit of zero lands around 15 over, which a d6 can never beat, so on
     * the standard die every run would die and a test needing both outcomes
     * would silently only ever prove one.
     */
    const VARIED_DIE = 20;

    function jumpRuns() {
      return SEEDS.map((seed) => {
        const client = makeClient(
          3,
          (g) => {
            g.limit = 0;
            g.settings = { ...g.settings, balconyDie: VARIED_DIE };
          },
          seed,
        );
        play(client, drinkToMinimum('0'), (g) => g.day !== 0 || g.finished);
        return { client, jump: G(client).jumps.find((j) => j.seatID === '0') };
      }).filter((run) => run.jump !== undefined);
    }

    /**
     * The core rule, and a better assertion than the old one: rather than
     * forcing an outcome with a probability, check that the outcome always
     * agrees with the die. A physical roll can be inspected; a 46% cannot.
     */
    it('survives exactly when the roll beats how far over you went', () => {
      const runs = jumpRuns();
      expect(runs.length).toBeGreaterThan(0);
      for (const { jump } of runs) {
        expect(jump!.survived).toBe(jump!.roll > jump!.d);
        expect(jump!.roll).toBeGreaterThanOrEqual(1);
        expect(jump!.roll).toBeLessThanOrEqual(jump!.die);
        expect(jump!.die).toBe(VARIED_DIE);
      }
    });

    it('records the die a match was actually played with', () => {
      const client = makeClient(3, (g) => { g.limit = 0; });
      play(client, drinkToMinimum('0'), (g) => g.day !== 0 || g.finished);
      const jump = G(client).jumps.find((j) => j.seatID === '0')!;
      expect(jump.die).toBe(DEFAULT_SETTINGS.balconyDie);
    });

    it('forfeits the round pool whatever the die says (AC11)', () => {
      const runs = jumpRuns();
      const outcomes = new Set(runs.map((r) => r.jump!.survived));
      // Both outcomes have to actually occur, or this proves only one branch.
      expect(outcomes.size).toBe(2);

      for (const { client, jump } of runs) {
        expect(jump!.lostVP).toBeGreaterThan(0);
        // The forfeit invariant: nothing from the round survives, so the only
        // VP a jumper can end the night with is the legend bonus.
        expect(G(client).players['0']!.bankedVP).toBe(jump!.legendVP);
        expect(G(client).players['0']!.roundVP).toBe(0);
        expect(G(client).players['0']!.items).toEqual([]);
      }
    });

    it('pays the legend bonus and resaca to a survivor, kills the rest (AC12)', () => {
      const runs = jumpRuns();

      const survivor = runs.find((r) => r.jump!.survived)!;
      expect(survivor).toBeDefined();
      expect(G(survivor.client).players['0']!.status).not.toBe('dead');
      expect(G(survivor.client).players['0']!.bankedVP).toBe(3 + survivor.jump!.d);
      expect(G(survivor.client).players['0']!.resaca).toBe(4);

      const dead = runs.find((r) => !r.jump!.survived)!;
      expect(dead).toBeDefined();
      expect(G(dead.client).players['0']!.status).toBe('dead');
      expect(dead.jump!.legendVP).toBe(0);
      expect(G(dead.client).players['0']!.resaca).toBe(0);
    });

    it('is unsurvivable once you are as far over as the die has faces', () => {
      // d >= faces means no roll can beat it -- the "no way back" zone.
      for (let d = 1; d <= 8; d++) {
        const certain = poolChance(d, { ...DEFAULT_SETTINGS, balconyDie: 6 });
        expect(certain).toBe(d >= 6 ? 0 : (6 - d) / 6);
      }
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
      drinkAndReveal(client, seat);

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
      drinkAndReveal(client, seat);
      expect(G(client).players[seat]!.status).toBe('partying');
    });

    it('charges no aguafiestas penalty to an arrested player (AC14)', () => {
      const client = makeClient(3, (g) => {
        g.players[g.turnSeatID]!.items = ['farlopa'];
        stack(g, ['cana'], ['redada']);
      });
      const seat = G(client).turnSeatID;
      drinkAndReveal(client, seat);
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
        limitShift: 999,
        saturdayMultiplier: 0,
        sundayMultiplier: 99,
      } as never);
      expect(wild.limitShift).toBe(10);
      expect(wild.saturdayMultiplier).toBe(1);
      expect(wild.sundayMultiplier).toBe(4);
    });

    it('falls back to the tuned default for a non-finite or missing value', () => {
      const broken = clampSettings({
        limitShift: Number.NaN,
        saturdayMultiplier: 'nope',
        limitRevealAt: 'brunch',
      } as never);
      expect(broken.limitShift).toBe(DEFAULT_SETTINGS.limitShift);
      expect(broken.saturdayMultiplier).toBe(DEFAULT_SETTINGS.saturdayMultiplier);
      expect(broken.limitRevealAt).toBe(DEFAULT_SETTINGS.limitRevealAt);
    });

    it('refuses a die that does not exist rather than clamping to the nearest', () => {
      // There is no d7 on the table, so it falls back to the standard die
      // instead of quietly becoming a d6-ish approximation.
      expect(clampSettings({ balconyDie: 7 } as never).balconyDie).toBe(6);
      expect(clampSettings({ balconyDie: 0 } as never).balconyDie).toBe(6);
      expect(clampSettings({ balconyDie: 20 } as never).balconyDie).toBe(20);
      expect(clampSettings({ balconyDie: 4 } as never).balconyDie).toBe(4);
    });

    // setup is called directly here rather than through Client, which takes no
    // setupData of its own -- the same reason cahoots' tests override setup.
    it('reaches setup through setupData', () => {
      const fakeRandom = { Number: () => 0.5, Shuffle: <T>(deck: T[]) => deck };
      const g = magalufGameDef.setup!(
        { ctx: { numPlayers: 3 }, random: fakeRandom } as never,
        { balconyDie: 42, limitShift: -2 } as never,
      ) as MagalufG;

      expect(g.settings.balconyDie).toBe(6); // 42 is not a die, so it falls back
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
      drinkAndReveal(client, seat);
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

  describe('round-confirm gates', () => {
    it('holds a closing venue open instead of dealing the next one (AC24)', () => {
      const client = makeClient(3);
      playToGate(client);

      const g = G(client);
      expect(g.roundConfirm).not.toBeNull();
      expect(g.pendingAdvance).toEqual({ kind: 'phase', next: 1 });
      // Still standing in the Tardeo: nothing has been dealt.
      expect(g.phase).toBe(0);
    });

    it('deals the next venue once every pending seat confirms (AC27)', () => {
      const client = makeClient(3);
      playToGate(client);
      for (const id of G(client).roundConfirm!.pendingSeatIDs) {
        actAs(client, id).confirmRoundReady!();
      }

      const g = G(client);
      expect(g.roundConfirm).toBeNull();
      expect(g.pendingAdvance).toBeNull();
      expect(g.phase).toBe(1);
      expect(g.players[g.turnSeatID]!.status).toBe('partying');
    });

    it('records the balconing rolls before opening the day gate (AC25)', () => {
      // Limit 0 makes any drink fatal, so the night is guaranteed to produce a
      // jump the gate must already be able to show.
      const client = makeClient(3, (g) => {
        g.limit = 0;
      });
      playToGate(client, (g, s) =>
        s === '0' && g.players[s]!.drinksThisPhase < 1 ? 'drink' : 'withdraw',
      );
      // Walk through the venue gates to reach the end of the night.
      let guard = 0;
      while (G(client).pendingAdvance?.kind !== 'day' && ++guard < 200) {
        const g = G(client);
        if (g.roundConfirm) {
          const waiting = g.roundConfirm.pendingSeatIDs.find(
            (id) => !g.roundConfirm!.confirmedSeatIDs.includes(id),
          );
          if (waiting) actAs(client, waiting).confirmRoundReady!();
          continue;
        }
        actAs(client, g.turnSeatID).withdraw!();
      }

      const g = G(client);
      expect(g.pendingAdvance).toEqual({ kind: 'day', next: 1 });
      expect(g.jumps.length).toBeGreaterThan(0);
      expect(g.roundConfirm).not.toBeNull();
    });

    it('does not wait on a dead seat (AC26)', () => {
      // Seat 0 alone starts the day already over a limit of 3 and cannot survive.
      const client = makeClient(3, (g) => {
        g.limit = 3;
        g.players['0']!.resaca = 9;
        g.players['0']!.intox = 9;
      });

      let guard = 0;
      while (G(client).players['0']!.status !== 'dead' && ++guard < 400) {
        const g = G(client);
        if (g.roundConfirm) {
          const waiting = g.roundConfirm.pendingSeatIDs.find(
            (id) => !g.roundConfirm!.confirmedSeatIDs.includes(id),
          );
          if (waiting === undefined) break;
          actAs(client, waiting).confirmRoundReady!();
          continue;
        }
        actAs(client, g.turnSeatID).withdraw!();
      }

      expect(G(client).players['0']!.status).toBe('dead');
      const wait = G(client).roundConfirm;
      expect(wait).not.toBeNull();
      expect(wait!.pendingSeatIDs).not.toContain('0');
      expect(wait!.pendingSeatIDs).toEqual(expect.arrayContaining(['1', '2']));

      // And the dead seat cannot confirm its way in either.
      const before = G(client);
      actAs(client, '0').confirmRoundReady!();
      expect(G(client)).toEqual(before);
    });

    it('lets the host force past a seat that has not confirmed (AC28)', () => {
      const client = makeClient(3, (g) => {
        g.hostPlayerID = '0';
      });
      playToGate(client);
      expect(G(client).phase).toBe(0);

      actAs(client, '0').forceAdvanceRound!();

      expect(G(client).roundConfirm).toBeNull();
      expect(G(client).phase).toBe(1);
    });

    it('refuses a force-advance from anyone but the host seat (AC28)', () => {
      const client = makeClient(3, (g) => {
        g.hostPlayerID = '0';
      });
      playToGate(client);
      const before = G(client);

      actAs(client, '1').forceAdvanceRound!();
      expect(G(client)).toEqual(before);
    });

    it('rejects every party move while a wait is open (AC29)', () => {
      const client = makeClient(3, (g) => {
        g.players['0']!.items = ['kebab'];
      });
      playToGate(client);
      const before = G(client);

      for (const seat of G(client).activeSeatIDs) {
        actAs(client, seat).drink!();
        actAs(client, seat).withdraw!();
        actAs(client, seat).useItem!('kebab');
      }
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

  describe('gameover standings (AC35)', () => {
    it('returns every seat best-first, marking the dead', () => {
      // A limit of 0 makes every drink a jump, guaranteeing casualties to mark.
      const client = makeClient(3, (g) => {
        g.limit = 0;
      });
      play(client, (g, s) => (s === '0' && g.players[s]!.drinksThisPhase < 1 ? 'drink' : 'withdraw'));

      const g = G(client);
      const gameover = client.store.getState().ctx.gameover as {
        standings: { playerID: string; score: number; labelKey?: string }[];
      };

      expect(gameover.standings).toHaveLength(g.activeSeatIDs.length);
      expect(gameover.standings.map((s) => s.playerID).sort()).toEqual([...g.activeSeatIDs].sort());

      const scores = gameover.standings.map((s) => s.score);
      expect([...scores].sort((a, b) => b - a)).toEqual(scores);

      for (const row of gameover.standings) {
        expect(row.score).toBe(g.players[row.playerID]!.bankedVP);
        const isDead = g.players[row.playerID]!.status === 'dead';
        expect(row.labelKey).toBe(isDead ? 'magaluf.status.dead' : undefined);
      }
      expect(gameover.standings.some((s) => s.labelKey === 'magaluf.status.dead')).toBe(true);
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
