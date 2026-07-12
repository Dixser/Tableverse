# Feature 011 — Game Module Scaffolding: Tasks

Template files first (nothing to generate without them), then the
generator script that consumes them, then the script's own unit tests,
then end-to-end manual verification that a generated module is actually
usable.

- [x] 1. `packages/game-core/templates/new-game/` — create the six
      template files (`gameDef.ts`, `index.ts`, `BoardComponent.tsx`,
      `BoardComponent.module.css`, `gameDef.test.ts`,
      `Module.conformance.test.ts`) with the four `__ID__`/`__SLUG__`/
      `__DISPLAY_NAME__`/`__PASCAL_NAME__` placeholder tokens, per
      plan.md's "Template contents".
      **Verify:** the directory sits outside both `tsconfig.json`'s
      `include` and `vitest.config.ts`'s `include` globs (confirmed by
      running `npm run typecheck --workspace=packages/game-core` and
      `npm run test:unit --workspace=packages/game-core` before this
      task's files exist vs. after, and seeing no change in either run —
      the template must be inert to both).
- [x] 2. `scripts/new-game.mjs` — the six-step generator (parse args →
      validate `id` shape (spec.md AC2/AC8) → derive `slug`/`pascalName`
      → check target-directory collision (AC3) → copy+substitute template
      files (AC1) → print the three-registration-point checklist plus the
      versioning-heuristic reminder (AC6)), per plan.md. Add
      `"new-game": "node scripts/new-game.mjs"` to the root
      `package.json`.
      Deviates from plan.md in one respect: `__SLUG__` is substituted
      into the templates as a camelCase identifier (`camelSlug`, e.g.
      `loveLetters`), not the raw kebab `slug` (e.g. `love-letters`).
      The plan's token table used a single-word example throughout, but
      `__SLUG__` is substituted directly into JS identifier positions
      (`__SLUG__Module`, `__SLUG__GameDef`) in every template file —
      a kebab slug there produces invalid JS syntax for any multi-word
      id (exactly the shape Love Letter, features 014/015, needs). The
      true kebab `slug` is still used for the directory name and the
      import paths printed in the checklist, where hyphens are valid.
      **Verify:** manual smoke run with a scratch id, inspect stdout and
      generated files by hand before writing automated tests. Confirmed
      all four error paths (missing args, missing version suffix,
      collision, path-traversal/disallowed characters) reject before
      writing, and that a hyphenated id (`love-letters-v2`) produces
      valid identifiers.
- [x] 3. `scripts/new-game.test.mjs` — covers spec.md AC1 (valid
      generation, correct substitution in all six files, plus a
      multi-word/hyphenated-slug case), AC2 (missing `-v<N>` suffix
      rejected, no files written), AC3 (colliding slug rejected,
      pre-existing directory untouched), AC8 (spaces/`..`/`/` rejected
      before any path is constructed), AC5 (`gamesCatalog.ts`/
      `boards.ts`/`boardRegistry.ts` content hash unchanged after a run),
      and AC6 (checklist output contains the three file paths and the
      tech-stack.md pointer). Used Node's built-in `node --test` runner
      (plan.md's open risk 2's simplest option — no new devDependency).
      **Verify:** all 7 tests pass (`node --test scripts/new-game.test.mjs`).
      Re-ran with the AC3 collision guard temporarily disabled and
      confirmed the AC3 test fails without it, then restored the guard
      and confirmed all tests pass again.
- [x] 4. Manual end-to-end verification (spec.md AC4, AC7): generated
      `scratchtest-v1`, ran `npm run typecheck --workspace=packages/game-core`
      and `npm run test:unit --workspace=packages/game-core` against the
      result with zero hand-edits (both passed, including the two new
      generated test files). Hand-added the three checklist registration
      lines, started the server + client dev servers, created a room,
      selected Scratch Test, filled both seats (via the room's "allow
      multiple seats per player" option, since minPlayers=2), started
      the match, confirmed the placeholder board mounted showing
      `placeholder: true`, clicked it, and confirmed it flipped to
      `placeholder: false` with the turn advancing. Reverted the three
      scratch registration edits and deleted the generated
      `scratchtest-v1` directory afterward.
- [x] 5. Ran `test:unit` and `typecheck` across every workspace — all pass,
      no regressions. Also ran `npm run lint`; the only findings are
      pre-existing issues in files this feature does not touch
      (`packages/client/src/boardRegistry.ts`,
      `packages/server/src/index.ts`). Added a small `eslint.config.js`
      override (Node `process`/`console` globals for `scripts/**/*.mjs`)
      since the new generator script is plain JS outside any
      `tsconfig.json` project and would otherwise fail `no-undef`.
