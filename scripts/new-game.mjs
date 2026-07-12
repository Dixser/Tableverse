#!/usr/bin/env node
// Generates the boilerplate for a new GameModule from
// packages/game-core/templates/new-game/. See
// spec/features/011-game-scaffolding/{spec,plan}.md.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE_DIR = join(REPO_ROOT, 'packages/game-core/templates/new-game');
const GAMES_DIR = join(REPO_ROOT, 'packages/game-core/src/games');

const ID_PATTERN = /^[a-z0-9-]+-v\d+$/;

// Template filenames that get a slug-prefixed real filename on write.
const OUTPUT_FILENAME = {
  'Module.conformance.test.ts': (camelSlug) => `${camelSlug}Module.conformance.test.ts`,
};

function kebabToPascal(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');
}

// Kebab slugs (e.g. "love-letters") are valid directory names but not valid
// JS identifiers -- __SLUG__ is substituted into identifier positions
// (`__SLUG__Module`, `__SLUG__GameDef`) in the template files, so it needs a
// camelCase form. The kebab `slug` itself is only ever used for filesystem
// paths (the target directory, and the relative import paths printed in the
// registration checklist).
function toCamel(pascal) {
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

export function generate(id, displayName) {
  if (!id || !displayName) {
    throw new Error(
      'Usage: npm run new-game -- <id> "<Display Name>"\n' +
        '  <id> must match <slug>-v<N>, e.g. loveletters-v1',
    );
  }

  if (!ID_PATTERN.test(id)) {
    throw new Error(
      `Invalid id "${id}": must match <slug>-v<N> (lowercase letters, digits, ` +
        'hyphens only, ending in a version suffix like -v1). Examples: ' +
        '"loveletters-v1", "love-letters-v2".',
    );
  }

  const slug = id.replace(/-v\d+$/, '');
  const pascalName = kebabToPascal(slug);
  const camelSlug = toCamel(pascalName);
  const targetDir = join(GAMES_DIR, slug);

  if (existsSync(targetDir)) {
    throw new Error(`Cannot generate "${id}": ${targetDir} already exists.`);
  }

  const substitutions = {
    __ID__: id,
    __SLUG__: camelSlug,
    __DISPLAY_NAME__: displayName,
    __PASCAL_NAME__: pascalName,
  };

  const templateFiles = readdirSync(TEMPLATE_DIR);
  const writes = templateFiles.map((filename) => {
    const raw = readFileSync(join(TEMPLATE_DIR, filename), 'utf8');
    const content = Object.entries(substitutions).reduce(
      (text, [token, value]) => text.replaceAll(token, value),
      raw,
    );
    const outputFilename = OUTPUT_FILENAME[filename]?.(camelSlug) ?? filename;
    return { path: join(targetDir, outputFilename), content };
  });

  mkdirSync(targetDir, { recursive: true });
  for (const { path, content } of writes) {
    writeFileSync(path, content, 'utf8');
  }

  return { slug, camelSlug, pascalName, targetDir, files: writes.map((w) => w.path) };
}

export function checklist({ id, slug, camelSlug, pascalName, targetDir }) {
  return `Created ${targetDir}

Before this game is playable, wire it into:

  1. packages/game-core/src/gamesCatalog.ts
     import { ${camelSlug}Module } from './games/${slug}/index.js';
     export const gamesCatalog: AnyGameModule[] = [tictactoeModule, ${camelSlug}Module];

  2. packages/game-core/src/boards.ts
     export { ${pascalName}Board } from './games/${slug}/BoardComponent.js';

  3. packages/client/src/boardRegistry.ts
     '${id}': ${pascalName}Board,

Before picking a final id/version: read tech-stack.md's "Rules versioning
strategy" and decide whether this is a parametric edition of an existing
module or a genuinely new catalog entry.
`;
}

function main() {
  const [id, displayName] = process.argv.slice(2);
  try {
    const result = generate(id, displayName);
    console.log(checklist({ id, ...result }));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
