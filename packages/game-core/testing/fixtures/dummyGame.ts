import type { Game } from 'boardgame.io';
import { INVALID_MOVE } from 'boardgame.io/core';
import type { GameModule } from '../../src/types.js';

/**
 * Minimal fixture GameModule used ONLY by the conformance suite's own
 * tests (dummyGame.conformance.test.ts). It is deliberately not registered
 * in gamesCatalog.ts — it exists purely to prove testGameModuleConformance
 * itself works, in both directions (passes on a correct module, fails on a
 * broken one). See spec/features/001-platform-core/plan.md, "Conformance
 * test suite".
 */

export interface DummyG {
  deck: number[];
  hands: Record<string, number[]>;
  discard: number[];
}

const CARD_COUNT = 12;
const HAND_SIZE = 2;

export const dummyGameDef: Game<DummyG> = {
  setup: ({ random, ctx }) => {
    const shuffled = random.Shuffle(
      Array.from({ length: CARD_COUNT }, (_, i) => i + 1),
    );
    const hands: Record<string, number[]> = {};
    let cursor = 0;
    for (let p = 0; p < ctx.numPlayers; p++) {
      hands[String(p)] = shuffled.slice(cursor, cursor + HAND_SIZE);
      cursor += HAND_SIZE;
    }
    return {
      deck: shuffled.slice(cursor),
      hands,
      discard: [],
    };
  },
  moves: {
    playCard: ({ G, playerID }, cardIndex: number) => {
      const hand = G.hands[playerID];
      const card = hand?.[cardIndex];
      if (hand === undefined || card === undefined) {
        return INVALID_MOVE;
      }
      hand.splice(cardIndex, 1);
      G.discard.push(card);
    },
  },
  // Only the acting player's own hand is visible to them; every other
  // player's hand (and a spectator's view of any hand) is stripped
  // entirely. This is the field the conformance suite's leak check
  // exercises via `secretKeys: ['hands']`.
  playerView: ({ G, playerID }) => {
    if (playerID === null || playerID === undefined) {
      return { deck: G.deck, discard: G.discard, hands: {} };
    }
    return {
      ...G,
      hands: { [playerID]: G.hands[playerID] ?? [] },
    };
  },
};

export const dummyGameModule: GameModule<DummyG> = {
  id: 'conformance-fixture-v1',
  displayName: 'Conformance Fixture (test-only, not a real game)',
  minPlayers: 2,
  maxPlayers: 4,
  gameDef: dummyGameDef,
  settingsSchema: {
    type: 'object',
    properties: {
      variant: { type: 'string', enum: ['a', 'b'], default: 'a' },
    },
    required: ['variant'],
  },
};

/**
 * A deliberately broken copy: playerView is a no-op passthrough, so every
 * player's (and every spectator's) hands are fully visible. Used only to
 * prove the conformance suite's leak check actually detects a violation,
 * not just passes on the happy path.
 */
export const brokenDummyGameModule: GameModule<DummyG> = {
  ...dummyGameModule,
  id: 'conformance-fixture-broken-v1',
  gameDef: {
    ...dummyGameDef,
    playerView: ({ G }) => G,
  },
};
