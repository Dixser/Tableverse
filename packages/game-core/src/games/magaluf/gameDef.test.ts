import { describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';

import type { EventId, EventOption, ItemId, PhaseId } from './cards.js';
import { ALCOHOL, eventOptions, PHASE_IDS } from './cards.js';
import { COMEBACK, LIMIT_DECK, PHASE_RULES } from './constants.js';
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
    store: {
      getState: () => {
        G: MagalufG;
        ctx: { currentPlayer: string; phase?: string; gameover?: unknown };
      };
    };
  };
}

type TestClient = ReturnType<typeof makeClient>;

function G(client: TestClient): MagalufG {
  return client.store.getState().G;
}

/**
 * How a driver answers a face-up choice card. Branch 0 unless told otherwise,
 * so a stacked deck still produces a fixed weekend.
 */
type OptionPolicy = (options: readonly EventOption[]) => number;

const firstBranch: OptionPolicy = () => 0;

/**
 * Takes a branch that inflicts no hangover, so a test measuring resaca from
 * one specific source is not quietly picking some up on the way there.
 */
const duckResaca: OptionPolicy = (options) => {
  const index = options.findIndex((option) => (option.resaca ?? 0) <= 0);
  return index === -1 ? 0 : index;
};

/**
 * Answers a face-up choice card.
 *
 * Every driver below needs this: a choice blocks every other move, so a policy
 * that only knows drink/withdraw would spin until its guard ran out. Tests that
 * care which branch was taken call `chooseEventOption` themselves.
 */
function answerChoice(client: TestClient, policy: OptionPolicy): void {
  const pending = G(client).pendingChoice;
  if (!pending) return;
  actAs(client, pending.seatID).chooseEventOption!(policy(eventOptions(pending.eventId) ?? []));
}

/**
 * Plays out the balcony the table is stood at, one beat per call.
 *
 * Every driver needs this for the same reason they need `answerChoice`: while
 * `G.balcony` is set the only moves in the game belong to the jumper, so a
 * driver that only knows drink/withdraw would spin until its guard ran out.
 * Returns false when there is no balcony to play.
 */
function watchBalcony(client: TestClient): boolean {
  const g = G(client);
  if (!g.balcony) return false;
  const jumper = g.jumps[g.balcony.index]!.seatID;
  if (g.balcony.revealed) actAs(client, jumper).advanceJump!();
  else actAs(client, jumper).revealJump!();
  return true;
}

/**
 * Drives the table until `stop` is true, or the weekend ends.
 *
 * Clears round-confirm gates and balconies automatically. Tests that care about
 * either drive them by hand instead; everything else wants to look through them
 * at the game underneath.
 */
