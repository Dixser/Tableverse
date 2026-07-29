# Feature 027 — dnd-kit Library Integration: Tasks

Dependency install first (nothing to test without it), then the smoke
test that proves it works in this project's real toolchain, then
whole-workspace verification that nothing else broke.

- [x] 1. `npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities -w packages/client`
      from the repo root, per plan.md.
      **Verify:** `packages/client/package.json` lists all three under
      `dependencies`; `packages/game-core/package.json` and
      `packages/server/package.json` are untouched; `package-lock.json`
      is updated (spec.md AC1/AC2).
- [x] 2. `packages/client/src/dnd/dndKitSmoke.test.tsx` — the inline
      `DndContext`/`useDraggable`/`useDroppable` smoke test from plan.md,
      simulating a `pointerdown → pointermove → pointerup` sequence and
      asserting `onDragEnd` fires once with the correct `active.id`.
      **Verify:** `npm run test:unit --workspace=packages/client` passes,
      including this new test, with zero change to any existing test's
      outcome (spec.md AC4/AC5).
      **Deviation from plan.md's first draft:** the test initially failed
      with `onDragEnd` never firing. Traced to `jsdom` having no native
      `PointerEvent` constructor at all, which dnd-kit's default
      `PointerSensor` activator silently rejects (`!event.isPrimary`).
      Fixed at the shared-infrastructure level, not per-test — see task 3
      (spec.md AC7, new after this was discovered).
- [x] 3. `packages/client/vitest.setup.ts` — added the guarded
      `PointerEvent` polyfill from plan.md's "Discovered blocker" section,
      so every future game's dnd-kit-based test benefits, not just this
      feature's smoke test.
      **Verify:** `dndKitSmoke.test.tsx` passes with the polyfill in
      place (confirmed it fails without it, by temporarily stashing the
      polyfill and re-running — genuinely load-bearing, not incidental).
- [x] 4. `npm run typecheck --workspace=packages/client` and
      `npm run build --workspace=packages/client` (via `npx tsc --noEmit`
      / `npx vite build`).
      **Verify:** both succeed with the new dependency present (spec.md
      AC3). One typecheck fix needed along the way: destructured
      `onDragEnd.mock.calls[0]` instead of double-indexing, since
      `noUncheckedIndexedAccess` flags `calls[0][0]` as possibly
      `undefined`.
- [x] 5. `git status`/`git diff --stat` reviewed by hand.
      **Verify:** the change set is exactly
      `packages/client/package.json`, `packages/client/vitest.setup.ts`,
      `package-lock.json`, `packages/client/src/dnd/dndKitSmoke.test.tsx`,
      and this feature's own `spec/features/027-dnd-kit-integration/`
      docs — no file under any existing `GameModule`, `gameMount`,
      `room`, or `App.tsx` touched (spec.md AC6).
- [x] 6. Ran the full `packages/client` test suite (not just the new
      file) to confirm no regression. Result: 42 pre-existing failures in
      `RoomShell.test.tsx` (feature-026-era "Next Level" cases), confirmed
      **unrelated** to this branch — reproduced identically on a clean
      `main` checkout (via a temporary `git stash`, re-run, then
      `git stash pop` to restore this feature's work) before and after
      this feature's changes. Not this feature's regression; not fixed
      here, since it's out of this feature's scope.
