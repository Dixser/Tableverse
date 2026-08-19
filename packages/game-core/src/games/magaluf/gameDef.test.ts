import { describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';

import type { EventId, EventOption, ItemId, PhaseId } from './cards.js';
import { ALCOHOL, eventOptions, PHASE_IDS } from './cards.js';
import { COMEBACK, PHASE_RULES } from './constants.js';
import { buildLimitDeck, limitRange } from './limitScale.js';
import { HIDDEN_LIMIT, magalufGameDef, type MagalufG } from './gameDef.js';
import { magalufModule } from './index.js';
import { clampSettings, dayMultipliers, DEFAULT_SETTINGS } from './settings.js';
import { poolChance, survivesRoll } from './balconing.js';
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
      // A limit below zero puts everyone over it on the very first night. What
      // this test cannot do any more is make the landing certain: feature 041
      // gave the die's top face an automatic clear, so every jumper keeps a
      // 1-in-N escape however far over they went. The old trick here was a
      // one-faced die, which now survives every single time rather than dying
      // every single time.
      //
      // So it walks seeds instead. Deterministic -- the same seed wins on
      // every run -- just no longer certain in a single game.
      let dead: MagalufG | undefined;
      for (let i = 0; i < 40 && !dead; i++) {
        const client = makeClient(3, (g) => void (g.limit = -5), `all-dead-${i}`);
        play(client, alwaysWithdraw);
        const g = G(client);
        if (g.activeSeatIDs.every((id) => g.players[id]!.status === 'dead')) dead = g;
      }

      expect(dead).toBeDefined();
      expect(dead!.day).toBe(0);
      expect(dead!.finished).toBe(true);
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

    it('hands the first turn to the seat it drew', () => {
      // There is no lap anchor to check any more -- Cierrabares is settled off
      // a drink count at closing time, so nothing measures rounds. What still
      // has to hold is that the drawn opener is the seat the engine actually
      // gives the turn to.
      const client = makeClient(3, () => {}, 'opener-seed-3');
      const g = G(client);
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
    });

    /**
     * The rule's blind spot, pinned deliberately rather than left to be
     * rediscovered in a playtest: when everybody leaves on their own turn the
     * last one out is always the seat *before* the opener, so the lead comes
     * straight back round to where it started and never moves all weekend.
     */
    it('leaves the lead where it is when the whole table walks out in turn order', () => {
      // Within a day only. Saturday opens on whoever is furthest behind, which
      // is a different rule and has its own tests -- reading across midnight
      // used to make this assertion depend on the opener lot falling on seat 0.
      const client = makeClient(3);
      const first = G(client).turnSeatID;
      const openers = new Set<string>([first]);
      let phase = G(client).phase;
      play(client, alwaysWithdraw, (g) => {
        if (g.day === 0 && g.phase !== phase) {
          phase = g.phase;
          openers.add(g.turnSeatID);
        }
        return g.day > 0;
      });
      expect([...openers]).toEqual([first]);
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
   * **Cierrabares.** Two rules ago this was Último en Pie at `endPhase`, going
   * to the highest `withdrawSeq` — which paid for seat position, because a
   * table that all leaves at the drink minimum leaves in turn order. Feature
   * 034 moved it to whoever *opened a round* alone, which had to be bought
   * with a solo turn. Feature 041 found that rule paid for endurance measured
   * in turns rather than in drinks, and settled it invisibly off lap
   * arithmetic nobody could follow.
   *
   * It is now a drink count read at closing time: strictly the most drinks
   * takes it, ties pay nobody, and the number it turns on is the one already
   * printed on every player panel.
   */
  describe('cierrabares (closing-time rule)', () => {
    // Cheap alcohol and inert events, so these tests measure the rule rather
    // than whatever the shuffle handed out.
    const quiet = (g: MagalufG) =>
      stack(g, Array<string>(16).fill('cana'), Array<EventId>(16).fill('nada'));

    const BONUS = PHASE_RULES.tardeo.cierrabaresBonus;

    /** Opens the Tardeo with the drink counts already set, then closes it. */
    const closeWith = (counts: Record<string, number>) => {
      const client = makeClient(3, (g) => {
        quiet(g);
        for (const [id, n] of Object.entries(counts)) g.players[id]!.drinksThisPhase = n;
      });
      playToGate(client, alwaysWithdraw);
      return client;
    };

    it('pays the one player who drank strictly the most', () => {
      const client = closeWith({ '0': 4, '1': 2, '2': 2 });
      expect(G(client).cierrabares).toEqual({ seatID: '0', drinks: 4, vp: BONUS });
    });

    it('pays nobody when the top count is tied', () => {
      const client = closeWith({ '0': 4, '1': 4, '2': 2 });
      expect(G(client).cierrabares).toBeNull();
      for (const id of G(client).activeSeatIDs) {
        expect(G(client).players[id]!.roundVP).toBeLessThanOrEqual(0);
      }
    });

    /**
     * The gate the user kept, and the reason: the Aguafiestas penalty already
     * punishes leaving under the minimum, so the same act must not be punished
     * and rewarded at once. No runner-up is waiting underneath — the top count
     * is at least everyone else's, so if it misses the minimum then nobody met
     * it.
     */
    it('pays nobody when even the top drinker missed the phase minimum', () => {
      const client = closeWith({ '0': 1, '1': 0, '2': 0 });
      expect(G(client).cierrabares).toBeNull();
      // And seat 0 is out of pocket rather than up: it left under the minimum.
      expect(G(client).players['0']!.roundVP).toBe(-PHASE_RULES.tardeo.earlyExitPenalty);
    });

    it('puts the bonus at risk in the round pool rather than in the bank', () => {
      const client = closeWith({ '0': 4, '1': 2, '2': 2 });
      const winner = G(client).players['0']!;
      // Nothing was drunk for real, so the pool is the bonus and nothing else.
      expect(winner.roundVP).toBe(BONUS);
      expect(winner.bankedVP).toBe(0);
    });

    it('counts a seat that went home early just the same', () => {
      // Seat 2 out-drank the room and then left; seat 0 lingered on fewer.
      const client = closeWith({ '0': 3, '1': 2, '2': 4 });
      expect(G(client).cierrabares?.seatID).toBe('2');
    });

    it('escalates across the weekend the way the multiplier used to', () => {
      expect(PHASE_RULES.tardeo.cierrabaresBonus).toBe(3);
      expect(PHASE_RULES.noche.cierrabaresBonus).toBe(6);
      expect(PHASE_RULES.after.cierrabaresBonus).toBe(9);
    });

    it('clears the award when the next venue opens', () => {
      const client = closeWith({ '0': 4, '1': 2, '2': 2 });
      expect(G(client).cierrabares).not.toBeNull();

      for (const id of G(client).roundConfirm!.pendingSeatIDs) {
        actAs(client, id).confirmRoundReady!();
      }
      expect(G(client).phase).toBe(1);
      expect(G(client).cierrabares).toBeNull();
    });

    /**
     * The bug the new rule exposed. `startPhase` reset `drinksThisPhase` only
     * for seats that were `partying`, `continue`-ing past everybody else —
     * harmless while the bonus was a lap rule, and a free win once it became a
     * drink count. A seat that spent the last venue in a cell must not carry
     * that venue's count into this one.
     */
    it('does not let a seat carry its drink count out of a cell', () => {
      const client = makeClient(3, (g) => {
        quiet(g);
        // Seat 2 drank the Tardeo dry and was hauled off. Those drinks are
        // real and count here -- what must not happen is them counting again
        // in the venue seat 2 spends in a cell.
        g.players['2']!.status = 'arrested';
        g.players['2']!.drinksThisPhase = 4;
        g.players['0']!.drinksThisPhase = 3;
        g.players['1']!.drinksThisPhase = 2;
      });
      playToGate(client, alwaysWithdraw);
      expect(G(client).cierrabares?.seatID).toBe('2');

      for (const id of G(client).roundConfirm!.pendingSeatIDs) {
        actAs(client, id).confirmRoundReady!();
      }
      // Still arrested under the default sentence, and zeroed all the same --
      // the reset used to `continue` past every seat that was not partying.
      expect(G(client).phase).toBe(1);
      expect(G(client).players['2']!.status).toBe('arrested');
      expect(G(client).players['2']!.drinksThisPhase).toBe(0);

      // And so it cannot take the Noche, a venue it was never in.
      playToGate(client, alwaysWithdraw);
      expect(G(client).cierrabares).toBeNull();
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
        // Every test below names the other seats by number, which only ever
        // held because the opener lot happened to fall on seat 0 under the
        // default seed. These tests are about what a card works out, not about
        // who drew it, so the drawer is pinned rather than left to the shuffle.
        g.turnSeatID = '0';
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

    /**
     * Inverts the old assertion. `d >= faces` used to be arithmetically
     * certain death while the engine still made you roll for it, which read as
     * cruel dice when the outcome had been settled at the draw. The die's top
     * face now always clears, so the curve floors at one face in N instead of
     * reaching zero.
     */
    it('floors survival at one face in N however far over you went', () => {
      const d6 = { ...DEFAULT_SETTINGS, balconyDie: 6 };
      for (let d = 1; d <= 8; d++) {
        expect(poolChance(d, d6)).toBe(d >= 5 ? 1 / 6 : (6 - d) / 6);
      }
      // Never zero, however absurd the overshoot.
      expect(poolChance(99, d6)).toBeCloseTo(1 / 6);
      expect(poolChance(99, { ...DEFAULT_SETTINGS, balconyDie: 20 })).toBeCloseTo(1 / 20);
    });

    it('clears the terrace on a natural max and nowhere else in that band', () => {
      expect(survivesRoll(6, 9, 6)).toBe(true); // the top face, miles over
      expect(survivesRoll(5, 9, 6)).toBe(false);
      expect(survivesRoll(1, 9, 6)).toBe(false);
      // Below the floor the ordinary rule is doing all the work anyway.
      expect(survivesRoll(4, 3, 6)).toBe(true);
      expect(survivesRoll(3, 3, 6)).toBe(false);
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

    /**
     * The Cacheo used to cost a flat 3 VP however much you were carrying,
     * which made a stash exactly as cheap to hold as a single joint — the one
     * card that punished contraband was indifferent to how much of it there
     * was. It is a rate now: `cards.ts` still says `vp: -3`, but per item.
     */
    describe('a stop-and-search', () => {
      /** Everyone is searched, so the whole table is stood up holding. */
      const searchWith = (holdings: Record<string, ItemId[]>) => {
        const client = makeClient(3, (g) => {
          stack(g, Array<string>(8).fill('cana'), ['cacheo']);
          g.turnSeatID = '0';
          for (const [id, items] of Object.entries(holdings)) g.players[id]!.items = [...items];
        });
        drinkAndReveal(client, G(client).turnSeatID);
        return client;
      };

      it('charges three a head, not three a search', () => {
        const client = searchWith({
          '1': ['porro'],
          '2': ['porro', 'pastis', 'farlopa'],
        });
        expect(G(client).players['1']!.roundVP).toBe(-3);
        expect(G(client).players['2']!.roundVP).toBe(-9);
        // And it takes the lot, exactly as it always did.
        expect(G(client).players['2']!.items).toEqual([]);
      });

      it('counts duplicates separately', () => {
        // `items` is a plain list with no hand limit anywhere in the game, so
        // two joints really are two joints -- and six points.
        const client = searchWith({ '1': ['porro', 'porro'] });
        expect(G(client).players['1']!.roundVP).toBe(-6);
      });

      it('leaves what is legal to hold alone', () => {
        const client = searchWith({ '1': ['kebab', 'botella', 'redbull'] });
        expect(G(client).players['1']!.roundVP).toBe(0);
        expect(G(client).players['1']!.items).toEqual(['kebab', 'botella', 'redbull']);
      });

      it('reports the count and the total, or the change is invisible', () => {
        const client = searchWith({ '1': ['porro', 'farlopa'] });
        const line = [...G(client).log].reverse().find((e) => e.key === 'magaluf.log.searched');
        expect(line?.params).toMatchObject({ actor: '1', count: 2, vp: -6 });
      });
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

    it('draws a fresh limit each morning from the host band', () => {
      const client = makeClient(3);
      const deck = buildLimitDeck(limitRange(G(client).settings));
      expect(deck).toContain(G(client).limit);
      play(client, alwaysWithdraw, (g) => g.day === 1);
      // The same band on every day: the weekend's arc is Cierrabares now, not
      // a moving limit and no longer a multiplier either.
      expect(deck).toContain(G(client).limit);
    });
  });

  /**
   * The weekend used to escalate 1 / 1.5 / 2.25, which meant Friday stopped
   * being worth playing carefully and a player who lost a night early could
   * not be caught by anyone who had merely played worse on the day that
   * counted. The escalation moved to Cierrabares, which has to be won against
   * the table rather than collected by whoever is ahead when Sunday arrives.
   */
  describe('the day multiplier', () => {
    it('ships flat across all three days', () => {
      expect(dayMultipliers(DEFAULT_SETTINGS)).toEqual([1, 1, 1]);
    });

    it('banks Saturday at exactly the rate it banked Friday', () => {
      // Friday was never the question -- it was x1 under the old rule too. So
      // this has to cross midnight to assert anything: it measures what one
      // identical day is worth on either side of the boundary the old 1.5
      // sat on.
      const penalties =
        PHASE_RULES.tardeo.earlyExitPenalty +
        PHASE_RULES.noche.earlyExitPenalty +
        PHASE_RULES.after.earlyExitPenalty;

      // Nobody drinks, so nobody goes near the limit and every day is the same
      // day: three venues walked out of on nothing.
      const client = makeClient(3);
      play(client, alwaysWithdraw, (g) => g.day === 1);
      const afterFriday = Object.fromEntries(
        G(client).activeSeatIDs.map((id) => [id, G(client).players[id]!.bankedVP]),
      );

      play(client, alwaysWithdraw, (g) => g.day === 2);
      for (const id of G(client).activeSeatIDs) {
        expect(afterFriday[id]).toBe(-penalties);
        // At x1.5 Saturday would have cost -16 against Friday's -11.
        expect(G(client).players[id]!.bankedVP - afterFriday[id]!).toBe(-penalties);
      }
    });

    it('still lets a host dial the old weekend back in', () => {
      const old = clampSettings({ saturdayMultiplier: 1.5, sundayMultiplier: 2.25 } as never);
      expect(dayMultipliers(old)).toEqual([1, 1.5, 2.25]);
    });
  });

  describe('settings clamping (AC18)', () => {
    it('clamps out-of-range numbers rather than letting them reach game logic', () => {
      const wild = clampSettings({
        limitMin: 999,
        limitMax: -999,
        saturdayMultiplier: 0,
        sundayMultiplier: 99,
      } as never);
      expect(wild.limitMin).toBe(40);
      expect(wild.saturdayMultiplier).toBe(1);
      expect(wild.sundayMultiplier).toBe(4);
    });

    /**
     * The file's first cross-field rule, so it cannot ride on `clampNumber`
     * with the rest. The top end gives way, which keeps a host dragging one
     * slider past the other predictable: the number you are moving wins.
     */
    it('never lets the top of the limit band fall below the bottom', () => {
      expect(clampSettings({ limitMin: 30, limitMax: 12 } as never)).toMatchObject({
        limitMin: 30,
        limitMax: 30,
      });
      // Both ends clamped into bounds first, and only then made coherent.
      expect(clampSettings({ limitMin: 999, limitMax: 20 } as never)).toMatchObject({
        limitMin: 40,
        limitMax: 40,
      });
    });

    it('accepts a band pinned to a single value', () => {
      const fixed = clampSettings({ limitMin: 22, limitMax: 22 } as never);
      expect(buildLimitDeck(limitRange(fixed))).toEqual([22]);
    });

    it('falls back to the tuned default for a non-finite or missing value', () => {
      const broken = clampSettings({
        limitMin: Number.NaN,
        saturdayMultiplier: 'nope',
        limitRevealAt: 'brunch',
      } as never);
      expect(broken.limitMin).toBe(DEFAULT_SETTINGS.limitMin);
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
        { balconyDie: 42, limitMin: 12, limitMax: 14 } as never,
      ) as MagalufG;

      expect(g.settings.balconyDie).toBe(6); // 42 is not a die, so it falls back
      expect(g.settings.limitMin).toBe(12);
      expect(g.settings.limitMax).toBe(14);
      expect([12, 13, 14]).toContain(g.limit);
    });

    it('rejects a claimed-seat list below the player floor', () => {
      const fakeRandom = { Number: () => 0.5, Shuffle: <T>(deck: T[]) => deck };
      expect(() =>
        magalufGameDef.setup!(
          { ctx: { numPlayers: 6 }, random: fakeRandom } as never,
          { claimedSeatIDs: ['0'] } as never,
        ),
      ).toThrow(/at least 2/);
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
     * Three seats, all six over the limit, and nobody ever drinks -- so the
     * night is three certain *jumps* and no event card can wander in and
     * change the count. (Three certain deaths is what it used to be. A d of 6
     * on a d6 is now survivable on the top face, which none of these tests
     * depend on: they are about the walk, not the landing.) Stops the moment
     * the table is stood at the first balcony, before anybody has looked over
     * the railing.
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

    /**
     * The whole night's dice are cast in `resolveNight`, before the first
     * balcony renders — so the log had already narrated every outcome while
     * the table was still being walked through them one at a time. Anyone
     * glancing at the chat knew who was dead before the jumper had turned
     * their own die over, which made the overlay ceremony over a spoiler.
     */
    describe('what the log gives away', () => {
      const JUMP_KEYS = ['magaluf.log.piscina', 'magaluf.log.cemento', 'magaluf.log.survived'];
      const jumpLines = (client: TestClient) =>
        G(client).log.filter((e) => JUMP_KEYS.includes(e.key));

      it('says nothing about a jump the table has not been walked past yet', () => {
        const client = tableAtTheBalcony();
        // Three dice already rolled, three outcomes already in G.jumps.
        expect(G(client).jumps).toHaveLength(3);
        expect(jumpLines(client)).toEqual([]);

        // Not even once the jumper has turned their own die face-up: the
        // overlay is showing it, and the feed catches up as the table moves on.
        const jumper = G(client).jumps[0]!.seatID;
        actAs(client, jumper).revealJump!();
        expect(jumpLines(client)).toEqual([]);
      });

      it('writes each jump once, in order, as the table steps past it', () => {
        const client = tableAtTheBalcony();
        const jumps = [...G(client).jumps];

        const seen: number[] = [];
        for (let guard = 0; guard < 20 && G(client).balcony; guard++) {
          watchBalcony(client);
          seen.push(jumpLines(client).length);
        }

        expect(G(client).balcony).toBeNull();
        // Monotonic: the feed only ever gains lines, never re-narrates.
        expect(seen).toEqual([...seen].sort((a, b) => a - b));

        // Exactly one outcome line per jump -- piscina pairs with a survived
        // line, so a survivor contributes two and a death one.
        for (const jump of jumps) {
          const mine = jumpLines(client).filter((e) => e.params?.actor === jump.seatID);
          expect(mine.map((e) => e.key)).toEqual(
            jump.survived
              ? ['magaluf.log.piscina', 'magaluf.log.survived']
              : ['magaluf.log.cemento'],
          );
        }
      });

      it('still records the jumps the host skipped past', () => {
        // The escape hatch drops the rest of the night in one go. Losing the
        // record with it would be worse than the spoiler this change fixes.
        const client = tableAtTheBalcony('0');
        expect(jumpLines(client)).toEqual([]);

        actAs(client, '0').skipBalcony!();
        expect(G(client).balcony).toBeNull();
        for (const jump of G(client).jumps) {
          expect(jumpLines(client).some((e) => e.params?.actor === jump.seatID)).toBe(true);
        }
      });
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
    /** Every alcohol card the current phase deals, deck plus discard. */
    function alcoholTotal(g: MagalufG): number {
      const counts = PHASE_RULES[PHASE_IDS[g.phase] as PhaseId].alcohol;
      return Object.values(counts).reduce((sum, n) => sum + n, 0);
    }

    it('never needs a mid-phase reshuffle at the top of the tuned range', () => {
      // 6, not maxPlayers: the decks are sized against the tuned table and this
      // is the assertion that keeps them that way. Ten seats is a playtest
      // setting that deliberately outdraws them -- see the test below.
      const client = makeClient(6);
      let reshuffled = false;
      play(client, alwaysDrink, (g) => {
        // A reshuffle is the only way the discard can shrink while a phase runs.
        if (g.alcoholDeck.length === 0 && g.alcoholDiscard.length === 0) reshuffled = true;
        return false;
      });
      expect(reshuffled).toBe(false);
      expect(G(client).finished).toBe(true);
    });

    it('reshuffles the discard and plays on when a deck runs out at maxPlayers', () => {
      const client = makeClient(magalufModule.maxPlayers);
      play(client, alwaysDrink, (g) => {
        // No card is ever lost or duplicated: every draw moves one card from
        // the deck to the discard, and a reshuffle moves the whole discard back.
        expect(g.alcoholDeck.length + g.alcoholDiscard.length).toBe(alcoholTotal(g));
        return false;
      });

      const g = G(client);
      // The whole point of the test: ten seats drink past a 34-card Tardeo deck,
      // and the weekend still reaches Monday rather than deadlocking on an
      // empty deck.
      expect(g.log.some((e) => e.key === 'magaluf.log.reshuffledAlcohol')).toBe(true);
      expect(g.finished).toBe(true);
    });

    it('plays a whole weekend at minPlayers', () => {
      // Two seats is structurally soft rather than broken -- see index.ts. This
      // asserts only that nothing in the engine needs a third player: no rule
      // here targets "somebody else", so a two-hander must still reach Monday.
      const client = makeClient(magalufModule.minPlayers);
      play(client, alwaysDrink);
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
