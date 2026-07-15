import { describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';
import type { GameLogEntry } from '../../types.js';
import {
  loveletterGameDef,
  type LoveLetterG,
  type LoveLetterSetupData,
} from './gameDef.js';

/**
 * Builds a headless Client whose initial G is the real setup's output with
 * a test-chosen override layered on top -- lets individual card-effect
 * tests pin exact hands/deck contents while still going through the real
 * setup/dealNewRound path for every other field.
 *
 * Note: the FIRST turn's onBegin (drawIntoActiveHand) runs synchronously as
 * part of Client construction, before any test code executes -- seat '0'
 * has therefore already drawn once by the time the fixture is inspected, on
 * top of whatever hand this fixture pins.
 */
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

function newClient(numPlayers = 2, setupData?: LoveLetterSetupData) {
  return Client({
    game: { ...loveletterGameDef, setup: (context) => loveletterGameDef.setup!(context, setupData) },
    numPlayers,
  });
}

describe('loveletter gameDef', () => {
  describe('setup (AC1, AC6)', () => {
    it('normal edition at 2 players sets aside a facedown and 3 faceup cards', () => {
      const G = newClient(2).store.getState().G;
      expect(G.edition).toBe('normal');
      expect(G._setAsideFacedown).not.toBeNull();
      expect(G.setAsideFaceup).toHaveLength(3);
      // 21 total - 1 facedown - 3 faceup - 2 dealt (1 per seat) = 15, minus
      // 1 more for seat '0's own first-turn draw (already run by this point).
      expect(G._deck).toHaveLength(14);
      expect(G.hands['0']).toHaveLength(2);
      expect(G.hands['1']).toHaveLength(1);
    });

    it('normal edition at 3+ players sets aside only the facedown card', () => {
      const G = newClient(3).store.getState().G;
      expect(G.setAsideFaceup).toHaveLength(0);
      // 21 - 1 facedown - 3 dealt - 1 (seat '0's first-turn draw) = 16.
      expect(G._deck).toHaveLength(16);
    });

    it('classic edition deals from the 16-card deck', () => {
      const G = newClient(3, { edition: 'classic' }).store.getState().G;
      expect(G.edition).toBe('classic');
      // 16 - 1 facedown - 3 dealt - 1 (seat '0's first-turn draw) = 11.
      expect(G._deck).toHaveLength(11);
    });

    it('rejects a classic match with more than 4 players', () => {
      expect(() => newClient(5, { edition: 'classic' })).toThrow();
    });

    it('accepts a classic match at exactly 4 players', () => {
      expect(() => newClient(4, { edition: 'classic' })).not.toThrow();
    });
  });

  describe('phantom seats (roomService.startMatch always creates numPlayers=maxPlayers regardless of how many seats are actually claimed)', () => {
    it('pre-eliminates every seat not in claimedSeatIDs from setup onward', () => {
      const G = newClient(6, { claimedSeatIDs: ['0', '1'] }).store.getState().G;
      expect(G.activeSeatIDs).toEqual(['0', '1']);
      expect(G.eliminated).toEqual({
        '0': false,
        '1': false,
        '2': true,
        '3': true,
        '4': true,
        '5': true,
      });
      // Phantom seats never get dealt a hand at all.
      expect(G.hands['2']).toEqual([]);
      expect(G.hands['5']).toEqual([]);
    });

    it('the 2-player set-aside-faceup rule keys off activeSeatIDs, not the engine numPlayers', () => {
      // 6 engine seats, but only 2 real players -- still the 2-player rule.
      const G = newClient(6, { claimedSeatIDs: ['0', '1'] }).store.getState().G;
      expect(G.setAsideFaceup).toHaveLength(3);
    });

    it('classic edition\'s player cap checks claimedSeatIDs, not the engine numPlayers', () => {
      // 6 engine seats but only 3 real players -- classic's real cap (4) is satisfied.
      expect(() =>
        newClient(6, { edition: 'classic', claimedSeatIDs: ['0', '1', '2'] }),
      ).not.toThrow();
      // 6 engine seats, 5 real players -- exceeds classic's real cap.
      expect(() =>
        newClient(6, { edition: 'classic', claimedSeatIDs: ['0', '1', '2', '3', '4'] }),
      ).toThrow();
    });

    it('a self-eliminating Baron in a 2-real-player match (6 engine seats) still ends the round and awards the token -- the reported bug', () => {
      const client = clientWithFixture(
        6,
        () => ({
          hands: { '0': [3], '1': [7] },
          // '0' draws 2 (Priest) at turn start, not 0 (Spy) -- keeps this
          // fixture's forcibly-revealed-on-elimination card from
          // incidentally also triggering the (separate, pre-existing)
          // Spy-bonus token, which would muddy the roundWins assertion
          // below.
          _deck: [2],
        }),
        // '1' ends up ctx.currentPlayer once the round ends (see below) --
        // set as host so the round-confirm wait can be force-advanced
        // through with a single move, same as a real host would do to
        // skip waiting on a since-disconnected opponent.
        { claimedSeatIDs: ['0', '1'], hostPlayerID: '1' },
      );
      // '0' plays Baron; their remaining card (2) loses to '1's 7, so '0'
      // self-eliminates -- '1' is the sole remaining ACTIVE player (the 4
      // phantom seats were never in contention), so the round must end
      // immediately, not stay stuck waiting for a phantom seat's turn.
      client.moves.playCard!(0, { target: '1' });
      const roundEndedG = client.store.getState().G;
      expect(roundEndedG.roundWins).toEqual({ '0': 0, '1': 1, '2': 0, '3': 0, '4': 0, '5': 0 });
      expect(roundEndedG.log.some((e: GameLogEntry) => e.key === 'loveLetter.log.roundWinner')).toBe(true);
      // The next round doesn't deal until the round-confirm wait resolves
      // -- both real seats are pending, including the one just eliminated
      // this round (elimination resets every round; they're still a
      // participant expected to confirm, same as the winner).
      expect(roundEndedG.roundConfirm).toEqual({ pendingSeatIDs: ['0', '1'], confirmedSeatIDs: [] });
      client.moves.forceAdvanceRound!();

      // Match isn't over yet (2-player threshold is 6, not the 6-engine-
      // seat threshold of 3) -- a fresh round must have been dealt: both
      // real seats have a hand again, and neither is left "eliminated"
      // going into it -- only the 4 permanent phantom seats stay so.
      const G = client.store.getState().G;
      expect(G.hands['0']!.length).toBeGreaterThan(0);
      expect(G.hands['1']!.length).toBeGreaterThan(0);
      expect(G.eliminated).toEqual({
        '0': false,
        '1': false,
        '2': true,
        '3': true,
        '4': true,
        '5': true,
      });
      // The next round's turn goes to the winner, never to a phantom seat.
      expect(client.store.getState().ctx.currentPlayer).toBe('1');
    });

    it('playCard is rejected (board stays frozen on the just-ended round) while a round-confirm wait is pending', () => {
      const client = clientWithFixture(
        6,
        () => ({ hands: { '0': [3], '1': [7] }, _deck: [2] }),
        { claimedSeatIDs: ['0', '1'] },
      );
      client.moves.playCard!(0, { target: '1' }); // '0' self-eliminates via Baron, round ends.
      const frozenG = client.store.getState().G;
      expect(frozenG.roundConfirm).not.toBeNull();

      // playCard isn't registered as a move for the roundConfirm phase at
      // all -- boardgame.io rejects it outright, same mechanism the
      // pre-existing "playCard is rejected while a chancellorKeep decision
      // is still pending" test above already relies on.
      client.moves.playCard!(0, {});
      expect(client.store.getState().G).toEqual(frozenG);
      expect(client.store.getState().ctx.phase).toBe('roundConfirm');
    });

    it('a round that ends the match (final token) never enters the round-confirm wait at all', () => {
      const client = clientWithFixture(
        6,
        (base) => ({
          hands: { '0': [3], '1': [7] },
          _deck: [2],
          roundWins: { ...base.roundWins, '1': 5 }, // one win away from the 6-token threshold.
        }),
        { claimedSeatIDs: ['0', '1'] },
      );
      client.moves.playCard!(0, { target: '1' }); // '0' self-eliminates; '1' reaches 6 tokens.
      const G = client.store.getState().G;
      expect(G.matchWinners).toEqual(['1']);
      expect(G.roundConfirm).toBeNull();
      expect(client.store.getState().ctx.gameover).toEqual({ winner: '1' });
    });

    it("the match-winning token threshold uses the real 2-player count (6), not the engine's 6-seat threshold (3)", () => {
      const client = clientWithFixture(
        6,
        (base) => ({
          hands: { '0': [3], '1': [7] },
          _deck: [2], // see the previous test's note on avoiding the Spy-bonus quirk.
          // Already satisfies the WRONG 6-seat threshold (3) -- must not
          // matter, since '0' doesn't even win this particular round.
          roundWins: { ...base.roundWins, '0': 3 },
        }),
        { claimedSeatIDs: ['0', '1'] },
      );
      client.moves.playCard!(0, { target: '1' }); // '0' self-eliminates again; their count doesn't change.
      const G = client.store.getState().G;
      expect(G.roundWins['0']).toBe(3); // unchanged -- still below the real (6) threshold.
      expect(G.matchWinners).toBeNull(); // must not end despite already satisfying the wrong (3) threshold.
    });

    it('turn order skips every phantom seat, cycling only between the 2 real players', () => {
      const client = clientWithFixture(
        6,
        () => ({
          hands: { '0': [4], '1': [4] },
          // 3 cards -- enough for the auto first-turn draw plus one draw
          // per move below, so the deck never runs out and coincidentally
          // ends the round mid-test (a 2-card deck did, previously, which
          // this test wasn't actually trying to exercise).
          _deck: [0, 2, 9],
        }),
        { claimedSeatIDs: ['0', '1'] },
      );
      client.moves.playCard!(0, {}); // '0' plays Handmaid, no elimination.
      expect(client.store.getState().ctx.currentPlayer).toBe('1');
      client.moves.playCard!(0, {}); // '1' plays Handmaid too.
      expect(client.store.getState().ctx.currentPlayer).toBe('0');
    });
  });

  describe('card effects (AC2)', () => {
    it('Guard eliminates the target on a correct guess', () => {
      const client = clientWithFixture(2, () => ({
        hands: { '0': [1], '1': [5] },
        _deck: [0],
      }));
      client.moves.playCard!(0, { target: '1', guessRank: 5 });
      const G = client.store.getState().G;
      // 2 players -- eliminating '1' immediately ends the round (last
      // player standing), which re-deals before this returns; the token
      // award is the persisting, inspectable proof of the elimination.
      expect(G.roundWins['0']).toBe(1);
      expect(G.log.some((e: GameLogEntry) => e.key === 'loveLetter.log.guardGuess')).toBe(true);
    });

    it('Guard has no effect on an incorrect guess', () => {
      const client = clientWithFixture(2, () => ({
        hands: { '0': [1], '1': [5] },
        _deck: [0, 0],
      }));
      client.moves.playCard!(0, { target: '1', guessRank: 3 });
      const G = client.store.getState().G;
      expect(G.eliminated['1']).toBe(false);
      expect(G.playedCards['0']).toContain(1);
    });

    it('rejects naming Guard itself as the guess', () => {
      const client = clientWithFixture(2, () => ({
        hands: { '0': [1], '1': [5] },
        _deck: [0],
      }));
      const before = client.store.getState().G.hands['0']!.slice();
      client.moves.playCard!(0, { target: '1', guessRank: 1 });
      expect(client.store.getState().G.hands['0']).toEqual(before);
    });

    it('Priest privately reveals the target hand only to the acting player', () => {
      const client = clientWithFixture(2, () => ({
        hands: { '0': [2], '1': [9] },
        _deck: [0, 0],
      }));
      client.moves.playCard!(0, { target: '1' });
      const G = client.store.getState().G;
      expect(G.privateReveals['0']).toHaveLength(1);
      expect(G.privateReveals['0']![0]!.params!.opponentRank).toBe(9);
      expect(G.privateReveals['1']).toHaveLength(0);
    });

    it('Baron eliminates the lower-rank player', () => {
      const client = clientWithFixture(2, () => ({
        hands: { '0': [3], '1': [1] },
        _deck: [0],
      }));
      client.moves.playCard!(0, { target: '1' });
      const G = client.store.getState().G;
      expect(G.roundWins['0']).toBe(1); // '0' (rank 3) beat '1' (rank 1).
    });

    it('Baron eliminates the acting player when their rank is lower', () => {
      const client = clientWithFixture(2, () => ({
        hands: { '0': [3], '1': [7] },
        _deck: [0],
      }));
      client.moves.playCard!(0, { target: '1' });
      const G = client.store.getState().G;
      expect(G.roundWins['1']).toBe(1); // '1' (rank 7) beat '0' (rank 3).
    });

    it('Baron eliminates nobody on a tie', () => {
      // Baron compares the acting player's OTHER held card (their drawn
      // filler, once the Baron card itself is played) against the target's
      // -- both must be 7 here for a genuine tie.
      const client = clientWithFixture(3, () => ({
        hands: { '0': [3], '1': [7], '2': [9] },
        _deck: [0, 7],
        eliminated: { '0': false, '1': false, '2': false },
      }));
      client.moves.playCard!(0, { target: '1' });
      const G = client.store.getState().G;
      expect(G.eliminated['0']).toBe(false);
      expect(G.eliminated['1']).toBe(false);
    });

    it('Handmaid protects against targeting until the protected player draws again', () => {
      const client = clientWithFixture(3, () => ({
        hands: { '0': [4], '1': [1], '2': [5] },
        _deck: [0, 2],
        eliminated: { '0': false, '1': false, '2': false },
      }));
      client.moves.playCard!(0, {}); // '0' plays Handmaid, protected.
      // '1's turn: try to Guard-target the protected '0' -- must be rejected.
      const before = client.store.getState().G.hands['0']!.slice();
      client.moves.playCard!(0, { target: '0', guessRank: 3 });
      expect(client.store.getState().G.hands['0']).toEqual(before);
      expect(client.store.getState().G.eliminated['0']).toBe(false);
    });

    it('Handmaid: a fully-protected field lets the card fizzle with no target', () => {
      const client = clientWithFixture(2, () => ({
        hands: { '0': [1], '1': [5] },
        _deck: [0, 0],
        handmaidProtected: { '0': false, '1': true },
      }));
      client.moves.playCard!(0, {});
      const G = client.store.getState().G;
      expect(G.eliminated['1']).toBe(false);
      expect(G.playedCards['0']).toContain(1);
    });

    it('Prince forces a discard-and-redraw on another player, replacing from the deck', () => {
      const client = clientWithFixture(2, () => ({
        hands: { '0': [5], '1': [2] },
        _deck: [4, 3, 0],
      }));
      client.moves.playCard!(0, { target: '1' });
      const G = client.store.getState().G;
      expect(G.playedCards['1']).toContain(2);
      // '1' redrew a 3 from Prince's effect, then drew a 4 at their own turn start.
      expect(G.hands['1']).toEqual([3, 4]);
    });

    it('Prince: discarding the Princess eliminates the target, no redraw', () => {
      const client = clientWithFixture(2, () => ({
        hands: { '0': [5], '1': [9] },
        _deck: [3, 0],
      }));
      client.moves.playCard!(0, { target: '1' });
      const G = client.store.getState().G;
      // Eliminating '1' immediately ends the round (last player standing).
      expect(G.roundWins['0']).toBe(1);
    });

    it('Prince: an empty deck forces the facedown card into play (proven via the ensuing reveal)', () => {
      const client = clientWithFixture(2, () => ({
        hands: { '0': [5], '1': [2] },
        _deck: [3], // consumed entirely by '0's own turn-start draw.
        _setAsideFacedown: 9,
      }));
      client.moves.playCard!(0, { target: '1' });
      const G = client.store.getState().G;
      // Deck is empty for both Prince's forced redraw AND '1's own next
      // turn-start draw, so the round immediately ends via a deck-exhaustion
      // reveal. '1' only wins it if they really received the facedown 9
      // (vs. '0's own drawn 3) -- an indirect but deterministic proof.
      expect(G.roundWins['1']).toBe(1);
      expect(G.roundWins['0'] ?? 0).toBe(0);
    });

    it('Prince: targeting self discards the other held card and redraws', () => {
      const client = clientWithFixture(2, () => ({
        hands: { '0': [5], '1': [7] },
        _deck: [4, 3, 0],
      }));
      client.moves.playCard!(0, { target: '0' });
      const G = client.store.getState().G;
      expect(G.playedCards['0']).toEqual([5, 0]);
      expect(G.hands['0']).toEqual([3]);
    });

    it('King trades hands with the target', () => {
      const client = clientWithFixture(2, () => ({
        hands: { '0': [7], '1': [9] },
        _deck: [0, 0],
      }));
      client.moves.playCard!(0, { target: '1' });
      const G = client.store.getState().G;
      expect(G.hands['0']).toEqual([9]);
      // '1' received '0's other card (0), plus their own next turn-start draw.
      expect(G.hands['1']).toEqual([0, 0]);
    });

    it('Chancellor draws two into a holding area, awaiting a separate chancellorKeep move', () => {
      const client = clientWithFixture(2, () => ({
        hands: { '0': [6], '1': [9] },
        _deck: [3, 4, 0], // '0' draws 0 at turn start; 4 and 3 remain for Chancellor.
      }));
      client.moves.playCard!(0, {});
      const G = client.store.getState().G;
      // Hand is empty and the turn hasn't advanced -- '0' still owns the
      // decision, just not yet resolved.
      expect(G.hands['0']).toEqual([]);
      expect(G.chancellorDraw['0']).toEqual([0, 4, 3]);
      expect(client.store.getState().ctx.currentPlayer).toBe('0');
    });

    it('chancellorKeep resolves the draw, returns the rest to the deck bottom, and ends the turn', () => {
      const client = clientWithFixture(2, () => ({
        hands: { '0': [6], '1': [9] },
        _deck: [3, 4, 0], // '0' draws 0 at turn start; 4 and 3 remain for Chancellor.
      }));
      const deckBefore = client.store.getState().G._deck.length;
      client.moves.playCard!(0, {});
      // candidates = [0, 4, 3] (hand's filler, then the two draws); keep
      // index 0 (the filler), return indices 1 and 2 in that order.
      client.moves.chancellorKeep!(0, [1, 2]);
      const G = client.store.getState().G;
      expect(G.hands['0']).toEqual([0]);
      expect(G.chancellorDraw['0']).toEqual([]);
      // Drew 2, returned 2 (net zero), then '1's own turn-start draw takes 1.
      expect(G._deck).toHaveLength(deckBefore - 1);
      expect(G._deck).toContain(4); // the returned card that '1' didn't draw.
      expect(client.store.getState().ctx.currentPlayer).toBe('1');
    });

    it("the player's chosen returnOrder determines which returned card ends up deepest in the deck", () => {
      // candidates = [0, 4, 3]; keep index 0, return index 2 (value 3)
      // first, then index 1 (value 4) -- 3 lands at the very bottom
      // (_deck[0]), 4 just above it. '1's own turn-start draw immediately
      // pops from the END of _deck (the top), taking the 4 -- proving the
      // chosen order (not array order) determined which one sat on top.
      const client = clientWithFixture(2, () => ({
        hands: { '0': [6], '1': [9] },
        _deck: [3, 4, 0],
      }));
      client.moves.playCard!(0, {});
      client.moves.chancellorKeep!(0, [2, 1]); // return index 2 (value 3) first, then index 1 (value 4).
      const G = client.store.getState().G;
      expect(G.hands['1']).toContain(4); // '1' drew the card placed on top.
      expect(G._deck).toEqual([3]); // the other sits deepest, still undrawn.
    });

    it('chancellorKeep rejects a returnOrder that omits or duplicates a non-kept candidate index', () => {
      const client = clientWithFixture(2, () => ({
        hands: { '0': [6], '1': [9] },
        _deck: [3, 4, 0],
      }));
      client.moves.playCard!(0, {});
      const before = client.store.getState().G.chancellorDraw['0']!.slice();
      client.moves.chancellorKeep!(0, [1, 1]); // duplicates index 1, omits index 2.
      expect(client.store.getState().G.chancellorDraw['0']).toEqual(before);
    });

    it('playCard is rejected while a chancellorKeep decision is still pending', () => {
      const client = clientWithFixture(2, () => ({
        hands: { '0': [6], '1': [9] },
        _deck: [3, 4, 0],
      }));
      client.moves.playCard!(0, {});
      const before = client.store.getState().G.chancellorDraw['0']!.slice();
      client.moves.playCard!(0, {}); // no cards left in hand to play anyway; also wrong stage.
      expect(client.store.getState().G.chancellorDraw['0']).toEqual(before);
    });

    it('Chancellor with a near-empty deck only draws what is available', () => {
      const client = clientWithFixture(2, () => ({
        hands: { '0': [6], '1': [9] },
        _deck: [3, 0], // '0' draws 0 at turn start; only 3 remains for Chancellor.
      }));
      client.moves.playCard!(0, {});
      // candidates = [0, 3]; keep index 0, the sole remaining index is 1.
      client.moves.chancellorKeep!(0, [1]);
      const G = client.store.getState().G;
      expect(G.hands['0']).toEqual([0]);
      // Chancellor drew the only card (3) and returned it; '1's own turn-start
      // draw then took it right back out, leaving the deck empty.
      expect(G._deck).toEqual([]);
      expect(G.hands['1']).toEqual([9, 3]);
    });

    it('Chancellor with an empty deck keeps the only card, returns nothing', () => {
      const client = clientWithFixture(2, () => ({
        hands: { '0': [6], '1': [9] },
        _deck: [0], // consumed entirely by '0's own turn-start draw.
      }));
      client.moves.playCard!(0, {});
      // candidates = [0] (nothing drew); keep the only one, nothing returns.
      client.moves.chancellorKeep!(0, []);
      const G = client.store.getState().G;
      // Chancellor drew and returned nothing; '1's own next turn-start draw
      // then fails too (deck empty), ending the round via a reveal that '1'
      // (rank 9) wins outright over '0' (rank 0).
      expect(G.roundWins['1']).toBe(1);
      expect(G.roundWins['0'] ?? 0).toBe(0);
    });

    it('Countess has no effect when played voluntarily', () => {
      const client = clientWithFixture(2, () => ({
        hands: { '0': [8], '1': [9] },
        _deck: [0, 2],
      }));
      client.moves.playCard!(0, {});
      const G = client.store.getState().G;
      expect(G.eliminated['0']).toBe(false);
      expect(G.playedCards['0']).toContain(8);
    });

    it('Countess forced-play rule rejects playing the Prince/King alongside it', () => {
      const client = clientWithFixture(2, () => ({
        hands: { '0': [8], '1': [9] },
        _deck: [5], // '0' draws Prince(5), now holds [8, 5].
      }));
      const before = client.store.getState().G.hands['0']!.slice();
      client.moves.playCard!(1, {}); // attempt to play the Prince instead of the Countess.
      expect(client.store.getState().G.hands['0']).toEqual(before);
    });

    it('Countess forced-play rule allows playing the Countess itself', () => {
      const client = clientWithFixture(2, () => ({
        hands: { '0': [8], '1': [9] },
        _deck: [0, 5],
      }));
      client.moves.playCard!(0, {}); // playing the Countess (index 0) is always legal.
      expect(client.store.getState().G.playedCards['0']).toContain(8);
    });

    it('Princess elimination on play', () => {
      const client = clientWithFixture(2, () => ({
        hands: { '0': [9], '1': [7] },
        _deck: [0],
      }));
      client.moves.playCard!(0, {});
      const G = client.store.getState().G;
      // Eliminating self immediately ends the round (last player standing).
      expect(G.roundWins['1']).toBe(1);
    });

    it('Spy has no direct effect when played', () => {
      const client = clientWithFixture(2, () => ({
        hands: { '0': [0], '1': [9] },
        _deck: [0, 2],
      }));
      client.moves.playCard!(0, {});
      const G = client.store.getState().G;
      expect(G.eliminated['0']).toBe(false);
      expect(G.playedCards['0']).toContain(0);
    });
  });

  describe('discard (house rule: any card may be discarded instead of played)', () => {
    it('discarding the Prince reveals it publicly but skips discard-and-draw entirely', () => {
      const client = clientWithFixture(2, () => ({
        hands: { '0': [5], '1': [2] },
        _deck: [4, 3, 0],
      }));
      client.moves.playCard!(0, { discard: true });
      const G = client.store.getState().G;
      expect(G.playedCards['0']).toContain(5);
      // '1' still has their original card 2 (Prince's forced discard never
      // fired) plus their own normal turn-start draw -- exactly 2 cards,
      // not the single fresh card a real discard-and-draw would leave them
      // with.
      expect(G.hands['1']).toContain(2);
      expect(G.hands['1']).toHaveLength(2);
      expect(G.log.some((e: GameLogEntry) => e.key === 'loveLetter.log.cardDiscarded')).toBe(true);
      expect(client.store.getState().ctx.currentPlayer).toBe('1'); // turn still ended normally.
    });

    it('a discard is rejected if a target is supplied -- nothing to aim it at', () => {
      const client = clientWithFixture(2, () => ({
        hands: { '0': [5], '1': [2] },
        _deck: [4, 3, 0],
      }));
      const before = client.store.getState().G.hands['0']!.slice();
      client.moves.playCard!(0, { discard: true, target: '1' });
      expect(client.store.getState().G.hands['0']).toEqual(before);
    });

    it('discarding the Princess still eliminates the player (her own card text, not a resolved effect)', () => {
      const client = clientWithFixture(2, () => ({
        hands: { '0': [9], '1': [7] },
        _deck: [0],
      }));
      client.moves.playCard!(0, { discard: true });
      const G = client.store.getState().G;
      // Eliminating self immediately ends the round (last player standing).
      expect(G.roundWins['1']).toBe(1);
    });

    it('discarding the Chancellor skips the draw-two-keep-one entirely -- no chancellorChoice stage opens', () => {
      const client = clientWithFixture(2, () => ({
        hands: { '0': [6], '1': [9] },
        _deck: [3, 4, 0],
      }));
      const deckBefore = client.store.getState().G._deck.length;
      client.moves.playCard!(0, { discard: true });
      const G = client.store.getState().G;
      expect(G.chancellorDraw['0']).toEqual([]); // never populated -- no draw happened.
      // Only '1's own normal turn-start draw consumes a card -- Chancellor's
      // real draw-2 never fired (that would have taken 2 more).
      expect(G._deck).toHaveLength(deckBefore - 1);
      expect(client.store.getState().ctx.currentPlayer).toBe('1'); // turn ended immediately, no pending stage.
    });

    it("the Countess forced-play rule still blocks discarding the King/Prince while holding the Countess", () => {
      const client = clientWithFixture(2, () => ({
        hands: { '0': [8], '1': [9] },
        _deck: [5], // '0' draws Prince(5), now holds [8, 5].
      }));
      const before = client.store.getState().G.hands['0']!.slice();
      client.moves.playCard!(1, { discard: true }); // attempt to discard the Prince instead of the Countess.
      expect(client.store.getState().G.hands['0']).toEqual(before);
    });
  });

  describe('round end (AC3)', () => {
    it('last player standing ends the round immediately, awarding a token', () => {
      const client = clientWithFixture(2, () => ({
        hands: { '0': [3], '1': [1] },
        _deck: [0],
      }));
      client.moves.playCard!(0, { target: '1' }); // Baron: '0' (3) beats '1' (1).
      const G = client.store.getState().G;
      expect(G.roundWins['0']).toBe(1);
      expect(G.log.some((e: GameLogEntry) => e.key === 'loveLetter.log.roundWinner')).toBe(true);
    });

    it('deck exhaustion reveals hands and the highest rank wins', () => {
      const client = clientWithFixture(2, () => ({
        hands: { '0': [4], '1': [7] },
        _deck: [0], // '0's own turn-start draw empties the deck.
      }));
      client.moves.playCard!(0, {}); // Handmaid -- no elimination, round continues to '1'.
      const G = client.store.getState().G;
      // '1' (rank 7) beat '0' (rank 0, the drawn filler) on the reveal.
      expect(G.roundWins['1']).toBe(1);
      expect(G.roundWins['0'] ?? 0).toBe(0);
    });

    it('a tied deck-exhaustion reveal splits the token among every tied winner', () => {
      const client = clientWithFixture(3, () => ({
        hands: { '0': [4], '1': [7], '2': [7] },
        _deck: [0],
        eliminated: { '0': false, '1': false, '2': false },
      }));
      client.moves.playCard!(0, {}); // '0' plays Handmaid; deck already empty for '1's draw.
      const G = client.store.getState().G;
      expect(G.roundWins['1']).toBe(1);
      expect(G.roundWins['2']).toBe(1);
      expect(G.roundWins['0'] ?? 0).toBe(0);
    });
  });

  describe('turn order (AC4)', () => {
    it('skips an eliminated player and resumes normal order once they clear', () => {
      const client = clientWithFixture(3, () => ({
        hands: { '0': [1], '1': [9], '2': [7] },
        _deck: [0, 2],
        eliminated: { '0': false, '1': false, '2': false },
      }));
      // '0' eliminates '1' with a correct Guard guess; turn should skip to '2'.
      client.moves.playCard!(0, { target: '1', guessRank: 9 });
      const G = client.store.getState().G;
      expect(G.eliminated['1']).toBe(true);
      expect(client.store.getState().ctx.currentPlayer).toBe('2');
    });
  });

  describe('match end (AC5)', () => {
    it('ends the match the instant a player reaches the token threshold', () => {
      const client = clientWithFixture(2, (base) => ({
        hands: { '0': [3], '1': [1] },
        _deck: [0],
        roundWins: { ...base.roundWins, '0': 5 }, // one round away from the 2p threshold (6).
      }));
      client.moves.playCard!(0, { target: '1' }); // '0' wins this round too -> 6 tokens.
      const G = client.store.getState().G;
      expect(G.matchWinners).toEqual(['0']);
      expect(client.store.getState().ctx.gameover).toEqual({ winner: '0' });
    });

    it('supports a simultaneous multi-winner match end', () => {
      const client = clientWithFixture(3, (base) => ({
        hands: { '0': [4], '1': [7], '2': [7] },
        _deck: [0],
        eliminated: { '0': false, '1': false, '2': false },
        roundWins: { ...base.roundWins, '1': 4, '2': 4 }, // one round from the 3p threshold (5).
      }));
      client.moves.playCard!(0, {}); // deck-exhaustion reveal ties '1' and '2' at rank 7.
      const G = client.store.getState().G;
      expect(new Set(G.matchWinners)).toEqual(new Set(['1', '2']));
      const gameover = client.store.getState().ctx.gameover as { winner: string[] };
      expect(new Set(gameover.winner)).toEqual(new Set(['1', '2']));
    });
  });

  describe('G.log coverage (AC7)', () => {
    it('never logs the private content of a Baron comparison or Priest view', () => {
      // A genuine tie (both compared cards are 7) -- nobody eliminated, so
      // the round survives long enough to inspect privateReveals/log.
      const client = clientWithFixture(2, () => ({
        hands: { '0': [3], '1': [7] },
        _deck: [0, 7],
      }));
      client.moves.playCard!(0, { target: '1' });
      const G = client.store.getState().G;
      const publicLogText = JSON.stringify(G.log);
      // The private reveal (opponentRank) must never appear in the public log.
      expect(publicLogText).not.toContain('"opponentRank"');
      expect(G.privateReveals['0']!.length).toBeGreaterThan(0);
    });
  });
});
