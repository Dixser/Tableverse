#!/usr/bin/env node
/**
 * Reports which Magaluf card pictures are still missing.
 *
 * Run with `npm run check:card-art`.
 *
 * The expected filenames are not listed here and not parsed out of anything —
 * they are produced by calling the same `cardArt()` the board calls, over the
 * same `PHASE_RULES` the deck is built from. A checking script that keeps its
 * own copy of what it is checking is worth very little: this one cannot say a
 * file is present under a name the game will never ask for.
 *
 * Exits 1 when anything is missing or unexpected, so it can gate a build later
 * without changing.
 */
import { readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ALCOHOL, EVENTS, cardArt } from '../packages/game-core/src/games/magaluf/cards.js';
import { PHASE_RULES } from '../packages/game-core/src/games/magaluf/constants.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART_DIR = join(REPO_ROOT, 'packages/client/public/cards/magaluf');

type Kind = 'alcohol' | 'event';

/**
 * How many copies of a card a table can meet in one venue, which is how many
 * pictures it needs. A card in no deck at all still gets one: it cannot be
 * drawn, but a card with no picture is not a card.
 */
function printRuns(section: 'alcohol' | 'events'): Map<string, number> {
  const runs = new Map<string, number>();
  for (const rules of Object.values(PHASE_RULES)) {
    for (const [id, count] of Object.entries(rules[section])) {
      runs.set(id, Math.max(runs.get(id) ?? 0, (count as number) ?? 0));
    }
  }
  return runs;
}

interface Expected {
  kind: Kind;
  id: string;
  variant: number;
  file: string;
}

function expectedFiles(): Expected[] {
  const out: Expected[] = [];
  const add = (kind: Kind, ids: string[], runs: Map<string, number>) => {
    for (const id of ids) {
      const copies = Math.max(1, runs.get(id) ?? 0);
      for (let variant = 0; variant < copies; variant++) {
        out.push({ kind, id, variant, file: cardArt(id, variant) });
      }
    }
  };
  add('alcohol', Object.keys(ALCOHOL), printRuns('alcohol'));
  add('event', Object.keys(EVENTS), printRuns('events'));
  return out;
}

function report(): number {
  if (!existsSync(ART_DIR)) {
    console.error(`No art directory at ${ART_DIR}`);
    return 1;
  }

  const present = new Set(
    readdirSync(ART_DIR).filter((name) => !name.endsWith('.md') && !name.startsWith('.')),
  );
  const expected = expectedFiles();
  const wanted = new Set(expected.map((e) => e.file));

  const missing = expected.filter((e) => !present.has(e.file));
  // A file nobody will ever ask for: almost always a typo in the id or the
  // number, which would otherwise show up as a card that silently never gets
  // its picture.
  const orphans = [...present].filter((name) => !wanted.has(name)).sort();

  const have = expected.length - missing.length;
  const pct = expected.length === 0 ? 100 : Math.round((have / expected.length) * 100);
  console.log(`Magaluf card art: ${have}/${expected.length} present (${pct}%)\n`);

  for (const kind of ['alcohol', 'event'] as const) {
    const forKind = missing.filter((m) => m.kind === kind);
    if (forKind.length === 0) continue;

    const total = expected.filter((e) => e.kind === kind).length;
    console.log(`  ${kind.toUpperCase()} - ${forKind.length} of ${total} missing`);

    // Grouped by card, because art is commissioned a card at a time and a flat
    // list of 89 filenames is not something anybody can act on.
    const byId = new Map<string, Expected[]>();
    for (const m of forKind) byId.set(m.id, [...(byId.get(m.id) ?? []), m]);

    for (const [id, items] of [...byId].sort(([a], [b]) => a.localeCompare(b))) {
      const wantedForId = expected.filter((e) => e.id === id).length;
      const suffix = items.length === wantedForId ? '(none yet)' : `(${items.length} of ${wantedForId})`;
      console.log(`    ${id.padEnd(18)} ${suffix}`);
      console.log(`      ${items.map((i) => i.file).join('  ')}`);
    }
    console.log('');
  }

  if (orphans.length > 0) {
    console.log(`  UNEXPECTED - ${orphans.length} file(s) no card asks for:`);
    for (const name of orphans) console.log(`    ${name}`);
    console.log('    (check the id spelling and the number: 1-based, zero-padded)\n');
  }

  if (missing.length === 0 && orphans.length === 0) {
    console.log('  Every card has its picture.');
    return 0;
  }
  return 1;
}

process.exit(report());
