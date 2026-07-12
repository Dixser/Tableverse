import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checklist, generate } from './new-game.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GAMES_DIR = join(REPO_ROOT, 'packages/game-core/src/games');
const REGISTRATION_FILES = [
  join(REPO_ROOT, 'packages/game-core/src/gamesCatalog.ts'),
  join(REPO_ROOT, 'packages/game-core/src/boards.ts'),
  join(REPO_ROOT, 'packages/client/src/boardRegistry.ts'),
];

function hashAll(paths) {
  return paths.map((p) => createHash('sha256').update(readFileSync(p)).digest('hex'));
}

function cleanup(slug) {
  const dir = join(GAMES_DIR, slug);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('AC1: valid id + display name generates all six files with tokens substituted', () => {
  const slug = 'testgen1';
  cleanup(slug);
  try {
    const result = generate(`${slug}-v1`, 'Test Gen One');

    assert.equal(result.files.length, 6);
    for (const file of result.files) {
      assert.ok(existsSync(file), `expected ${file} to exist`);
    }

    const indexContent = readFileSync(join(result.targetDir, 'index.ts'), 'utf8');
    assert.match(indexContent, /id: 'testgen1-v1'/);
    assert.match(indexContent, /displayName: 'Test Gen One'/);
    assert.match(indexContent, /testgen1GameDef/);
    assert.match(indexContent, /Testgen1G/);
    assert.doesNotMatch(indexContent, /__ID__|__SLUG__|__DISPLAY_NAME__|__PASCAL_NAME__/);

    const conformanceFile = join(result.targetDir, 'testgen1Module.conformance.test.ts');
    assert.ok(existsSync(conformanceFile));
  } finally {
    cleanup(slug);
  }
});

test('AC1 (multi-word slug): kebab-case id derives correct PascalCase type/component names', () => {
  const slug = 'love-letters';
  cleanup(slug);
  try {
    const result = generate(`${slug}-v2`, 'Love Letters');
    const indexContent = readFileSync(join(result.targetDir, 'index.ts'), 'utf8');
    assert.match(indexContent, /LoveLettersG/);
    assert.match(indexContent, /loveLettersModule/);
    assert.doesNotMatch(indexContent, /love-letters\w/);
    assert.equal(result.pascalName, 'LoveLetters');
    assert.equal(result.camelSlug, 'loveLetters');
  } finally {
    cleanup(slug);
  }
});

test('AC2: id missing a -v<N> suffix is rejected before any file is written', () => {
  const slug = 'noversion';
  cleanup(slug);
  try {
    assert.throws(() => generate(slug, 'No Version'), /must match/);
    assert.ok(!existsSync(join(GAMES_DIR, slug)));
  } finally {
    cleanup(slug);
  }
});

test('AC3: colliding slug is rejected and the pre-existing directory is left untouched', () => {
  const slug = 'collide1';
  const dir = join(GAMES_DIR, slug);
  cleanup(slug);
  try {
    mkdirSync(dir, { recursive: true });
    const sentinelPath = join(dir, 'sentinel.txt');
    writeFileSync(sentinelPath, 'pre-existing', 'utf8');

    assert.throws(() => generate(`${slug}-v1`, 'Collide'), /already exists/);

    // The pre-existing directory must be untouched: no new files added.
    assert.ok(existsSync(sentinelPath));
    assert.equal(readFileSync(sentinelPath, 'utf8'), 'pre-existing');
  } finally {
    cleanup(slug);
  }
});

test('AC8: ids with disallowed characters (spaces, "..", "/") are rejected before any path is constructed', () => {
  for (const badId of ['has space-v1', '../escape-v1', 'nested/slug-v1', 'Upper-v1']) {
    assert.throws(() => generate(badId, 'Bad'), /must match/, `expected "${badId}" to be rejected`);
  }
  // None of these should have created anything under or outside GAMES_DIR.
  assert.ok(!existsSync(join(GAMES_DIR, 'escape')));
  assert.ok(!existsSync(join(GAMES_DIR, '..', 'escape')));
});

test('AC5: gamesCatalog.ts, boards.ts, and boardRegistry.ts are unchanged after a run', () => {
  const before = hashAll(REGISTRATION_FILES);
  const slug = 'testgen5';
  cleanup(slug);
  try {
    generate(`${slug}-v1`, 'Test Gen Five');
    const after = hashAll(REGISTRATION_FILES);
    assert.deepEqual(after, before);
  } finally {
    cleanup(slug);
  }
});

test('AC6: printed checklist names the three registration files and the tech-stack.md pointer', () => {
  const slug = 'testgen6';
  cleanup(slug);
  try {
    const result = generate(`${slug}-v1`, 'Test Gen Six');
    const output = checklist({ id: `${slug}-v1`, ...result });

    assert.match(output, /packages\/game-core\/src\/gamesCatalog\.ts/);
    assert.match(output, /packages\/game-core\/src\/boards\.ts/);
    assert.match(output, /packages\/client\/src\/boardRegistry\.ts/);
    assert.match(output, /tech-stack\.md/);
  } finally {
    cleanup(slug);
  }
});
