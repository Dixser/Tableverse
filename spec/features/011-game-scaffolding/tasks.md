# Feature 011 — Game Module Scaffolding: Tasks

Template files first (nothing to generate without them), then the
generator script that consumes them, then the script's own unit tests,
then end-to-end manual verification that a generated module is actually
usable.

- [ ] 1. `packages/game-core/templates/new-game/` — create the six
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
- [ ] 2. `scripts/new-game.mjs` — the six-step generator (parse args →
      validate `id` shape (spec.md AC2/AC8) → derive `slug`/`pascalName`
      → check target-directory collision (AC3) → copy+substitute template
      files (AC1) → print the three-registration-point checklist plus the
      versioning-heuristic reminder (AC6)), per plan.md. Add
      `"new-game": "node scripts/new-game.mjs"` to the root
      `package.json`.
      **Verify:** manual smoke run with a scratch id, inspect stdout and
      generated files by hand before writing automated tests.
- [ ] 3. `scripts/new-game.test.mjs` — covers spec.md AC1 (valid
      generation, correct substitution in all six files), AC2 (missing
      `-v<N>` suffix rejected, no files written), AC3 (colliding slug
      rejected, pre-existing directory untouched), AC8 (spaces/`..`/`/`
      rejected before any path is constructed), AC5 (`gamesCatalog.ts`/
      `boards.ts`/`boardRegistry.ts` content hash unchanged after a run),
      and AC6 (stdout contains the three file paths and the
      tech-stack.md pointer). Exact test runner (`node --test` vs. a
      vitest project) decided at this step, per plan.md's open risk 2.
      **Verify:** all new tests pass; re-run against a deliberately
      broken generator (e.g. temporarily skip the collision check) to
      confirm the AC3 test actually fails without the guard, not just
      that it passes with it.
- [ ] 4. Manual end-to-end verification (spec.md AC4, AC7): generate a
      scratch module (e.g. `scratchtest-v1`), run
      `npm run typecheck --workspace=packages/game-core` and
      `npm run test:unit --workspace=packages/game-core` against the
      result with zero hand-edits, then hand-add the three checklist
      registration lines, start the dev server, confirm the placeholder
      board mounts in a real room and the `noop` move is clickable and
      updates state. Revert the three scratch registration edits and
      delete the generated `scratchtest-v1` directory afterward — this
      feature must leave no trace of the scratch run in the repo.
- [ ] 5. Run `test:unit` and `typecheck` across every workspace to confirm
      the new template/script/root `package.json` script introduce no
      regressions elsewhere in the monorepo.
