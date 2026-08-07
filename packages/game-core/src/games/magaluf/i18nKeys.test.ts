import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';

import { ALCOHOL, DAY_IDS, EVENTS, ITEM_IDS, PHASE_IDS } from './cards.js';
import { magalufGameDef, type MagalufG } from './gameDef.js';

/**
 * The engine names translation keys; the client owns the strings behind them.
 * Nothing else checks that contract: `localeParity.test.ts` only proves EN and
 * ES agree with each other, so both could be missing the same key and still
 * pass, and a missing key surfaces at runtime as the raw key printed into the
 * chat feed rather than as a failure.
 *
 * Reaching across packages by path is deliberate and confined to this file —
 * the assertion spans the two packages, so it cannot live wholly inside either.
 */
function loadLocale(locale: 'en' | 'es'): Record<string, unknown> {
  const url = new URL(`../../../../client/src/i18n/locales/${locale}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as Record<string, unknown>;
}

function has(tree: Record<string, unknown>, dottedKey: string): boolean {
  let node: unknown = tree;
  for (const part of dottedKey.split('.')) {
    if (typeof node !== 'object' || node === null) return false;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' && node.length > 0;
}

/** Every key the engine can ever name, derived from the card data itself. */
function expectedCardKeys(): string[] {
  return [
    ...Object.keys(ALCOHOL).map((id) => `magaluf.alcohol.${id}`),
    ...Object.keys(EVENTS).map((id) => `magaluf.event.${id}`),
    ...ITEM_IDS.map((id) => `magaluf.item.${id}`),
    ...PHASE_IDS.map((id) => `magaluf.phase.${id}`),
    ...DAY_IDS.map((id) => `magaluf.day.${id}`),
  ];
}

/** Every key actually emitted across a played-out weekend. */
function keysFromAPlayedMatch(): Set<string> {
  const keys = new Set<string>();
  // Several seeds and both extremes of behaviour, so rare branches (the
  // police, the ambulance, a jump) get a chance to fire.
  for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
    for (const move of ['drink', 'withdraw'] as const) {
      const client = Client({
        game: { ...magalufGameDef, seed },
        numPlayers: 4,
      }) as unknown as {
        updatePlayerID: (id: string) => void;
        moves: Record<string, () => void>;
        store: { getState: () => { G: MagalufG } };
      };

      for (let guard = 0; guard < 3000; guard++) {
        const G = client.store.getState().G;
        if (G.finished) break;
        client.updatePlayerID(G.turnSeatID);
        client.moves[move]!();
      }

      for (const entry of client.store.getState().G.log) {
        keys.add(entry.key);
        const nested = entry.params?.descriptionKey;
        if (typeof nested === 'string') keys.add(nested);
      }
    }
  }
  return keys;
}

describe('magaluf i18n key coverage', () => {
  const locales = { en: loadLocale('en'), es: loadLocale('es') };

  it('has a string for every card, event, item, phase and day key', () => {
    const missing: string[] = [];
    for (const key of expectedCardKeys()) {
      for (const [locale, tree] of Object.entries(locales)) {
        if (!has(tree, key)) missing.push(`${locale}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('has a string for every key a real weekend actually emits', () => {
    const emitted = [...keysFromAPlayedMatch()];
    expect(emitted.length).toBeGreaterThan(10);

    const missing: string[] = [];
    for (const key of emitted) {
      for (const [locale, tree] of Object.entries(locales)) {
        if (!has(tree, key)) missing.push(`${locale}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
