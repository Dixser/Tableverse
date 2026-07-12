# Feature 011 — Game Module Scaffolding: Implementation Plan

## Why the generator never edits `gamesCatalog.ts` / `boards.ts` / `boardRegistry.ts`

Considered and rejected: have the script string-insert an import + array
entry into all three files, fully automating registration.

Rejected because:

- Each edit is a **semantic** choice, not a mechanical one — where in the
  catalog array a new entry belongs, what exact display name/casing to
  use, whether the developer even wants the game live yet (spec.md story 1
  requires generation to have zero effect on the running app). A script
  guessing at insertion points via string matching (e.g. "insert before
  the closing `]`") is exactly the kind of fragile text-munging that
  breaks the moment the target file's formatting drifts from what the
  script expects, and failures would be silent (wrong insertion point
  compiles fine, just puts the entry somewhere odd) or loud in the worst
  way (corrupts a file mid-edit while other work is in progress there —
  spec.md story 3's explicit guarantee against this).
- All three edits are small (one import line + one array entry, in files
  that are 15-20 lines total today). Hand-editing them correctly, with the
  checklist's exact snippet in front of you, takes under a minute and is
  caught immediately by TypeScript if done wrong (unknown import, type
  mismatch) — the failure mode of a bad hand-edit is a compile error, not
  a silent runtime gap, which is a strictly better guarantee than a script
  that "succeeds" at inserting something subtly wrong.
- Consistent with tech-stack.md's stated tooling philosophy: no heavier
  mechanism than the problem requires ("no need for a heavier tool like
  Turborepo/Nx... revisit only if build times become a real problem").
  AST-aware codemodding three files correctly (import ordering, matching
  existing quote/semicolon style so Prettier/ESLint don't immediately flag
  the result) is real complexity for a problem a printed checklist solves
  just as effectively.

## Template location — outside `src/`, not a sibling of `games/`

`packages/game-core/templates/new-game/`, **not**
`packages/game-core/src/games/_template/`.

Checked both `tsconfig.json` (`"include": ["src", "testing"]`) and
`vitest.config.ts` (`include: ['src/**/*.test.ts', 'src/**/*.test.tsx',
'testing/**/*.test.ts']`) — neither includes anything outside `src/` or
`testing/`. Putting the template under `src/games/_template/` would mean
its own placeholder `*.test.ts` files run as real tests in every
`test:unit` invocation (noise, and a maintenance burden keeping a
never-registered "game" passing conformance forever) and its `gameDef.ts`
would typecheck as part of the real build. Putting it in a new top-level
`templates/` directory (a sibling of `src/` and `testing/`, both already
excluded from each other's tooling) makes the template invisible to both
without needing a fake file extension (`.ts.template`) or an `exclude`
config change — the files are plain, syntax-highlighted `.ts`/`.tsx`/
`.css`, just outside either tool's scan root.

```
packages/game-core/templates/new-game/
  gameDef.ts
  index.ts
  BoardComponent.tsx
  BoardComponent.module.css
  gameDef.test.ts
  Module.conformance.test.ts
```

Placeholder tokens inside these files, replaced by the generator via plain
string substitution (no templating library needed — five files, one
token each):

| Token | Example substitution | Source |
|---|---|---|
| `__ID__` | `loveletters-v1` | CLI arg 1 (validated per spec.md AC2/AC8) |
| `__SLUG__` | `loveletters` (id with `-v<N>` stripped) | derived from CLI arg 1 |
| `__DISPLAY_NAME__` | `Love Letter` | CLI arg 2 |
| `__PASCAL_NAME__` | `Loveletters` (for the `G` type name, component name) | derived from `__SLUG__` |

## Template contents

`gameDef.ts` — the minimal valid `Game<G>`, mirroring Tic-Tac-Toe's shape
exactly (same fields, trivial bodies) so it reads as "Tic-Tac-Toe with the
board removed," not an unfamiliar pattern:

```ts
import type { Game } from 'boardgame.io';

export interface __PASCAL_NAME__G {
  // TODO: replace with real state.
  placeholder: boolean;
}

export const __SLUG__GameDef: Game<__PASCAL_NAME__G> = {
  setup: () => ({ placeholder: true }),

  moves: {
    // TODO: replace with real moves.
    noop: ({ G }) => {
      G.placeholder = !G.placeholder;
    },
  },

  turn: {
    minMoves: 1,
    maxMoves: 1,
  },

  // TODO: add endIf once there's a real win condition.
  // TODO: add playerView once there's hidden information (see
  // tech-stack.md's "Hidden information rule" and the conformance
  // suite's secretKeys option).
};
```

`index.ts` — same shape as `tictactoe/index.ts`, including its no-
`BoardComponent`-import comment (copied verbatim since the reason is
identical for every game, not Tic-Tac-Toe-specific):

```ts
import type { GameModule } from '../../types.js';
import { __SLUG__GameDef, type __PASCAL_NAME__G } from './gameDef.js';

// No BoardComponent import here -- this file is on the real-runtime import
// path for packages/server (via gamesCatalog.ts), and BoardComponent.tsx
// imports a real .css file Node cannot resolve. The board component is
// registered separately, in ../../boards.ts (client-only entry point).
export const __SLUG__Module: GameModule<__PASCAL_NAME__G> = {
  id: '__ID__',
  displayName: '__DISPLAY_NAME__',
  minPlayers: 2, // TODO: set real min/max players.
  maxPlayers: 2,
  gameDef: __SLUG__GameDef,
  // TODO: add settingsSchema if this game needs configurable room settings.
};

export type { __PASCAL_NAME__G } from './gameDef.js';
```

`BoardComponent.tsx` — deliberately inert but real (renders the
placeholder state and a button wired to the placeholder move, satisfying
spec.md AC7's "actually mounts and accepts a move" bar):

```tsx
import type { BoardProps } from '../../types.js';
import type { __PASCAL_NAME__G } from './gameDef.js';
import styles from './BoardComponent.module.css';

/**
 * Renders ONLY this game's play surface -- no player list, seat controls,
 * or presence indicators. See tech-stack.md's chrome/board split.
 */
export const __PASCAL_NAME__Board: React.FC<BoardProps<__PASCAL_NAME__G>> = ({
  G,
  isActive,
  moves,
}) => (
  <div className={styles.board}>
    {/* TODO: replace with the real board. */}
    <button type="button" disabled={!isActive} onClick={() => moves.noop?.()}>
      placeholder: {String(G.placeholder)}
    </button>
  </div>
);
```

`BoardComponent.module.css` — a single empty-ish `.board` class (copies
Tic-Tac-Toe's file's minimal structure, not its actual grid rules).

`gameDef.test.ts` — one real, passing assertion against the placeholder
move, so `npm run test:unit` has something to run and green immediately
(spec.md AC4):

```ts
import { describe, expect, it } from 'vitest';
import { Client } from 'boardgame.io/client';
import { __SLUG__GameDef } from './gameDef.js';

describe('__SLUG__ gameDef', () => {
  it('TODO: replace with real rules tests. Placeholder move toggles state.', () => {
    const client = Client({ game: __SLUG__GameDef, numPlayers: 2 });
    client.moves.noop!();
    expect(client.getState()?.G.placeholder).toBe(false);
  });
});
```

`Module.conformance.test.ts` — wired to the real conformance suite from
day one, `secretKeys: []` (no hidden information in the placeholder),
mirroring `tictactoeModule.conformance.test.ts` exactly:

```ts
import { testGameModuleConformance } from '../../../testing/conformance.js';
import { __SLUG__Module } from './index.js';

// TODO: update secretKeys once this game has hidden information.
testGameModuleConformance(__SLUG__Module, { secretKeys: [] });
```

## Generator script

`scripts/new-game.mjs` — plain Node (no dependencies beyond `fs`/`path`,
already used elsewhere; no `inquirer`/`commander`, per spec.md's non-goal
on interactive prompts), invoked via a new root `package.json` script:

```json
"new-game": "node scripts/new-game.mjs"
```

```
npm run new-game -- loveletters-v1 "Love Letter"
```

Logic, in order (each step's failure aborts before any file-write
happens — spec.md AC2/AC3/AC8 all require validation before write):

1. Read `process.argv` positional args: `id`, `displayName`. Both
   required; usage error printed and exit 1 if missing.
2. Validate `id` against `/^[a-z0-9-]+-v\d+$/` — rejects missing version
   suffix (AC2) and disallowed characters including path-traversal
   sequences like `..`/`/` (AC8), since `id` is used to build a filesystem
   path in step 4.
3. Derive `slug` (`id` with the trailing `-v\d+` stripped) and
   `pascalName` (`slug`, kebab-to-PascalCase).
4. Compute the target directory,
   `packages/game-core/src/games/<slug>/`, and check it does not already
   exist — abort with an error naming the colliding path if it does
   (AC3), before reading or writing anything else.
5. Read every file from `packages/game-core/templates/new-game/`,
   substitute all four tokens (plain `String.replaceAll`, no regex
   needed since tokens are unambiguous double-underscore-delimited
   literals), write each to the target directory under its real filename
   (`Module.conformance.test.ts` → `<slug>Module.conformance.test.ts`).
6. Print the checklist (AC6):

   ```
   Created packages/game-core/src/games/loveletters-v1/

   Before this game is playable, wire it into:

     1. packages/game-core/src/gamesCatalog.ts
        import { loveletersModule } from './games/loveletters/index.js';
        export const gamesCatalog: AnyGameModule[] = [tictactoeModule, loveletersModule];

     2. packages/game-core/src/boards.ts
        export { LoveletersBoard } from './games/loveletters/BoardComponent.js';

     3. packages/client/src/boardRegistry.ts
        'loveletters-v1': LoveletersBoard,

   Before picking a final id/version: read tech-stack.md's "Rules
   versioning strategy" and decide whether this is a parametric edition of
   an existing module or a genuinely new catalog entry.
   ```

No file I/O happens in step 6 beyond stdout — confirms spec.md AC5's "not
referenced anywhere" guarantee by construction, not by a separate check.

## File layout

```
packages/game-core/templates/new-game/
  gameDef.ts
  index.ts
  BoardComponent.tsx
  BoardComponent.module.css
  gameDef.test.ts
  Module.conformance.test.ts

scripts/
  new-game.mjs
  new-game.test.mjs   # see Testing strategy

package.json   # + "new-game" script
```

No changes to any existing `packages/game-core/src/**` file — the
template is new, additive content; `gamesCatalog.ts`/`boards.ts`/
`boardRegistry.ts` are read (by a developer, from the printed checklist)
but never written by this feature's own code.

## Testing / verification strategy

- `scripts/new-game.test.mjs` (Node's built-in test runner, or vitest run
  from the repo root against a temp directory — implementation detail to
  confirm against however this repo already runs root-level, non-workspace
  scripts, since none exist yet; if nothing does, plain `node --test` is
  the simplest option requiring no new devDependency) — covers:
  - Valid id + display name produces all six files with tokens correctly
    substituted (spec.md AC1).
  - Missing version suffix is rejected, no files written (AC2).
  - Colliding slug is rejected, no files written or overwritten (AC3) —
    seed a pre-existing dummy directory at the target path first.
  - Disallowed characters (spaces, `..`, `/`) rejected before any path is
    constructed (AC8) — assert no filesystem write occurs at all, not just
    that the command exits non-zero.
- Manual/CI verification for AC4: run the generator against a scratch id
  (e.g. `scratchtest-v1`) inside a throwaway branch/worktree, then run
  `npm run typecheck --workspace=packages/game-core` and
  `npm run test:unit --workspace=packages/game-core` against the result,
  confirm both pass, then delete the generated directory — this is the
  actual acceptance check for "the template compiles and its tests pass,"
  which a unit test of the generator script itself (above) cannot fully
  substitute for since it doesn't invoke `tsc`/`vitest`.
- AC5 (no existing file touched) — covered structurally by the plan (the
  script has no code path that opens `gamesCatalog.ts`/`boards.ts`/
  `boardRegistry.ts` for writing), plus a regression assertion in
  `new-game.test.mjs`: snapshot the mtime/content hash of those three
  files before running the generator, assert unchanged after.
- AC6 (checklist output) — `new-game.test.mjs` asserts the script's stdout
  contains the three file paths and the tech-stack.md pointer string.
- AC7 (placeholder game actually mounts) — covered by the same manual step
  as AC4: after generating into a scratch id, hand-add the three
  registration lines from the printed checklist, start the dev server, and
  confirm the placeholder board renders and the `noop` move is clickable
  and updates state, then revert the scratch registration and delete the
  generated directory.

## Open risks

1. **Kebab-to-PascalCase derivation for multi-word slugs** (e.g.
   `love-letters` → `LoveLetters`) is a small amount of string-parsing
   logic that has no precedent elsewhere in this codebase to copy from —
   flagged for a couple of extra unit-test cases in `new-game.test.mjs`
   beyond the single-word `loveletters` example used throughout this plan,
   since a hyphenated id is the more likely real input (e.g. Love Letter
   itself, feature 014).
2. **No devDependency currently runs standalone Node scripts under test**
   — `new-game.test.mjs`'s exact test runner is left as an implementation-
   time decision (see Testing strategy) rather than locked here, to avoid
   speculatively adding a devDependency this plan doesn't strictly need
   before confirming Node's built-in `node --test` is sufficient.