function play(
  client: TestClient,
  choose: (g: MagalufG, seat: string) => 'drink' | 'withdraw',
  stop: (g: MagalufG) => boolean = () => false,
  pickOption: OptionPolicy = firstBranch,
): void {
  for (let guard = 0; guard < 6000; guard++) {
    const g = G(client);
    if (g.finished || stop(g)) return;

    if (g.pendingEvent) {
      actAs(client, g.pendingEvent.seatID).revealEvent!();
      continue;
    }

    if (g.pendingChoice) {
      answerChoice(client, pickOption);
      continue;
    }

    if (watchBalcony(client)) continue;

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

/**
 * Drinks and immediately turns the event over, the way the old single move did.
 *
 * Stops at a choice card rather than answering it — a test that stacked one
 * wants to inspect or answer the question itself.
 */
function drinkAndReveal(client: TestClient, seat: string): void {
  actAs(client, seat).drink!();
  const pending = G(client).pendingEvent;
  if (pending) actAs(client, pending.seatID).revealEvent!();
}

/**
 * Plays until a gate opens, leaving it un-confirmed for the test to inspect.
 *
 * Walks any balcony on the way, because a night with a jump in it does not open
 * its gate until the table has watched the last die.
 */
function playToGate(
  client: TestClient,
  choose: (g: MagalufG, seat: string) => 'drink' | 'withdraw' = alwaysWithdraw,
  pickOption: OptionPolicy = firstBranch,
): void {
  for (let guard = 0; guard < 6000; guard++) {
    const g = G(client);
    if (g.finished || g.roundConfirm) return;
    if (g.pendingEvent) {
      actAs(client, g.pendingEvent.seatID).revealEvent!();
      continue;
    }
    if (g.pendingChoice) {
      answerChoice(client, pickOption);
      continue;
    }
    if (watchBalcony(client)) continue;
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

/**
 * True when something other than a balcony jump put resaca on this seat.
 *
 * With `duckResaca` driving the choice cards, the only source left in an
 * item-free run is an Ambulancia that picked this seat as the drunkest — the
 * one hangover in the game nobody gets a say in.
 */
function tookResacaFromACard(client: TestClient, seatID: string): boolean {
  return G(client).log.some(
    (e) => e.key === 'magaluf.log.ambulance' && e.params?.actor === seatID,
  );
}

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

  });

  describe('who opens the next one', () => {
    /** The seat that opened Friday's Tardeo under `seed`. */
    const firstOpener = (seed: string) => G(makeClient(3, () => {}, seed)).turnSeatID;

    it('draws the very first opener by lot rather than seating seat 0 (AC)', () => {
      const seeds = Array.from({ length: 40 }, (_, i) => `opener-seed-${i}`);
      const openers = new Set(seeds.map(firstOpener));

      // Every seat can open the weekend, and no seat is the default.
      expect(openers).toEqual(new Set(['0', '1', '2']));
    });

    it('draws the same opener every time a seed is replayed', () => {
      // Not a nicety: the server rebuilds a match by replaying its move log, so
      // an opener drawn outside the seeded Rng would desynchronise on resume.
      expect(firstOpener('replay-me')).toBe(firstOpener('replay-me'));
    });

    it('leaves the first opener at the head of the lap it anchors', () => {
      const client = makeClient(3, () => {}, 'opener-seed-3');
      const g = G(client);
      expect(g.activeSeatIDs[g.roundAnchor]).toBe(g.turnSeatID);
      expect(client.store.getState().ctx.currentPlayer).toBe(g.turnSeatID);
    });

    /** The seat the venue rule says should lead off, read from a live gate. */
    function expectedVenueOpener(g: MagalufG): string {
      const alive = g.activeSeatIDs.filter((id) => g.players[id]!.status !== 'dead');
      const lastOut = alive.reduce((a, b) =>
        g.players[b]!.withdrawSeq > g.players[a]!.withdrawSeq ? b : a,
      );
      const seats = g.activeSeatIDs;
      for (let step = 1; step <= seats.length; step++) {
        const id = seats[(seats.indexOf(lastOut) + step) % seats.length]!;
        if (g.players[id]!.status !== 'dead') return id;
      }
      throw new Error('nobody alive to open');
    }

    it('opens the next venue on the seat after whoever was last out', () => {
      // Seat 1 hangs on for a second drink, so the table does not simply file
      // out in turn order and the last one standing is somebody in the middle.
      const client = makeClient(3);
      playToGate(client, (g, s) =>
        s === '1' && g.players[s]!.drinksThisPhase < 2 ? 'drink' : 'withdraw',
      );

      const atGate = G(client);
      expect(atGate.pendingAdvance?.kind).toBe('phase');
      const expected = expectedVenueOpener(atGate);

      for (const id of atGate.roundConfirm!.pendingSeatIDs) actAs(client, id).confirmRoundReady!();
      expect(G(client).turnSeatID).toBe(expected);
      // And the lap boundary moved with it, or Ultimo en Pie would be measured
      // against a seat that is not the one who started the round.
      expect(G(client).activeSeatIDs[G(client).roundAnchor]).toBe(expected);
    });

    /**
     * The rule's blind spot, pinned deliberately rather than left to be
     * rediscovered in a playtest: when everybody leaves on their own turn the
     * last one out is always the seat *before* the opener, so the lead comes
     * straight back round to where it started and never moves all weekend.
     */
    it('leaves the lead where it is when the whole table walks out in turn order', () => {
      const client = makeClient(3);
      const openers = new Set<string>([G(client).turnSeatID]);
      let phase = G(client).phase;
      play(client, alwaysWithdraw, (g) => {
        if (g.phase !== phase) {
          phase = g.phase;
          openers.add(g.turnSeatID);
        }
        return g.day > 0;
      });
      expect([...openers]).toEqual(['0']);
    });

    it('steps over a dead seat, but never over a merely withdrawn one', () => {
      // Seat 0 starts Friday nine over a limit of 3 and cannot roll out of it.
      // Seat 2 is handed a lead it can never be furthest behind on, so Saturday
      // opens on seat 1 and the walk from the last out has to cross the corpse.
      const client = makeClient(3, (g) => {
        g.limit = 3;
        g.players['0']!.resaca = 9;
        g.players['0']!.intox = 9;
        g.players['2']!.bankedVP = 50;
      });

      play(client, alwaysWithdraw, (g) => g.day === 1 && g.roundConfirm === null);
      const saturday = G(client);
      expect(saturday.players['0']!.status).toBe('dead');
      expect(saturday.turnSeatID).toBe('1');

      // Seat 1 leads, seat 2 follows it out, so the seat after the last out is
      // the dead one -- and every living seat is 'withdrawn' at that moment.
      playToGate(client, alwaysWithdraw);
      const atGate = G(client);
      expect(atGate.players['2']!.withdrawSeq).toBeGreaterThan(atGate.players['1']!.withdrawSeq);

      for (const id of atGate.roundConfirm!.pendingSeatIDs) actAs(client, id).confirmRoundReady!();
      expect(G(client).turnSeatID).toBe('1');
    });

    it('hands a new day to the seat furthest behind on banked points', () => {
      const client = makeClient(3, (g) => {
        g.players['0']!.bankedVP = 40;
        g.players['1']!.bankedVP = 10;
        g.players['2']!.bankedVP = 25;
      });
      // Nobody drinks, so the only thing that moves a score is the identical
      // aguafiestas penalty each seat takes -- the order survives the night.
      play(client, alwaysWithdraw, (g) => g.day === 1 && g.roundConfirm === null);

      expect(G(client).day).toBe(1);
      expect(G(client).turnSeatID).toBe('1');
    });

    it('breaks a tie on banked points by seat order', () => {
      const client = makeClient(3);
      play(client, alwaysWithdraw, (g) => g.day === 1 && g.roundConfirm === null);

      const g = G(client);
      const scores = g.activeSeatIDs.map((id) => g.players[id]!.bankedVP);
      expect(new Set(scores).size).toBe(1);
      expect(g.turnSeatID).toBe('0');
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
      // The cap is only enforced once the event is done with -- turned over,
      // and answered if it asked anything -- so wait for a settled state rather
      // than catching the player mid-draw.
      play(client, (g, s) => (s === seat ? 'drink' : 'withdraw'), (g) =>
        (g.pendingEvent === null &&
          g.pendingChoice === null &&
          g.players[seat]!.drinksThisPhase >= cap) ||
        g.phase !== 0,
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
      expect(G(client).lastDraw).toEqual({
        seatID: seat,
        alcohol: 'pinta',
        event: null,
        outcome: null,
        pours: [],
      });

      actAs(client, seat).revealEvent!();
      // Foto is just its own numbers, so there is no worked-out result to pin.
      expect(G(client).lastDraw).toEqual({
        seatID: seat,
        alcohol: 'pinta',
        event: 'foto',
        outcome: null,
        pours: [],
      });
    });

    it('keeps lastDraw on the draw that caused a ronda, not its knock-on drinks', () => {
      const client = makeClient(3, (g) => stack(g, ['pinta', 'cana', 'cana', 'cana'], ['ronda']));
      const seat = G(client).turnSeatID;
      drinkAndReveal(client, seat);

      // The reveal still belongs to the pinta the drawer chose -- the round is
      // dealt out beside it rather than overwriting it.
      const draw = G(client).lastDraw!;
      expect(draw.seatID).toBe(seat);
      expect(draw.alcohol).toBe('pinta');
      expect(draw.event).toBe('ronda');

      // And the round itself is face-up: one card per seat still partying, with
      // the numbers each of them actually took.
      expect(draw.pours).toEqual(
        G(client).activeSeatIDs.map((id) => ({ seatID: id, alcohol: 'cana', intox: 1, vp: 1 })),
      );
      for (const id of G(client).activeSeatIDs) {
        expect(G(client).players[id]!.drinksThisPhase).toBeGreaterThan(0);
      }
    });

    it('deals a chupito de la casa face-up too, on the drawer alone', () => {
      const client = makeClient(3, (g) => stack(g, ['pinta', 'cana'], ['chupitoCasa']));
      const seat = G(client).turnSeatID;
      drinkAndReveal(client, seat);

      expect(G(client).lastDraw?.pours).toEqual([
        { seatID: seat, alcohol: 'cana', intox: 1, vp: 1 },
      ]);
    });

    it('records what each seat really took, not what the card prints', () => {
      // An armed Pastis doubles the next drink's points, and a drink somebody
      // bought you is still a drink. The tile has to say 2, not the printed 1.
      const client = makeClient(3, (g) => {
        stack(g, ['pinta', 'cana', 'cana', 'cana'], ['ronda']);
        g.players[g.activeSeatIDs.find((id) => id !== g.turnSeatID)!]!.pastisArmed = true;
      });
      const seat = G(client).turnSeatID;
      const armed = G(client).activeSeatIDs.find((id) => id !== seat)!;
      drinkAndReveal(client, seat);

      const pours = G(client).lastDraw!.pours;
      expect(pours.find((p) => p.seatID === armed)).toEqual({
        seatID: armed,
        alcohol: 'cana',
        intox: 1,
        vp: 2,
      });
      expect(pours.find((p) => p.seatID === seat)?.vp).toBe(1);
    });

    it('clears the round with the draw it belonged to', () => {
      const client = makeClient(3, (g) => stack(g, ['pinta', 'cana', 'cana', 'cana'], ['ronda']));
      const seat = G(client).turnSeatID;
      drinkAndReveal(client, seat);
      expect(G(client).lastDraw!.pours.length).toBeGreaterThan(0);

      // The next ordinary draw puts its own card on the table; the round that
      // came with the previous one must not still be sitting under it.
      actAs(client, G(client).turnSeatID).drink!();
      expect(G(client).lastDraw!.pours).toEqual([]);
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

    it('pastis doubles exactly one drink and costs no intoxication (AC3)', () => {
      const client = makeClient(3, (g) => {
        g.players[g.turnSeatID]!.items = ['pastis'];
        stack(g, ['cana', 'cana'], ['nada', 'nada']);
      });
      const seat = G(client).turnSeatID;
      const before = G(client).players[seat]!.intox;

      actAs(client, seat).useItem!('pastis');
      // Arming it is free. What a Pastis costs is carrying contraband past the
      // Cacheo and the Redada, not capacity — the design's only pure upside
      // card, paid for entirely in police risk.
      expect(G(client).players[seat]!.intox).toBe(before);
      expect(G(client).players[seat]!.pastisArmed).toBe(true);

      drinkAndReveal(client, seat);
      const player = G(client).players[seat]!;
      expect(player.roundVP).toBe(ALCOHOL.cana!.vp * 2);
      expect(player.intox).toBe(before + ALCOHOL.cana!.intox);
      // Spent on that drink and no other: the second cana pays face value.
      expect(player.pastisArmed).toBe(false);
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

  /**
   * Último en Pie used to be settled at endPhase and go to whoever had the
   * highest withdrawSeq. That paid for seat position: a table that all leaves
   * at the drink minimum leaves in turn order, so the last seat collected for
   * free every single time. The bonus is now paid the moment somebody *opens a
   * round* alone, which has to be bought with one more solo turn.
   */
  describe('ultimo en pie (round-start rule)', () => {
    // Cheap alcohol and inert events, so these tests measure the rule rather
    // than whatever the shuffle handed out.
    const quiet = (g: MagalufG) =>
      stack(g, Array<string>(16).fill('cana'), Array<EventId>(16).fill('nada'));

    const BONUS = PHASE_RULES.tardeo.lastStandingBonus;

    it('does not pay a survivor who is only alone mid-lap', () => {
      const client = makeClient(3, quiet);
      const solo = G(client).turnSeatID; // seat 0 opens the Tardeo on day 0

      drinkAndReveal(client, solo); // 1 drink, below the minimum of 2
      actAs(client, '1').withdraw!();
      actAs(client, '2').withdraw!();

      // Alone, and it is their turn -- but the round turned over while they
      // were still one drink short, so there is nothing to pay yet.
      expect(G(client).turnSeatID).toBe(solo);
      expect(G(client).lastStandingAwarded).toBe(false);
      expect(G(client).players[solo]!.roundVP).toBe(ALCOHOL.cana!.vp);
    });

    it('pays once the solo seat opens a round having met the minimum', () => {
      const client = makeClient(3, quiet);
      const solo = G(client).turnSeatID;

      drinkAndReveal(client, solo);
      actAs(client, '1').withdraw!();
      actAs(client, '2').withdraw!();
      // The extra solo turn is the price of the bonus.
      drinkAndReveal(client, solo);

      expect(G(client).lastStandingAwarded).toBe(true);
      expect(G(client).players[solo]!.roundVP).toBe(ALCOHOL.cana!.vp * 2 + BONUS);
    });

    it('pays it only once, however long the survivor keeps drinking', () => {
      const client = makeClient(3, quiet);
      const solo = G(client).turnSeatID;

      drinkAndReveal(client, solo);
      actAs(client, '1').withdraw!();
      actAs(client, '2').withdraw!();
      drinkAndReveal(client, solo);
      const afterBonus = G(client).players[solo]!.roundVP;

      // The phase carries on -- a solo player may keep pushing their luck.
      drinkAndReveal(client, solo);
      expect(G(client).players[solo]!.drinksThisPhase).toBe(3);
      expect(G(client).players[solo]!.roundVP).toBe(afterBonus + ALCOHOL.cana!.vp);
    });

    /**
     * The case the old rule got wrong in the other direction: nobody was ever
     * alone, so nobody has earned anything. A Ronda tips every seat over the
     * drink cap at once and closing time empties the venue in one sweep.
     */
    it('pays nobody when the whole table hits closing time together', () => {
      const client = makeClient(3, (g) => {
        quiet(g);
        g.eventDeck = ['ronda'];
        for (const id of g.activeSeatIDs) {
          g.players[id]!.drinksThisPhase = PHASE_RULES.tardeo.maxDrinks - 1;
        }
      });
      const opener = G(client).turnSeatID;

      drinkAndReveal(client, opener);

      // The venue emptied in one sweep, so it is now holding a gate open on
      // the next one rather than having advanced already.
      expect(G(client).pendingAdvance).toEqual({ kind: 'phase', next: 1 });
      expect(G(client).lastStandingAwarded).toBe(false);
      for (const id of G(client).activeSeatIDs) {
        expect(G(client).log.some((e) => e.key === 'magaluf.log.ultimoEnPie' && e.params?.actor === id))
          .toBe(false);
      }
    });

    /**
     * Worth stating outright, because it is the behaviour change: a table that
     * all drinks the minimum and leaves in turn order pays nobody. The last
     * seat never opens a round alone -- it becomes alone mid-lap and then goes
     * home, which is exactly the free bonus the old rule handed out.
     */
    it('pays nobody when everyone leaves at the minimum in turn order', () => {
      const client = makeClient(3, quiet);
      playToGate(client, moderate);
      expect(G(client).lastStandingAwarded).toBe(false);
      for (const id of G(client).activeSeatIDs) {
        expect(G(client).players[id]!.roundVP).toBe(ALCOHOL.cana!.vp * PHASE_RULES.tardeo.minDrinks);
      }
    });

    it('resets the award for each new venue', () => {
      const client = makeClient(3, quiet);
      const solo = G(client).turnSeatID;

      drinkAndReveal(client, solo);
      actAs(client, '1').withdraw!();
      actAs(client, '2').withdraw!();
      drinkAndReveal(client, solo);
      expect(G(client).lastStandingAwarded).toBe(true);

      play(client, alwaysWithdraw, (g) => g.phase === 1 && g.roundConfirm === null);
      expect(G(client).phase).toBe(1);
      expect(G(client).lastStandingAwarded).toBe(false);
    });
  });

  /**
   * Choice cards. The engine contract is the same one `revealEvent` already
   * established one step earlier: the drawer owes an answer, and until it comes
   * nobody has any other move.
   */
  /**
   * Four cards are printed as a rule rather than a number — "+1 VP per drink",
   * "whoever drank most". Each has to report what the rule actually came to,
   * in the feed and on the card, or the table is doing the arithmetic in their
   * heads to find out what just happened.
   */
  describe('worked-out event results', () => {
    /** Draws a stacked event and returns the outcome pinned to the card. */
    function drawEventCard(eventId: EventId, setup: (g: MagalufG) => void = () => {}) {
      const client = makeClient(3, (g) => {
        stack(g, Array<string>(8).fill('cana'), [eventId]);
        setup(g);
      });
      const seat = G(client).turnSeatID;
      drinkAndReveal(client, seat);
      return { client, seat, outcome: G(client).lastDraw?.outcome };
    }

    const lastEntry = (client: TestClient, key: string) =>
      [...G(client).log].reverse().find((e) => e.key === `magaluf.log.${key}`);

    it('reports what Barra libre actually paid', () => {
      const { client, seat, outcome } = drawEventCard('barraLibre', (g) => {
        g.players[g.turnSeatID]!.drinksThisPhase = 2;
      });
      // 2 already had, plus the drink that turned the card over.
      expect(G(client).players[seat]!.drinksThisPhase).toBe(3);
      expect(outcome).toEqual({
        key: 'magaluf.log.barraLibreResult',
        params: { actor: seat, vp: 3, n: 3 },
      });
      expect(lastEntry(client, 'barraLibreResult')?.params).toEqual(outcome!.params);
    });

    it('says when Karaoke doubled, and when it did not', () => {
      const doubled = drawEventCard('karaoke', (g) => {
        g.players[g.turnSeatID]!.intox = 30;
      });
      expect(doubled.outcome?.key).toBe('magaluf.log.karaokeDrunkest');
      expect(doubled.outcome?.params?.vp).toBe(4);

      const plain = drawEventCard('karaoke', (g) => {
        // Somebody else is further gone, so no double.
        for (const id of g.activeSeatIDs) g.players[id]!.intox = id === g.turnSeatID ? 0 : 30;
      });
      expect(plain.outcome?.key).toBe('magaluf.log.karaokeResult');
      expect(plain.outcome?.params?.vp).toBe(2);
    });

    it('doubles Karaoke for a drawer who is level with the worst at the table', () => {
      // Seat 0 opens and its cana lands it exactly on seat 2's total. Deciding
      // that by seat number is the rule Rey del guiri was reworked to remove.
      const tied = drawEventCard('karaoke', (g) => {
        g.players['0']!.intox = 6;
        g.players['2']!.intox = 7;
      });
      expect(tied.outcome?.key).toBe('magaluf.log.karaokeDrunkest');
      expect(tied.outcome?.params?.vp).toBe(4);
    });

    it('does not double Karaoke for a sober table', () => {
      // Nobody can be the drunkest when nobody is drunk. Agua is the only card
      // that leaves the drawer on zero after turning an event over.
      const sober = drawEventCard('karaoke', (g) => {
        stack(g, ['agua'], ['karaoke']);
      });
      expect(sober.outcome?.key).toBe('magaluf.log.karaokeResult');
    });

    it('hands the whip-round to the seat with the fewest points, into the bank', () => {
      const { client, outcome } = drawEventCard('colecta', (g) => {
        g.players['0']!.bankedVP = 40;
        g.players['1']!.bankedVP = 12;
        g.players['2']!.bankedVP = 30;
      });

      expect(outcome?.key).toBe('magaluf.log.colectaResult');
      expect(outcome?.params?.winners).toBe('1');
      // Banked, not put at risk: the point is a floor, not another gamble.
      expect(G(client).players['1']!.bankedVP).toBe(18);
      expect(G(client).players['1']!.roundVP).toBe(0);
    });

    it('ranks on banked plus what is still on the table', () => {
      const { outcome } = drawEventCard('colecta', (g) => {
        // Seat 1 has banked least but is having the night of their life; seat 2
        // has more in the bank and nothing riding on tonight. Reading the bank
        // alone would hand the collection to the player who is really ahead.
        g.players['0']!.bankedVP = 30;
        g.players['1']!.bankedVP = 5;
        g.players['1']!.roundVP = 40;
        g.players['2']!.bankedVP = 20;
      });
      expect(outcome?.params?.winners).toBe('2');
    });

    it('reaches a player sitting the phase out in a cell', () => {
      // The whole reason these cards bank directly. `resolveNight` throws away
      // an arrested player's round pool -- asserted over in *the police* -- so
      // the ordinary VP path reaches everybody except the seat having the worst
      // weekend at the table, which is the seat this card is for.
      const { client, outcome } = drawEventCard('colecta', (g) => {
        g.players['0']!.bankedVP = 40;
        g.players['1']!.status = 'arrested';
        g.players['1']!.bankedVP = 5;
        g.players['2']!.bankedVP = 30;
      });
      expect(outcome?.params?.winners).toBe('1');
      expect(G(client).players['1']!.bankedVP).toBe(11);
    });

    it('passes over a player whose weekend is already over', () => {
      const { client, outcome } = drawEventCard('colecta', (g) => {
        // Bottom of the table by a mile, and past helping.
        g.players['0']!.bankedVP = 40;
        g.players['1']!.status = 'dead';
        g.players['1']!.bankedVP = 0;
        g.players['2']!.bankedVP = 20;
      });
      expect(outcome?.params?.winners).toBe('2');
      expect(G(client).players['1']!.bankedVP).toBe(0);
    });

    it('pays every seat tied at the bottom', () => {
      const { client, outcome } = drawEventCard('colecta', (g) => {
        g.players['0']!.bankedVP = 40;
        g.players['1']!.bankedVP = 20;
        g.players['2']!.bankedVP = 20;
      });
      expect(outcome?.params?.winners).toBe('1,2');
      expect(G(client).players['1']!.bankedVP).toBe(26);
      expect(G(client).players['2']!.bankedVP).toBe(26);
    });

    it('hands back half the gap on a Remontada, and shows its working', () => {
      const { client, outcome } = drawEventCard('remontada', (g) => {
        g.players['0']!.bankedVP = 19; // the cana on the way in takes it to 20
        g.players['1']!.bankedVP = 6;
        g.players['2']!.bankedVP = 14;
      });

      // Leader 20, last place 6, so the gap is 14 and half of it is 7.
      expect(outcome?.key).toBe('magaluf.log.remontadaResult');
      expect(outcome?.params?.winners).toBe('1');
      expect(outcome?.params?.n).toBe(14);
      expect(outcome?.params?.vp).toBe(7);
      expect(G(client).players['1']!.bankedVP).toBe(13);

      // The standings are the card's arithmetic, so the feed gets them whole.
      expect(lastEntry(client, 'remontadaRanking')?.params).toEqual({
        ranking: '0,2,1',
        rankingValues: '20,14,6',
      });
    });

    it('caps the Remontada rather than handing the weekend back', () => {
      const { outcome } = drawEventCard('remontada', (g) => {
        g.players['0']!.bankedVP = 99;
      });
      // A gap of 100 would otherwise pay 50, which is a third of a winning score.
      expect(outcome?.params?.vp).toBe(COMEBACK.maxVP);
    });

    it('says so rather than paying nothing when the table is level', () => {
      const { outcome } = drawEventCard('remontada', (g) => {
        for (const id of g.activeSeatIDs) g.players[id]!.bankedVP = 10;
      });
      // Seat 0's own drink puts it one clear, and half of one gap rounds to
      // nothing. A card that silently paid zero would read as a bug.
      expect(outcome?.key).toBe('magaluf.log.remontadaNobody');
    });

    it('records who the ambulance took and how far gone they were', () => {
      const { client, outcome } = drawEventCard('ambulancia', (g) => {
        g.players['1']!.intox = 40;
      });
      expect(outcome?.key).toBe('magaluf.log.ambulanciaResult');
      expect(outcome?.params?.actor).toBe('1');
      // The number that got them picked, not the one they leave with.
      expect(outcome?.params?.n).toBe(40);
      expect(G(client).players['1']!.intox).toBe(35);
    });

    it('leaves the outcome empty for a card that is just its own numbers', () => {
      const { outcome } = drawEventCard('insolacion');
      expect(outcome).toBeNull();
    });

    it('clears the outcome with the rest of the table at a new venue', () => {
      const client = makeClient(3, (g) => stack(g, Array<string>(8).fill('cana'), ['barraLibre']));
      drinkAndReveal(client, G(client).turnSeatID);
      expect(G(client).lastDraw?.outcome).not.toBeNull();

      play(client, alwaysWithdraw, (g) => g.phase === 1 && g.roundConfirm === null);
      expect(G(client).lastDraw).toBeNull();
    });
  });

  describe('event cards with options', () => {
    /** Draws a stacked choice card and stops with the question on the table. */
    function drawChoice(eventId: EventId, setup: (g: MagalufG) => void = () => {}) {
      const client = makeClient(3, (g) => {
        stack(g, Array<string>(8).fill('cana'), [eventId]);
        setup(g);
      });
      const seat = G(client).turnSeatID;
      drinkAndReveal(client, seat);
      return { client, seat };
    }

    it('parks the card face-up instead of resolving it', () => {
      const { client, seat } = drawChoice('vomitona');
      expect(G(client).pendingChoice).toEqual({ seatID: seat, eventId: 'vomitona', endsTurn: true });
      // Face-up, so the table can read what is being decided.
      expect(G(client).lastDraw?.event).toBe('vomitona');
      expect(G(client).pendingEvent).toBeNull();
    });

    it('blocks every other move until the branch is picked', () => {
      const { client, seat } = drawChoice('vomitona');
      const before = JSON.stringify(G(client).players[seat]);

      actAs(client, seat).drink!();
      actAs(client, seat).withdraw!();
      actAs(client, seat).useItem!('kebab');

      expect(JSON.stringify(G(client).players[seat])).toBe(before);
      expect(G(client).pendingChoice).not.toBeNull();
    });

    it('refuses an answer from the wrong seat or an impossible index', () => {
      const { client, seat } = drawChoice('vomitona');
      const other = G(client).activeSeatIDs.find((id) => id !== seat)!;

      actAs(client, other).chooseEventOption!(0);
      expect(G(client).pendingChoice).not.toBeNull();

      for (const bad of [-1, 2, 1.5]) {
        actAs(client, seat).chooseEventOption!(bad);
        expect(G(client).pendingChoice).not.toBeNull();
      }
    });

    it('applies the branch the player picked, and only that one (vomitona)', () => {
      const vomit = drawChoice('vomitona', (g) => {
        g.players[g.turnSeatID]!.intox = 10;
      });
      actAs(vomit.client, vomit.seat).chooseEventOption!(0);
      const puked = G(vomit.client).players[vomit.seat]!;
      // 10 + 1 for the drink, then -4 relief. Resaca is tomorrow's problem.
      expect(puked.intox).toBe(10 + ALCOHOL.cana!.intox - 4);
      expect(puked.resaca).toBe(3);

      const hold = drawChoice('vomitona', (g) => {
        g.players[g.turnSeatID]!.intox = 10;
      });
      actAs(hold.client, hold.seat).chooseEventOption!(1);
      const held = G(hold.client).players[hold.seat]!;
      expect(held.intox).toBe(10 + ALCOHOL.cana!.intox + 2);
      expect(held.resaca).toBe(0);
    });

    it('lets Resacón sleep hangover off, and floors it at zero', () => {
      const { client, seat } = drawChoice('resacon', (g) => {
        // One point of resaca against a branch that removes two: the floor is
        // the whole reason addResaca exists rather than a bare `-=`.
        g.players[g.turnSeatID]!.resaca = 1;
      });
      const before = G(client).players[seat]!.roundVP;
      actAs(client, seat).chooseEventOption!(0);

      expect(G(client).players[seat]!.resaca).toBe(0);
      expect(G(client).players[seat]!.roundVP).toBe(before - 3);
    });

    it('walks a Saltar la cola player out of the venue with the VP in hand', () => {
      const { client, seat } = drawChoice('saltarLaCola');
      const before = G(client).players[seat]!.roundVP;
      actAs(client, seat).chooseEventOption!(0);

      const player = G(client).players[seat]!;
      expect(player.status).toBe('withdrawn');
      // Kept, not banked: it rides on tonight's limit check like everything else.
      expect(player.roundVP).toBe(before + 7);
      // Chosen, but not a withdrawal -- no Aguafiestas on top.
      expect(G(client).log.some((e) => e.key === 'magaluf.log.aguafiestas')).toBe(false);
    });

    it('pours Doble o nada’s extra drink at double VP without drawing a second event', () => {
      const { client, seat } = drawChoice('dobleONada');
      const eventsLeft = G(client).eventDeck.length;
      actAs(client, seat).chooseEventOption!(0);

      const player = G(client).players[seat]!;
      expect(player.drinksThisPhase).toBe(2);
      // The drink that drew the card at face value, the extra one doubled.
      expect(player.roundVP).toBe(ALCOHOL.cana!.vp + ALCOHOL.cana!.vp * 2);
      expect(player.intox).toBe(ALCOHOL.cana!.intox * 2);
      // An event that drew an event would chain without a fixed point.
      expect(G(client).eventDeck.length).toBe(eventsLeft);
      expect(G(client).pendingEvent).toBeNull();
      expect(player.pastisArmed).toBe(false);
    });

    it('ends the turn when the extra drink hits closing time on a free action', () => {
      // A Farlopa's extra draw normally leaves the player their own action.
      // Doble o nada on top of it can still pour them past the cap, and
      // somebody at closing time has nothing left to spend that action on.
      const client = makeClient(3, (g) => {
        stack(g, Array<string>(8).fill('cana'), ['dobleONada']);
        const seat = g.turnSeatID;
        g.players[seat]!.items = ['farlopa'];
        g.players[seat]!.drinksThisPhase = PHASE_RULES.tardeo.maxDrinks - 2;
      });
      const seat = G(client).turnSeatID;

      actAs(client, seat).useItem!('farlopa');
      actAs(client, seat).revealEvent!();
      expect(G(client).pendingChoice?.endsTurn).toBe(false);

      actAs(client, seat).chooseEventOption!(0);
      expect(G(client).players[seat]!.drinksThisPhase).toBeGreaterThanOrEqual(
        PHASE_RULES.tardeo.maxDrinks,
      );
      expect(G(client).players[seat]!.status).toBe('withdrawn');
    });

    it('hands the turn straight on when the branch does nothing', () => {
      const { client, seat } = drawChoice('dobleONada');
      actAs(client, seat).chooseEventOption!(1); // pasar
      expect(G(client).turnSeatID).not.toBe(seat);
      expect(G(client).pendingChoice).toBeNull();
    });

    it('hands the Camello’s contraband over only when the player takes it', () => {
      const took = drawChoice('camelloPorro');
      actAs(took.client, took.seat).chooseEventOption!(0);
      expect(G(took.client).players[took.seat]!.items).toEqual(['porro']);

      const left = drawChoice('camelloPorro');
      actAs(left.client, left.seat).chooseEventOption!(1);
      expect(G(left.client).players[left.seat]!.items).toEqual([]);
      // Nothing else either: declining is a plain pass, not a consolation.
      expect(G(left.client).players[left.seat]!.roundVP).toBe(ALCOHOL.cana!.vp);
    });

    it('offers each Camello its own item', () => {
      for (const [eventId, item] of [
        ['camelloPastis', 'pastis'],
        ['camelloFarlopa', 'farlopa'],
      ] as const) {
        const { client, seat } = drawChoice(eventId);
        actAs(client, seat).chooseEventOption!(0);
        expect(G(client).players[seat]!.items).toEqual([item]);
      }
    });

    it('logs the card and the branch, in that order', () => {
      const { client, seat } = drawChoice('vomitona');
      actAs(client, seat).chooseEventOption!(0);

      const keys = G(client).log.map((e) => e.key);
      const drew = keys.lastIndexOf('magaluf.log.event');
      const chose = keys.lastIndexOf('magaluf.log.choseOption');
      expect(drew).toBeGreaterThan(-1);
      expect(chose).toBeGreaterThan(drew);
      expect(G(client).log[chose]!.params?.descriptionKey).toBe('magaluf.eventOption.vomitar');
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
    /**
     * A limit pinned at setup is how these tests put a player over it without
     * mutating a frozen G mid-match.
     *
     * Zero for the tests that only need *a* jump. The two that need both
     * outcomes to occur use JUMPABLE_LIMIT instead: drinking each venue's
     * minimum lands somewhere in the mid-twenties, and against a limit of zero
     * that is past what even a d20 can beat, so every run would die and a test
     * needing both branches would silently only ever prove one.
     */
    const JUMPABLE_LIMIT = 14;

    const drinkToMinimum = (seat: string) => (g: MagalufG, s: string) =>
      s === seat && g.players[s]!.drinksThisPhase < phaseMinimum(g) ? 'drink' : 'withdraw';

    const SEEDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];

    /**
     * A d20 rather than the default d6: even against JUMPABLE_LIMIT the
     * overshoot runs into double figures, which a d6 can never beat.
     */
    const VARIED_DIE = 20;

    /** Plays seat 0 over the limit on each seed and returns what happened. */
    function jumpRuns() {
      return SEEDS.map((seed) => {
        const client = makeClient(
          3,
          (g) => {
            g.limit = JUMPABLE_LIMIT;
            g.settings = { ...g.settings, balconyDie: VARIED_DIE };
          },
          seed,
        );
        // duckResaca so the resaca assertions below measure the jump alone:
        // now that the Vomitona is a choice card, a driver that always took
        // branch 0 would arrive at the balcony already hungover.
        play(client, drinkToMinimum('0'), (g) => g.day !== 0 || g.finished, duckResaca);
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

    it('forfeits the round pool only when the roll fails (AC11)', () => {
      const runs = jumpRuns();
      const outcomes = new Set(runs.map((r) => r.jump!.survived));
      // Both outcomes have to actually occur, or this proves only one branch.
      expect(outcomes.size).toBe(2);

      for (const { client, jump } of runs) {
        const player = G(client).players['0']!;
        // The pool was on the table in every run, so each branch is asserting
        // against a real stake rather than against zero.
        expect(jump!.poolVP).toBeGreaterThan(0);
        expect(player.roundVP).toBe(0);

        if (jump!.survived) {
          // The night survives with the player: banked at the day's rate, with
          // the legend bonus on top and the items still in their pocket.
          expect(jump!.lostVP).toBe(0);
          expect(jump!.bankedVP).toBe(jump!.poolVP); // Friday is x1
          expect(player.bankedVP).toBe(jump!.bankedVP + jump!.legendVP);
        } else {
          expect(jump!.lostVP).toBe(jump!.poolVP);
          expect(jump!.bankedVP).toBe(0);
          expect(player.bankedVP).toBe(0);
          expect(player.items).toEqual([]);
        }
      }
    });

    it('leaves a survivor holding the items they went up with', () => {
      // A Kebab rather than contraband: the police cannot take it, so the only
      // thing in the game that can empty this pocket is a Chungo card drawn by
      // seat 0 -- which the filter below excludes rather than hopes against.
      const runs = SEEDS.map((seed) => {
        const client = makeClient(
          3,
          (g) => {
            g.limit = JUMPABLE_LIMIT;
            g.settings = { ...g.settings, balconyDie: VARIED_DIE };
            g.players['0']!.items = ['kebab'];
          },
          seed,
        );
        play(client, drinkToMinimum('0'), (g) => g.day !== 0 || g.finished, duckResaca);
        return { client, jump: G(client).jumps.find((j) => j.seatID === '0') };
      }).filter((run) => {
        if (run.jump === undefined) return false;
        return !G(run.client).log.some(
          (e) =>
            e.params?.actor === '0' &&
            typeof e.params?.descriptionKey === 'string' &&
            e.params.descriptionKey.startsWith('magaluf.event.chungo'),
        );
      });

      const survivors = runs.filter((r) => r.jump!.survived);
      expect(survivors.length).toBeGreaterThan(0);
      for (const { client } of survivors) {
        expect(G(client).players['0']!.items).toContain('kebab');
      }
      for (const { client } of runs.filter((r) => !r.jump!.survived)) {
        expect(G(client).players['0']!.items).toEqual([]);
      }
    });

    it('pays the legend bonus and resaca to a survivor, kills the rest (AC12)', () => {
      const runs = jumpRuns();

      // An Ambulancia can still pick seat 0 as the drunkest and hand them a
      // hangover nobody chose, which is the one resaca source a branch policy
      // cannot duck. Exclude those runs rather than assert around them.
      const survivor = runs.find((r) => r.jump!.survived && !tookResacaFromACard(r.client, '0'))!;
      expect(survivor).toBeDefined();
      expect(G(survivor.client).players['0']!.status).not.toBe('dead');
      expect(survivor.jump!.legendVP).toBe(3 + survivor.jump!.d);
      // The bonus is on top of the night, which the survivor now keeps.
      expect(G(survivor.client).players['0']!.bankedVP).toBe(
        survivor.jump!.bankedVP + 3 + survivor.jump!.d,
      );
      expect(G(survivor.client).players['0']!.resaca).toBe(4);

      const dead = runs.find((r) => !r.jump!.survived && !tookResacaFromACard(r.client, '0'))!;
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

    it('only ever arrests a player who chose to be holding', () => {
      // The playtest sequence that prompted this rule: one seat is handed a
      // joint, the next seat draws the Redada, and the first seat goes to the
      // cell for an item they were never asked about. Now the Camello asks --
      // so declining has to survive the same sequence untouched.
      function dealThenRaid(branch: 0 | 1) {
        const client = makeClient(3, (g) => {
          stack(g, Array<string>(8).fill('cana'), ['camelloPorro', 'redada']);
        });
        const dealt = G(client).turnSeatID;
        drinkAndReveal(client, dealt);
        actAs(client, dealt).chooseEventOption!(branch);

        const raider = G(client).turnSeatID;
        expect(raider).not.toBe(dealt);
        drinkAndReveal(client, raider);
        return G(client).players[dealt]!;
      }

      expect(dealThenRaid(0).status).toBe('arrested');
      expect(dealThenRaid(1).status).toBe('partying');
    });

    describe('how long the cell holds you (host setting)', () => {
      /** Raided on the way into the Tardeo, then played on to the Noche. */
      function raidThenNextVenue(arrestLasts: 'phase' | 'day') {
        const client = makeClient(3, (g) => {
          g.settings = { ...g.settings, arrestLasts };
          g.players[g.turnSeatID]!.items = ['porro'];
          stack(g, Array<string>(8).fill('cana'), ['redada']);
        });
        const seat = G(client).turnSeatID;
        drinkAndReveal(client, seat);
        expect(G(client).players[seat]!.status).toBe('arrested');

        play(client, alwaysWithdraw, (g) => g.phase === 1);
        return { client, seat };
      }

      it('keeps them in until morning by default', () => {
        const { client, seat } = raidThenNextVenue('day');
        expect(G(client).players[seat]!.status).toBe('arrested');
        expect(G(client).log.some((e) => e.key === 'magaluf.log.released')).toBe(false);
      });

      it('lets them out at the next venue when the host asks for it', () => {
        const { client, seat } = raidThenNextVenue('phase');
        const player = G(client).players[seat]!;
        expect(player.status).toBe('partying');
        // Released into a fresh venue, not into the one they were taken from.
        expect(player.drinksThisPhase).toBe(0);
        expect(
          G(client).log.some(
            (e) => e.key === 'magaluf.log.released' && e.params?.actor === seat,
          ),
        ).toBe(true);
      });

      it('puts a released player back under the night’s limit check', () => {
        // The free pass belongs to whoever is still in the cell at midnight.
        // Someone let out at eight o'clock drank the rest of the night like
        // everybody else and answers for it like everybody else.
        const client = makeClient(3, (g) => {
          g.settings = { ...g.settings, arrestLasts: 'phase' };
          g.limit = 0;
          g.players[g.turnSeatID]!.items = ['porro'];
          stack(g, Array<string>(8).fill('cana'), ['redada']);
        });
        const seat = G(client).turnSeatID;
        drinkAndReveal(client, seat);

        play(client, alwaysDrink, (g) => g.day !== 0);
        expect(G(client).jumps.some((j) => j.seatID === seat)).toBe(true);
      });
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
      expect(LIMIT_DECK).toContain(friday);
      play(client, alwaysWithdraw, (g) => g.day === 1);
      // The same deck on every day now — the weekend's arc is the multiplier.
      expect(LIMIT_DECK).toContain(G(client).limit);
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

    it('falls back to the default sentence for an unrecognised arrest scope', () => {
      expect(clampSettings({ arrestLasts: 'forever' } as never).arrestLasts).toBe(
        DEFAULT_SETTINGS.arrestLasts,
      );
      expect(clampSettings({} as never).arrestLasts).toBe('day');
      expect(clampSettings({ arrestLasts: 'phase' } as never).arrestLasts).toBe('phase');
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
      expect(LIMIT_DECK.map((n) => n - 2)).toContain(g.limit); // the deck, shifted -2
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

    it('watches the balconing rolls out before opening the day gate (AC25)', () => {
      // Limit 0 makes any drink fatal, so the night is guaranteed to produce a
      // jump the table must be walked through first.
      const client = makeClient(3, (g) => {
        g.limit = 0;
      });
      playToGate(client, (g, s) =>
        s === '0' && g.players[s]!.drinksThisPhase < 1 ? 'drink' : 'withdraw',
      );
      // Walk through the venue gates to reach the end of the night.
      let guard = 0;
      while (G(client).balcony === null && ++guard < 200) {
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

      // The night is resolved -- the rolls are recorded -- but nothing has
      // moved on: the table is stood at the balcony, not at tomorrow's gate.
      const atBalcony = G(client);
      expect(atBalcony.jumps.length).toBeGreaterThan(0);
      expect(atBalcony.balcony).toEqual({ index: 0, revealed: false });
      expect(atBalcony.roundConfirm).toBeNull();
      expect(atBalcony.pendingAdvance).toBeNull();

      for (let i = 0; i < 40 && watchBalcony(client); i++);

      const g = G(client);
      expect(g.balcony).toBeNull();
      expect(g.pendingAdvance).toEqual({ kind: 'day', next: 1 });
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
      while (
        (G(client).players['0']!.status !== 'dead' || G(client).roundConfirm === null) &&
        ++guard < 400
      ) {
        const g = G(client);
        if (watchBalcony(client)) continue;
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

  /**
   * The balcony is a shared moment or it is not a moment at all.
   *
   * It used to be per-viewer client state: each player stepped through the
   * night's jumps at their own pace, which meant anyone who clicked fast knew
   * the whole death toll while the jumpers were still deciding to look. These
   * pin the two halves of the fix -- the beat lives in G, and the buttons
   * belong to the seat on the railing.
   */
  describe('the balcony', () => {
    /**
     * Three seats, all six over a limit they cannot beat on a d6, and nobody
     * ever drinks -- so the night is three certain jumps and no event card can
     * wander in and change the count. Stops the moment the table is stood at
     * the first balcony, before anybody has looked over the railing.
     */
    function tableAtTheBalcony(host: string | null = null) {
      const client = makeClient(3, (g) => {
        g.hostPlayerID = host;
        g.limit = 3;
        for (const id of g.activeSeatIDs) {
          g.players[id]!.intox = 9;
          g.players[id]!.resaca = 9;
        }
      });
      play(client, alwaysWithdraw, (g) => g.balcony !== null);
      expect(G(client).jumps).toHaveLength(3);
      return client;
    }

    it('stands the whole table at one jump, in G rather than in each client', () => {
      const client = tableAtTheBalcony();
      const g = G(client);

      expect(g.jumps).toHaveLength(3);
      expect(g.balcony).toEqual({ index: 0, revealed: false });

      // And it is public: a reveal that playerView could strip per seat would
      // be the old bug wearing a server hat.
      for (const seat of [...g.activeSeatIDs, null]) {
        const view = magalufGameDef.playerView!({ G: g, ctx: {} as never, playerID: seat });
        expect((view as MagalufG).balcony).toEqual(g.balcony);
      }
    });

    it('lets only the jumper turn the die over (AC20)', () => {
      const client = tableAtTheBalcony();
      const jumper = G(client).jumps[0]!.seatID;
      const watcher = G(client).activeSeatIDs.find((id) => id !== jumper)!;

      const before = G(client);
      actAs(client, watcher).revealJump!();
      expect(G(client)).toEqual(before);

      actAs(client, jumper).revealJump!();
      expect(G(client).balcony).toEqual({ index: 0, revealed: true });
    });

    it('lets only the jumper move the table on to the next balcony', () => {
      const client = tableAtTheBalcony();
      const jumper = G(client).jumps[0]!.seatID;
      const watcher = G(client).activeSeatIDs.find((id) => id !== jumper)!;

      // Not even the jumper, until the die is actually face-up.
      let before = G(client);
      actAs(client, jumper).advanceJump!();
      expect(G(client)).toEqual(before);

      actAs(client, jumper).revealJump!();
      before = G(client);
      actAs(client, watcher).advanceJump!();
      expect(G(client)).toEqual(before);

      actAs(client, jumper).advanceJump!();
      expect(G(client).balcony).toEqual({ index: 1, revealed: false });
    });

    it('walks every jump of the night before the weekend can end (AC21)', () => {
      const client = tableAtTheBalcony();

      for (const index of [0, 1, 2]) {
        const g = G(client);
        expect(g.balcony?.index).toBe(index);
        // Nothing is over while anybody is still on a railing -- the gameover
        // banner must not announce a winner over the top of the die.
        expect(g.finished).toBe(false);
        expect(client.store.getState().ctx.gameover).toBeUndefined();
        watchBalcony(client); // jump
        watchBalcony(client); // continue
      }

      const g = G(client);
      expect(g.balcony).toBeNull();
      expect(g.activeSeatIDs.every((id) => g.players[id]!.status === 'dead')).toBe(true);
      expect(g.finished).toBe(true);
      expect(client.store.getState().ctx.gameover).toBeDefined();
    });

    it('refuses a skip from anyone but the host seat', () => {
      const client = tableAtTheBalcony();
      const before = G(client);

      // hostPlayerID is null in these matches, so nobody is authorized at all.
      for (const seat of before.activeSeatIDs) actAs(client, seat).skipBalcony!();
      expect(G(client)).toEqual(before);
    });

    it('lets the host drop the rest, for a jumper who has gone home', () => {
      const client = tableAtTheBalcony('0');

      actAs(client, '1').skipBalcony!();
      expect(G(client).balcony).not.toBeNull();

      actAs(client, '0').skipBalcony!();
      expect(G(client).balcony).toBeNull();
      expect(G(client).finished).toBe(true);
    });

    it('rejects every party move while the table is at a balcony', () => {
      const client = tableAtTheBalcony();
      const before = G(client);

      for (const seat of before.activeSeatIDs) {
        actAs(client, seat).drink!();
        actAs(client, seat).withdraw!();
        actAs(client, seat).confirmRoundReady!();
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
