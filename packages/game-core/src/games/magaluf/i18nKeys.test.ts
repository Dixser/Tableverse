import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';

import { ALCOHOL, DAY_IDS, EVENTS, ITEM_IDS, PHASE_IDS } from './cards.js';
import { PHASE_RULES } from './constants.js';
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

/**
 * The most copies of one card any single phase deck holds.
 *
 * This is the number of *printed* cards a player can meet in one venue, and
 * therefore the number of distinct flavour lines the catalogue owes: a Cubata
 * appears seven times in the Noche, so a table can see seven of them in a row
 * and none of them should read the same. `buildDeck` hands out variants
 * `0..count-1`, so this is exactly the index range that has to resolve.
 */
function largestPrintRun(section: 'alcohol' | 'events'): Record<string, number> {
  const out: Record<string, number> = {};
  for (const rules of Object.values(PHASE_RULES)) {
    for (const [id, count] of Object.entries(rules[section])) {
      out[id] = Math.max(out[id] ?? 0, (count as number) ?? 0);
    }
  }
  return out;
}

/** Every key the engine can ever name, derived from the card data itself. */
function expectedCardKeys(): string[] {
  const alcoholRuns = largestPrintRun('alcohol');
  const eventRuns = largestPrintRun('events');

  /** title + effect + one flavour per printed copy. */
  const cardKeys = (kind: 'alcohol' | 'event', id: string, copies: number) => [
    `magaluf.${kind}.${id}.title`,
    `magaluf.${kind}.${id}.effect`,
    // At least one, even for a card that somehow appears in no deck: a card
    // with a title and no line under it is half a card.
    ...Array.from({ length: Math.max(1, copies) }, (_, i) => `magaluf.${kind}.${id}.flavor.${i}`),
  ];

  return [
    ...Object.keys(ALCOHOL).flatMap((id) => cardKeys('alcohol', id, alcoholRuns[id] ?? 0)),
    ...Object.keys(EVENTS).flatMap((id) => cardKeys('event', id, eventRuns[id] ?? 0)),
    // Every branch of every choice card. A card with an unlabelled option is a
    // button nobody can read, which is worse than a missing card description.
    ...Object.values(EVENTS).flatMap((card) =>
      (card.options ?? []).map((option) => `magaluf.eventOption.${option.id}`),
    ),
    ...ITEM_IDS.map((id) => `magaluf.item.${id}`),
    // An item is the only card-like thing whose effect is not printed where
    // the table can read it, so its rules text and the action bar's one-line
    // reminder are as load-bearing as the name itself.
    ...ITEM_IDS.map((id) => `magaluf.itemDesc.${id}`),
    ...ITEM_IDS.map((id) => `magaluf.itemShort.${id}`),
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
        game: {
          ...magalufGameDef,
          seed,
          // maxDrinksOverride now defaults to unlimited (0), for the ongoing
          // playtest -- see settings.ts. The 'drink' sweep below drives every
          // seat to always drink, which relies on closing time to ever end a
          // phase; pin the shipped cap back on so this still finishes in a
          // sane amount of time rather than drinking, unthrottled, into a
          // 6000-iteration guard.
          setup: (ctx: Parameters<NonNullable<typeof magalufGameDef.setup>>[0], setupData?: unknown) => {
            const G = magalufGameDef.setup!(ctx, setupData as never) as MagalufG;
            G.settings.maxDrinksOverride = -1;
            return G;
          },
        },
        numPlayers: 4,
      }) as unknown as {
        updatePlayerID: (id: string) => void;
        moves: Record<string, (...args: unknown[]) => void>;
        store: { getState: () => { G: MagalufG } };
      };

      for (let guard = 0; guard < 6000; guard++) {
        const G = client.store.getState().G;
        if (G.finished) break;

        // The night's jumps are watched by the seat that made them, and until
        // they are the table is at a balcony with no other move available.
        if (G.balcony) {
          const jumper = G.jumps[G.balcony.index]!.seatID;
          client.updatePlayerID(jumper);
          if (G.balcony.revealed) client.moves.advanceJump!();
          else client.moves.revealJump!();
          continue;
        }

        // Gates have to be cleared or the weekend stalls at the first venue
        // change and most of the key surface is never reached.
        if (G.roundConfirm) {
          const waiting = G.roundConfirm.pendingSeatIDs.find(
            (id) => !G.roundConfirm!.confirmedSeatIDs.includes(id),
          );
          if (waiting === undefined) break;
          client.updatePlayerID(waiting);
          client.moves.confirmRoundReady!();
          continue;
        }

        // A face-down event and an unanswered choice both block every other
        // move, so a driver that only ever calls `drink` would spin here until
        // the guard ran out and prove nothing about the event key surface.
        if (G.pendingEvent) {
          client.updatePlayerID(G.pendingEvent.seatID);
          client.moves.revealEvent!();
          continue;
        }
        if (G.pendingChoice) {
          client.updatePlayerID(G.pendingChoice.seatID);
          // Alternate branches by seed so both sides of every card are taken
          // across the sweep, rather than only ever the first.
          client.moves.chooseEventOption!(seed.charCodeAt(0) % 2);
          continue;
        }
        // A duel is the same again, one seat further out: while it is open the
        // only moves belong to the seat it is waiting on. One drink, then a
        // fold, so both the pour and the payout reach the log.
        if (G.pendingDuel) {
          const duel = G.pendingDuel;
          if (duel.targetID === null) {
            const target = G.activeSeatIDs.find(
              (id) => id !== duel.challengerID && G.players[id]!.status === 'partying',
            )!;
            client.updatePlayerID(duel.challengerID);
            client.moves.chooseDuelTarget!(target);
          } else {
            client.updatePlayerID(duel.toActID!);
            client.moves[duel.drinks < 1 ? 'duelDrink' : 'duelFold']!();
          }
          continue;
        }

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
