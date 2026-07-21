import { describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';
import type { GameLogEntry } from '../../types.js';
import { regicideGameDef, type RegicideG, type RegicideSetupData } from './gameDef.js';
import type { Card, FaceCard, Suit } from './deck.js';

// --- Fixture helpers -------------------------------------------------------

const num = (suit: Suit, rank: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10): Card => ({
  id: `${suit}${rank}`,
  kind: 'number',
  suit,
  rank,
});
const ac = (suit: Suit): Card => ({ id: `${suit}AC`, kind: 'companion', suit });
const face = (suit: Suit, rank: FaceCard['rank']): FaceCard => ({
  id: `${suit}${rank}`,
  kind: 'face',
  suit,
  rank,
});
const jester = (n: 1 | 2 = 1): Card => ({ id: `Jester${n}`, kind: 'jester' });

/** Distinct filler number cards, only their count/sum matters to the tests using them. */
function fillerCards(count: number, suit: Suit = 'H'): Card[] {
  const ranks: (2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10)[] = [2, 3, 4, 5, 6, 7, 8, 9, 10];
  const cards: Card[] = [];
  const suits: Suit[] = ['S', 'H', 'D', 'C'];
  let i = 0;
  while (cards.length < count) {
    const s = suits[i % suits.length]!;
    const r = ranks[Math.floor(i / suits.length) % ranks.length]!;
    cards.push({ id: `filler-${s}${r}-${i}`, kind: 'number', suit: s, rank: r });
    i++;
  }
  void suit;
  return cards;
}

/**
 * Builds a headless Client whose initial G is the real setup's output with a
 * test-chosen override layered on top -- same pattern as Love Letter's own
 * gameDef.test.ts, lets individual tests pin exact hands/decks/counters
 * while every other field still goes through the real setup path.
 *
 * Note: combat's turn.onBegin (checkStuckLoss) runs synchronously as part
 * of Client construction, before any test code executes -- a fixture that
 * deliberately sets up a stuck-loss scenario will already show
 * G.matchResult === 'lost' by the time the fixture is inspected.
 */
function clientWithFixture(
  numPlayers: number,
  fixture: (base: RegicideG) => Partial<RegicideG>,
  setupData?: RegicideSetupData,
) {
  return Client({
    game: {
      ...regicideGameDef,
      setup: (context) => {
        const base = regicideGameDef.setup!(context, setupData) as RegicideG;
        return { ...base, ...fixture(base) };
      },
    },
    numPlayers,
  });
}

const twoPlayerBase: Partial<RegicideG> = {
  nextTurnStartSeatID: '0',
  activeSeatIDs: ['0', '1'],
  currentEnemy: face('H', 'J'), // attack 10, health 20 -- not spades/clubs/diamonds, so those suits are never immune here
  damageDealt: 0,
  spadeShieldTotal: 0,
  enemyImmunityCancelled: false,
  discardPile: [],
  cardsInPlay: [],
  pendingDefense: null,
  pendingEnemyDisposal: null,
  lastActionWasYield: { '0': false, '1': false },
};

describe('regicide gameDef', () => {
  describe('setup', () => {
    it('Tavern deck: correct composition and hand sizes at 2/3/4 players', () => {
      for (const [count, jesters, maxHand] of [
        [2, 0, 7],
        [3, 1, 6],
        [4, 2, 5],
      ] as const) {
        const G = Client({ game: regicideGameDef, numPlayers: count }).store.getState().G;
        for (const id of Array.from({ length: count }, (_, i) => String(i))) {
          expect(G.hands[id]).toHaveLength(maxHand);
        }
        const dealt = count * maxHand;
        const totalTavern = 36 + 4 + jesters;
        expect(G._tavernDeck).toHaveLength(totalTavern - dealt);
      }
    });

    it('Castle deck: first enemy is a Jack, and the remaining stack reveals Jacks, then Queens, then Kings', () => {
      const G = Client({ game: regicideGameDef, numPlayers: 2 }).store.getState().G;
      expect(G.currentEnemy!.rank).toBe('J');
      expect(G._castleDeck).toHaveLength(11);
      // pop() (end of array) is "top" (next to reveal) throughout this codebase's convention.
      const revealOrder = [...G._castleDeck].reverse().map((c) => c.rank);
      expect(revealOrder).toEqual(['J', 'J', 'J', 'Q', 'Q', 'Q', 'Q', 'K', 'K', 'K', 'K']);
    });

    it('picks a random starting player among activeSeatIDs (via boardgame.io random, not Math.random)', () => {
      const G = Client({ game: regicideGameDef, numPlayers: 3 }).store.getState().G;
      expect(['0', '1', '2']).toContain(G.nextTurnStartSeatID);
    });

    it('rejects a setup with fewer than 2 or more than 4 real (claimed) players', () => {
      expect(() => Client({ game: regicideGameDef, numPlayers: 4, matchID: 'a' }).moves).not.toThrow();
      expect(() =>
        Client({
          game: { ...regicideGameDef, setup: (ctx) => regicideGameDef.setup!(ctx, { claimedSeatIDs: ['0'] }) },
          numPlayers: 4,
        }),
      ).toThrow();
      expect(() =>
        Client({
          game: {
            ...regicideGameDef,
            setup: (ctx) =>
              regicideGameDef.setup!(ctx, { claimedSeatIDs: ['0', '1', '2', '3', '4'] }),
          },
          numPlayers: 4,
        }),
      ).toThrow();
    });
  });

  describe('single-card and combo suit resolution (AC2, AC3, AC5)', () => {
    it('a single Diamonds card resolves only Diamonds, once, at its own value', () => {
      const client = clientWithFixture(2, () => ({
        ...twoPlayerBase,
        hands: { '0': [num('D', 7)], '1': [] },
        _tavernDeck: fillerCards(10),
        spadeShieldTotal: 10, // enemy attack 10, not immune to spades -> effective shield 10 -> Step 4 required 0
      }));
      client.moves.playCards!(['D7']);
      const G = client.store.getState().G;
      expect(G.damageDealt).toBe(7);
      expect(G.hands['0']!.length + G.hands['1']!.length).toBe(7); // all drawn, deck had 10
      expect(G._tavernDeck).toHaveLength(3);
      // required Step 4 was 0 -> turn already ended.
      expect(client.store.getState().ctx.currentPlayer).toBe('1');
    });

    it('Clubs doubles Step 3 damage when not immune', () => {
      const client = clientWithFixture(2, () => ({
        ...twoPlayerBase,
        hands: { '0': [num('C', 6)], '1': [] },
        spadeShieldTotal: 10,
      }));
      client.moves.playCards!(['C6']);
      expect(client.store.getState().G.damageDealt).toBe(12);
    });

    it('Clubs does NOT double when the enemy is immune (its own suit)', () => {
      const client = clientWithFixture(2, () => ({
        ...twoPlayerBase,
        currentEnemy: face('C', 'J'),
        hands: { '0': [num('C', 6)], '1': [] },
        spadeShieldTotal: 10,
      }));
      client.moves.playCards!(['C6']);
      // Spades not immune here (enemy is Clubs), so the preset 10 shield still zeroes Step 4.
      expect(client.store.getState().G.damageDealt).toBe(6);
    });

    it('a same-rank 3-card combo (sum <= 10) resolves every present suit once each, at the total', () => {
      const client = clientWithFixture(2, () => ({
        ...twoPlayerBase,
        hands: { '0': [num('S', 3), num('D', 3), num('C', 3)], '1': [] },
        _tavernDeck: fillerCards(10),
        spadeShieldTotal: 0,
      }));
      client.moves.playCards!(['S3', 'D3', 'C3']);
      const G = client.store.getState().G;
      // total attack 9: Clubs doubles -> 18 damage; Diamonds draws 9; Spades shield += 9.
      expect(G.damageDealt).toBe(18);
      expect(G.spadeShieldTotal).toBe(9);
      expect(G.hands['0']!.length + G.hands['1']!.length).toBe(9);
    });

    it('rejects an illegal combo (mismatched ranks) without mutating G', () => {
      const client = clientWithFixture(2, () => ({
        ...twoPlayerBase,
        hands: { '0': [num('S', 3), num('D', 4)], '1': [] },
      }));
      const before = client.store.getState().G;
      client.moves.playCards!(['S3', 'D4']);
      const after = client.store.getState().G;
      expect(after.hands['0']).toEqual(before.hands['0']);
      expect(after.damageDealt).toBe(0);
    });

    it('an Animal Companion alone resolves its own suit at value 1', () => {
      const client = clientWithFixture(2, () => ({
        ...twoPlayerBase,
        hands: { '0': [ac('D')], '1': [] },
        _tavernDeck: fillerCards(5),
        spadeShieldTotal: 10,
      }));
      client.moves.playCards!(['DAC']);
      const G = client.store.getState().G;
      expect(G.damageDealt).toBe(1);
      expect(G.hands['0']!.length + G.hands['1']!.length).toBe(1);
    });

    it('an Animal Companion paired with a same-suit card applies that suit once, at the combined total', () => {
      const client = clientWithFixture(2, () => ({
        ...twoPlayerBase,
        hands: { '0': [ac('D'), num('D', 8)], '1': [] },
        _tavernDeck: fillerCards(10),
        spadeShieldTotal: 10,
      }));
      client.moves.playCards!(['DAC', 'D8']);
      const G = client.store.getState().G;
      expect(G.damageDealt).toBe(9); // 1 + 8, not doubled -- Diamonds only drawn once at 9, not 18.
      expect(G.hands['0']!.length + G.hands['1']!.length).toBe(9);
      expect(G._tavernDeck).toHaveLength(1);
    });
  });

  describe('Hearts resolves before Diamonds when both trigger together (AC4)', () => {
    it('a Diamonds draw that would fail on an empty deck succeeds in full because Hearts refilled it first', () => {
      const client = clientWithFixture(2, () => ({
        ...twoPlayerBase,
        currentEnemy: face('C', 'J'), // avoids Hearts/Diamonds immunity entirely
        hands: { '0': [num('H', 4), num('D', 4)], '1': [] }, // same rank (4) combo, both suits
        _tavernDeck: [], // empty -- Diamonds alone would draw nothing
        discardPile: fillerCards(8),
        spadeShieldTotal: 10, // zeroes Step 4 so the test stays focused on Steps 2/3
      }));
      client.moves.playCards!(['H4', 'D4']);
      const G = client.store.getState().G;
      expect(G.damageDealt).toBe(8);
      expect(G.discardPile).toHaveLength(0); // all 8 moved to the Tavern deck by Hearts
      expect(G._tavernDeck).toHaveLength(0); // ...and then fully drawn back out by Diamonds
      expect(G.hands['0']!.length + G.hands['1']!.length).toBe(8);
    });
  });

  describe('Spades: raw accumulation, immunity gated only when read (AC6)', () => {
    it('accumulates the raw total even while the enemy is immune, but Step 4 sees 0 effective shield', () => {
      const client = clientWithFixture(2, () => ({
        ...twoPlayerBase,
        currentEnemy: face('S', 'J'), // immune to spades
        hands: { '0': [num('S', 4), num('C', 10)], '1': [] },
      }));
      client.moves.playCards!(['S4']);
      const G = client.store.getState().G;
      expect(G.spadeShieldTotal).toBe(4); // raw total recorded despite immunity
      expect(G.pendingDefense).toEqual({ requiredTotal: 10 }); // enemy attack 10 - effective shield 0
    });

    it('a Jester lifts immunity and immediately unlocks the previously-recorded raw spade value', () => {
      const client = clientWithFixture(2, () => ({
        ...twoPlayerBase,
        currentEnemy: face('S', 'J'),
        spadeShieldTotal: 4, // as if already played and blocked by immunity earlier this round
        hands: { '0': [jester(1)], '1': [num('D', 6)] },
      }));
      client.moves.playCards!(['Jester1'], { jesterNextPlayerID: '1' });
      let G = client.store.getState().G;
      expect(G.enemyImmunityCancelled).toBe(true);
      expect(client.store.getState().ctx.currentPlayer).toBe('1');

      client.moves.yield!();
      G = client.store.getState().G;
      // effective shield is now 4 (immunity lifted) -> required = 10 - 4 = 6.
      expect(G.pendingDefense).toEqual({ requiredTotal: 6 });
    });
  });

  describe('Enemy suit immunity (general)', () => {
    it('blocks only the matching suit power; the card value still counts toward damage', () => {
      const client = clientWithFixture(2, () => ({
        ...twoPlayerBase,
        currentEnemy: face('D', 'J'), // immune to Diamonds
        hands: { '0': [num('D', 7)], '1': [] },
        _tavernDeck: fillerCards(10),
        spadeShieldTotal: 10,
      }));
      client.moves.playCards!(['D7']);
      const G = client.store.getState().G;
      expect(G.damageDealt).toBe(7); // value still counts
      expect(G.hands['0']!.length + G.hands['1']!.length).toBe(0); // but no draw happened
      expect(G._tavernDeck).toHaveLength(10);
    });
  });

  describe('the Jester (AC7)', () => {
    it('is rejected unless played alone', () => {
      const client = clientWithFixture(2, () => ({
        ...twoPlayerBase,
        hands: { '0': [jester(1), num('S', 2)], '1': [] },
      }));
      client.moves.playCards!(['Jester1', 'S2'], { jesterNextPlayerID: '1' });
      expect(client.store.getState().G.hands['0']).toHaveLength(2); // rejected, nothing removed
    });

    it('requires a valid jesterNextPlayerID, deals 0 damage, and skips Step 3/4 (enemy does not attack)', () => {
      const client = clientWithFixture(3, () => ({
        ...twoPlayerBase,
        activeSeatIDs: ['0', '1', '2'],
        lastActionWasYield: { '0': false, '1': false, '2': false },
        hands: { '0': [jester(1)], '1': [], '2': [] },
      }));
      // Missing jesterNextPlayerID -> INVALID_MOVE.
      client.moves.playCards!(['Jester1']);
      expect(client.store.getState().G.hands['0']).toHaveLength(1);

      client.moves.playCards!(['Jester1'], { jesterNextPlayerID: '2' });
      const G = client.store.getState().G;
      expect(G.damageDealt).toBe(0);
      expect(G.forcedNextSeatID).toBeNull(); // consumed and cleared by the new turn's onBegin
      // Overrides clockwise order (would otherwise be '1') -- proves the override is real.
      expect(client.store.getState().ctx.currentPlayer).toBe('2');
    });
  });

  describe('legal-play rejection at the move layer', () => {
    it('rejects an Animal Companion paired with a Jester', () => {
      const client = clientWithFixture(2, () => ({
        ...twoPlayerBase,
        hands: { '0': [ac('C'), jester(1)], '1': [] },
      }));
      client.moves.playCards!(['CAC', 'Jester1']);
      expect(client.store.getState().G.hands['0']).toHaveLength(2);
    });

    it('rejects referencing a card not in hand', () => {
      const client = clientWithFixture(2, () => ({
        ...twoPlayerBase,
        hands: { '0': [num('S', 2)], '1': [] },
      }));
      client.moves.playCards!(['S9']);
      expect(client.store.getState().G.hands['0']).toHaveLength(1);
    });
  });

  describe('Step 4 -- suffering damage (AC11)', () => {
    it('a non-zero required total opens the defend stage; a sufficient discardCards resolves it and ends the turn', () => {
      const client = clientWithFixture(2, () => ({
        ...twoPlayerBase,
        currentEnemy: face('C', 'J'),
        // H2 (Hearts) is played for its damage only -- Clubs enemy means no
        // immunity conflict, and an empty discard pile means Hearts' own
        // heal is a no-op, so this doesn't draw/shuffle anything unrelated.
        hands: { '0': [num('H', 2), num('C', 4), num('D', 3), num('S', 3)], '1': [] },
      }));
      client.moves.playCards!(['H2']); // damage 2, required = 10 - 0 = 10
      let state = client.store.getState();
      expect(state.G.pendingDefense).toEqual({ requiredTotal: 10 });
      expect(state.ctx.activePlayers).toEqual({ '0': 'defend' });

      // Insufficient selection -- rejected, still pending.
      client.moves.discardCards!(['S3']);
      expect(client.store.getState().G.pendingDefense).toEqual({ requiredTotal: 10 });

      client.moves.discardCards!(['C4', 'D3', 'S3']); // sums to 10
      state = client.store.getState();
      expect(state.G.pendingDefense).toBeNull();
      expect(state.G.hands['0']).toEqual([]);
      expect(state.G.discardPile.map((c: Card) => c.id).sort()).toEqual(['C4', 'D3', 'S3']);
      expect(state.ctx.currentPlayer).toBe('1');
    });

    it('a hand that could never reach the required total ends the match in a loss immediately (capability check, no discardCards needed)', () => {
      const client = clientWithFixture(2, () => ({
        ...twoPlayerBase,
        currentEnemy: face('C', 'J'), // attack 10
        hands: { '0': [num('H', 2), num('S', 3)], '1': [] }, // remaining hand sums to only 3
      }));
      client.moves.playCards!(['H2']);
      const G = client.store.getState().G;
      expect(G.matchResult).toBe('lost');
      expect(G.pendingDefense).toBeNull();
      expect(client.store.getState().ctx.gameover).toEqual({});
    });
  });

  describe('yield (AC12, AC13, "1a")', () => {
    it('is allowed by default, deals no damage, and does not touch the hand', () => {
      const client = clientWithFixture(2, () => ({
        ...twoPlayerBase,
        currentEnemy: face('C', 'J'),
        spadeShieldTotal: 10,
        hands: { '0': [num('S', 5)], '1': [] },
      }));
      client.moves.yield!();
      const G = client.store.getState().G;
      expect(G.lastActionWasYield['0']).toBe(true);
      expect(G.damageDealt).toBe(0);
      expect(G.hands['0']).toHaveLength(1);
      expect(client.store.getState().ctx.currentPlayer).toBe('1');
    });

    it('is rejected once every other active seat yielded on their last turn', () => {
      const client = clientWithFixture(2, () => ({
        ...twoPlayerBase,
        lastActionWasYield: { '0': false, '1': true },
        hands: { '0': [num('S', 5)], '1': [] },
      }));
      client.moves.yield!();
      expect(client.store.getState().G.lastActionWasYield['0']).toBe(false); // rejected
    });

    it('an empty hand with yielding forbidden ends the match in a loss at the start of the turn, with no move needed', () => {
      const client = clientWithFixture(2, () => ({
        ...twoPlayerBase,
        lastActionWasYield: { '0': false, '1': true },
        hands: { '0': [], '1': [] },
      }));
      const G = client.store.getState().G;
      expect(G.matchResult).toBe('lost');
      expect(client.store.getState().ctx.gameover).toEqual({});
    });

    it('an empty hand with yielding still allowed is not a loss', () => {
      const client = clientWithFixture(2, () => ({
        ...twoPlayerBase,
        lastActionWasYield: { '0': false, '1': false },
        hands: { '0': [], '1': [] },
      }));
      expect(client.store.getState().G.matchResult).toBeNull();
      client.moves.yield!();
      expect(client.store.getState().G.lastActionWasYield['0']).toBe(true);
    });
  });

  describe('face cards re-entering play', () => {
    it('a face card in hand plays as a single card at its rank value, with its own suit power', () => {
      const client = clientWithFixture(2, () => ({
        ...twoPlayerBase,
        currentEnemy: face('H', 'Q'), // attack 15, health 30 -- not Spades, so no immunity conflict
        hands: { '0': [face('S', 'J')], '1': [] }, // Jack of Spades sitting in hand
        spadeShieldTotal: 0,
      }));
      client.moves.playCards!(['SJ']);
      const G = client.store.getState().G;
      expect(G.damageDealt).toBe(10);
      expect(G.spadeShieldTotal).toBe(10);
    });
  });

  describe('round-defeat confirmation (AC9, AC9a)', () => {
    function defeatFixture(overkill: boolean): Partial<RegicideG> {
      return {
        ...twoPlayerBase,
        currentEnemy: face('H', 'J'), // health 20
        _castleDeck: [face('S', 'Q')], // one more enemy remains after this Jack
        damageDealt: overkill ? 15 : 13,
        // Hearts suit -- the enemy (Jack of Hearts) is immune to it, so this
        // card contributes damage only, no heal side effect to account for.
        hands: { '0': [num('H', overkill ? 10 : 7)], '1': [] },
        // playCards' defeat branch does NOT call events.endTurn() -- the
        // phase transition into roundConfirm ends the turn on its own, and
        // roundConfirm's own turn.order (regicideTurnOrder, reused) resolves
        // ctx.currentPlayer straight to G.nextTurnStartSeatID. So
        // ctx.currentPlayer stays '0' -- the player who defeated the enemy
        // -- for the entire roundConfirm wait, never visibly passing to '1'.
        hostPlayerID: '1',
      };
    }

    it('freezes the defeated enemy in place (no reveal, no reset) until confirmed, and blocks other moves meanwhile', () => {
      const client = clientWithFixture(2, () => defeatFixture(false), { hostPlayerID: '1' });
      client.moves.playCards!(['H7']); // 13 + 7 = 20, exact.
      const frozen = client.store.getState().G;
      expect(frozen.currentEnemy).toEqual(face('H', 'J'));
      expect(frozen.damageDealt).toBe(20);
      expect(frozen.pendingEnemyDisposal).toBe('tavern');
      // The cards that just won the round stay visible in cardsInPlay
      // (NOT yet moved to discardPile) for the whole roundConfirm wait --
      // see resolveEnemyDefeat's own doc comment; feature 023's board
      // renders this so the "what defeated it" view doesn't blank out the
      // instant the enemy dies.
      expect(frozen.cardsInPlay).toEqual([num('H', 7)]);
      expect(frozen.discardPile).toEqual([]);
      expect(frozen.roundConfirm).toEqual({ pendingSeatIDs: ['0', '1'], confirmedSeatIDs: [] });
      expect(client.store.getState().ctx.phase).toBe('roundConfirm');
      // The defeating player keeps the turn immediately -- no visible pass
      // to '1' followed by a later correction (the bug this test guards).
      expect(client.store.getState().ctx.currentPlayer).toBe('0');

      // No combat move is legal while pending -- state is untouched by the attempt.
      client.moves.playCards!(['anything']);
      client.moves.yield!();
      expect(client.store.getState().G).toEqual(frozen);
    });

    it('exact-health defeat places the card on top of the Tavern deck once confirmed; the defeating player resumes', () => {
      const client = clientWithFixture(2, () => defeatFixture(false), { hostPlayerID: '1' });
      client.moves.playCards!(['H7']);
      // forceAdvanceRound is host-authorized (G.hostPlayerID), not tied to
      // ctx.currentPlayer -- '1' is the host here, and ctx.currentPlayer is
      // now correctly '0' (the defeating player), so this must be
      // dispatched explicitly rather than relying on the local client's
      // default-to-currentPlayer move dispatch.
      client.updatePlayerID('1');
      client.moves.forceAdvanceRound!();
      const G = client.store.getState().G;
      expect(G.roundConfirm).toBeNull();
      expect(G.pendingEnemyDisposal).toBeNull();
      expect(G.currentEnemy).toEqual(face('S', 'Q'));
      expect(G.damageDealt).toBe(0);
      expect(G.spadeShieldTotal).toBe(0);
      expect(G.enemyImmunityCancelled).toBe(false);
      expect(G._tavernDeck[G._tavernDeck.length - 1]).toEqual(face('H', 'J')); // top = end, under pop()-is-draw
      // Only now -- at the actual start of the next round -- does the
      // previous round's played card move out of cardsInPlay.
      expect(G.cardsInPlay).toEqual([]);
      expect(G.discardPile).toContainEqual(num('H', 7));
      const state = client.store.getState();
      expect(state.ctx.phase).toBe('combat');
      expect(state.ctx.currentPlayer).toBe('0'); // the defeating player's bonus turn, not '1'
    });

    it('overkill places the defeated card in the discard pile instead', () => {
      const client = clientWithFixture(2, () => defeatFixture(true), { hostPlayerID: '1' });
      client.moves.playCards!(['H10']);
      client.updatePlayerID('1'); // host-authorized, see previous test's comment
      client.moves.forceAdvanceRound!();
      const G = client.store.getState().G;
      expect(G.discardPile).toContainEqual(face('H', 'J'));
      expect(G._tavernDeck).not.toContainEqual(face('H', 'J'));
    });

    it('a single confirmRoundReady from one seat does not, by itself, complete a 2-seat wait', () => {
      const client = clientWithFixture(2, () => defeatFixture(false), { hostPlayerID: '1' });
      client.moves.playCards!(['H7']);
      // ctx.currentPlayer is '0' (the defeating player) throughout
      // roundConfirm now, so '1' must be dispatched explicitly here rather
      // than relying on the local client's default-to-currentPlayer move
      // dispatch (assumedPlayerID in boardgame.io/client).
      client.updatePlayerID('1');
      client.moves.confirmRoundReady!();
      const G = client.store.getState().G;
      expect(G.roundConfirm).toEqual({ pendingSeatIDs: ['0', '1'], confirmedSeatIDs: ['1'] });
      expect(client.store.getState().ctx.phase).toBe('roundConfirm'); // still waiting on '0'
    });
  });

  describe('winning by defeating the 4th King (AC14)', () => {
    it('ends the match in a shared win the instant the last King is defeated, with no round-defeat wait', () => {
      const client = clientWithFixture(2, () => ({
        ...twoPlayerBase,
        currentEnemy: face('C', 'K'), // health 40
        _castleDeck: [], // this IS the last enemy
        damageDealt: 33,
        hands: { '0': [num('D', 10)], '1': [] }, // 33 + 10 = 43 >= 40, overkill
      }));
      client.moves.playCards!(['D10']);
      const G = client.store.getState().G;
      expect(G.matchResult).toBe('won');
      expect(G.currentEnemy).toBeNull();
      expect(G.roundConfirm).toBeNull();
      // No roundConfirm wait to defer to on the match-winning defeat, so
      // this round's played card resolves to the discard pile immediately.
      expect(G.cardsInPlay).toEqual([]);
      expect(G.discardPile).toContainEqual(num('D', 10));
      expect(client.store.getState().ctx.gameover).toEqual({ winner: ['0', '1'] });
    });
  });

  describe('phantom (unclaimed) seats', () => {
    it('never deals to or activates a seat outside activeSeatIDs', () => {
      const G = Client({
        game: {
          ...regicideGameDef,
          setup: (ctx) => regicideGameDef.setup!(ctx, { claimedSeatIDs: ['0', '1'] }),
        },
        numPlayers: 4,
      }).store.getState().G;
      expect(G.activeSeatIDs).toEqual(['0', '1']);
      expect(G.hands['2']).toEqual([]);
      expect(G.hands['3']).toEqual([]);
      expect(G.lastActionWasYield).toEqual({ '0': false, '1': false });
    });
  });

  describe('G.log (AC17)', () => {
    it('logs cards played, a yield, an enemy defeat, and the match win', () => {
      const client = clientWithFixture(2, () => ({
        ...twoPlayerBase,
        currentEnemy: face('H', 'J'),
        _castleDeck: [],
        damageDealt: 13,
        hands: { '0': [num('D', 10)], '1': [] },
      }));
      client.moves.playCards!(['D10']);
      const keys = client.store.getState().G.log.map((e: GameLogEntry) => e.key);
      expect(keys).toContain('regicide.log.cardsPlayed');
      expect(keys).toContain('regicide.log.enemyDefeated');
      expect(keys).toContain('regicide.log.matchWon');
    });
  });

  describe('playerView (AC16)', () => {
    it('narrows hands to the viewer\'s own seat and exposes public counts to everyone, including a spectator', () => {
      const client = clientWithFixture(2, () => ({
        ...twoPlayerBase,
        hands: { '0': [num('S', 2), num('S', 3)], '1': [num('H', 4)] },
      }));
      const state = client.store.getState();
      const ownView = regicideGameDef.playerView!({ G: state.G, ctx: state.ctx, playerID: '0' });
      expect(ownView.hands).toEqual({ '0': state.G.hands['0'] });
      expect(ownView.handCounts).toEqual({ '0': 2, '1': 1 });
      expect(ownView.tavernCount).toBe(state.G._tavernDeck.length);
      expect(ownView.enemyNumber).toBe(1);

      const otherView = regicideGameDef.playerView!({ G: state.G, ctx: state.ctx, playerID: '1' });
      expect(otherView.hands).toEqual({ '1': state.G.hands['1'] });

      const spectatorView = regicideGameDef.playerView!({ G: state.G, ctx: state.ctx, playerID: null });
      expect(spectatorView.hands).toEqual({});
      expect(spectatorView.handCounts).toEqual({ '0': 2, '1': 1 });
      expect('_tavernDeck' in spectatorView).toBe(false);
      expect('_castleDeck' in spectatorView).toBe(false);
    });
  });
});
