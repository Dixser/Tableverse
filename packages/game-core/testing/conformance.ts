import { describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';
import type { GameModule } from '../src/types.js';

export interface ConformanceOptions {
  /**
   * Top-level G keys that hold per-player secret data, shaped as
   * Record<PlayerID, unknown>. For each key, the suite verifies that
   * playerView(G, ctx, playerID) never exposes another player's entry,
   * and that a spectator (playerID: null) sees no entries at all.
   */
  secretKeys: string[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// --- Individual checks -----------------------------------------------
// Exported as plain functions (throw on violation) so they can be called
// directly by conformance.ts's own tests (proving the checks work in both
// directions), independent of the describe/it wiring in
// testGameModuleConformance below, which real games call.

export function checkSetupValidity<G>(module: GameModule<G>, numPlayers: number): void {
  const client = Client({ game: module.gameDef, numPlayers });
  const state = client.getState();
  if (state === null || state.G === undefined) {
    throw new Error(
      `${module.id}: setup produced no valid state for numPlayers=${numPlayers}`,
    );
  }
}

export function checkSerializability<G>(module: GameModule<G>, numPlayers: number): void {
  const client = Client({ game: module.gameDef, numPlayers });
  const G = client.getState()?.G;
  const roundTripped = JSON.parse(JSON.stringify(G)) as unknown;
  if (JSON.stringify(roundTripped) !== JSON.stringify(G)) {
    throw new Error(`${module.id}: G is not JSON-serializable`);
  }
}

/** Throws with a descriptive message on the first leak found. */
export function checkPlayerViewLeakFree<G>(
  module: GameModule<G>,
  options: ConformanceOptions,
): void {
  if (options.secretKeys.length === 0) return;
  if (!module.gameDef.playerView) {
    throw new Error(
      `${module.id} declares no playerView, but secretKeys were provided ` +
        `— a game with secret data must filter it.`,
    );
  }
  const numPlayers = module.minPlayers;
  const client = Client({ game: module.gameDef, numPlayers });
  const state = client.getState();
  const playOrder = Array.from({ length: numPlayers }, (_, i) => String(i));
  const viewers: (string | null)[] = [...playOrder, null];

  for (const secretKey of options.secretKeys) {
    for (const viewerID of viewers) {
      const view = module.gameDef.playerView({
        G: state!.G,
        ctx: state!.ctx,
        playerID: viewerID,
      });
      const value = isPlainRecord(view) ? view[secretKey] : undefined;
      if (value === undefined) continue; // key fully stripped -- fine
      if (!isPlainRecord(value)) {
        throw new Error(
          `${module.id}: secret key "${secretKey}" is not a Record<PlayerID, unknown>`,
        );
      }
      const leaked = Object.keys(value).filter((owner) => owner !== viewerID);
      if (leaked.length > 0) {
        throw new Error(
          `${module.id}: secret key "${secretKey}" leaked owner(s) ` +
            `[${leaked.join(', ')}] to viewer ${viewerID ?? 'spectator'}`,
        );
      }
    }
  }
}

export function checkDeterminism<G>(module: GameModule<G>, numPlayers: number): void {
  const seed = 'tableverse-conformance-fixed-seed';
  const gameWithFixedSeed = { ...module.gameDef, seed };
  const clientA = Client({ game: gameWithFixedSeed, numPlayers });
  const clientB = Client({ game: gameWithFixedSeed, numPlayers });
  const a = JSON.stringify(clientA.getState()?.G);
  const b = JSON.stringify(clientB.getState()?.G);
  if (a !== b) {
    throw new Error(
      `${module.id}: setup is not deterministic under a fixed seed`,
    );
  }
}

/**
 * Generic conformance test suite every GameModule must pass. Call it from
 * the game's own test file:
 *
 *   testGameModuleConformance(myGameModule, { secretKeys: ['hand'] });
 *
 * See spec/features/001-platform-core/plan.md, "Conformance test suite",
 * and spec/constitution/tech-stack.md, "Testing strategy".
 */
export function testGameModuleConformance<G>(
  module: GameModule<G>,
  options: ConformanceOptions,
): void {
  describe(`GameModule conformance: ${module.id}`, () => {
    describe('setup validity', () => {
      it(`produces a valid initial state at minPlayers (${module.minPlayers})`, () => {
        expect(() => checkSetupValidity(module, module.minPlayers)).not.toThrow();
      });

      it(`produces a valid initial state at maxPlayers (${module.maxPlayers})`, () => {
        expect(() => checkSetupValidity(module, module.maxPlayers)).not.toThrow();
      });
    });

    describe('G serializability', () => {
      it('G survives a JSON round-trip unchanged after setup', () => {
        expect(() =>
          checkSerializability(module, module.minPlayers),
        ).not.toThrow();
      });
    });

    describe('playerView leak-freedom', () => {
      it('no secret key leaks to a non-owner or a spectator', () => {
        expect(() => checkPlayerViewLeakFree(module, options)).not.toThrow();
      });
    });

    describe('determinism', () => {
      it('the same seed produces identical G after setup, twice', () => {
        expect(() =>
          checkDeterminism(module, module.minPlayers),
        ).not.toThrow();
      });
    });
  });
}
