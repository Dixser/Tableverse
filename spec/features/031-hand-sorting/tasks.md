# Feature 031 — Hand Sorting: Tasks

Ordered so that each step is verifiable on its own. Infrastructure first
(nothing else can be tested without it), then the pure layers bottom-up, then
the three wirings — Regicide first because it has the most existing component
coverage, so any fallout from adding a per-card grip surfaces immediately.

- [x] 1. `packages/game-core/vitest.setup.ts` — add feature 027's guarded
      `PointerEvent` polyfill, and `packages/game-core/package.json` — add
      `@dnd-kit/sortable`/`@dnd-kit/utilities` to `peerDependencies`,
      `peerDependenciesMeta` (optional) and `devDependencies`, mirroring the
      existing `@dnd-kit/core` treatment. Run `npm install`.
      **Verify:** `npm run test:unit --workspace=packages/game-core` still
      passes at its 557-test baseline (spec.md AC14, AC17).
      **Deviation from plan.md's first draft:** copying the client's polyfill
      verbatim broke every node-environment suite with
      `ReferenceError: MouseEvent is not defined`. The client's setup file gets
      away with `class PointerEventPolyfill extends MouseEvent` because that
      package is jsdom-wide; game-core defaults to `node` and opts into jsdom
      per file, so the setup file runs in both. The guard became
      `typeof globalThis.PointerEvent === 'undefined' && typeof globalThis.MouseEvent !== 'undefined'`.

- [x] 2. `packages/game-core/src/ui/handOrder.ts` — `reconcileOrder`, plus
      `handOrder.test.ts` covering an empty preference, a preserved custom
      order, an appended draw, a dropped play, a full-hand swap, a simultaneous
      play+draw, duplicate collapsing, and an empty hand.
      **Verify:** 10 tests pass in the `node` environment (spec.md AC1).

- [x] 3. `packages/game-core/src/ui/useHandOrder.ts` — the hook, plus
      `useHandOrder.test.tsx` (`// @vitest-environment jsdom`, `renderHook`)
      covering every state transition and rerenders that add and remove a card.
      **Verify:** 11 tests pass; `orderedHand.length === hand.length` holds
      through churn (spec.md AC2).

- [x] 4. `games/{regicide,crew,cahoots}/handSort.ts` + tests — Regicide's own
      `rankOrdinal` (not `cardValue`), Crew's double rocket-last rule, Cahoots'
      duplicate-copy determinism, and an `id.localeCompare` tiebreak in all six
      comparators, each asserted to be a total order.
      **Verify:** 23 tests pass in the `node` environment (spec.md AC3–AC5).

- [x] 5. `packages/client/src/i18n/locales/{en,es}.json` — the shared
      `handSort` namespace in both locales. Extend
      `games/regicide/i18nFixture.ts`; add new `games/{crew,cahoots}/i18nFixture.ts`.
      **Verify:** `localeParity.test.ts` passes (spec.md AC16).

- [x] 6. `packages/game-core/src/ui/` — `useHandSortSensors.ts` (8px
      `PointerSensor` + `KeyboardSensor`), `handSortA11y.ts` (localized
      announcements), `SortableCardSlot.tsx` + `.module.css` (the `handle`
      prop), `HandSortControls.tsx` + `.module.css` (presets, Reset, and a
      visually-hidden `aria-live` region).
      **Verify:** `npm run typecheck --workspace=packages/game-core` passes.
      **Deviation from plan.md's first draft:** the CSS sketch used
      `--color-surface-raised`, `--radius-sm` and `--font-size-sm`, none of
      which exist in this design system. Replaced with the real tokens
      (`--color-surface`, `--radius`, `--font-size-base`) after grepping
      `packages/client/src/styles/`.

- [x] 7. Regicide wiring — `BoardComponent.tsx` calls `useHandOrder` and passes
      `orderedHand` to both `HandView` and `DefendPanel`; `HandView.tsx` gains
      its own `DndContext` + `SortableContext` + `handle` slots + controls.
      Re-scope `HandView.test.tsx`'s positional `getAllByRole('button')` queries
      (the grips add a second button per card) and add the feature's own cases;
      add four board-level cases to `BoardComponent.test.tsx`.
      **Verify:** 146 → 155 Regicide tests pass, including "the grip stays
      enabled off-turn" and "an in-progress selection survives a reorder"
      (spec.md AC7, AC8, AC10, AC11).

- [x] 8. Crew wiring — same shape; `CommunicationPanel` receives `orderedHand`.
      New `HandView.test.tsx`, this game's first component test file.
      **Verify:** 8 tests pass, including "clicking a legal card plays it
      exactly once" (the 8px-constraint guard) and "the grip stays enabled on an
      illegal card" (spec.md AC7, AC9).

- [x] 9. Cahoots — `dragTarget.ts` + its test first, then the `onDragEnd`
      branch, the `handleDragStart` `canPlay` guard, and `HandView` as a
      `SortableContext` of `handle={false}` slots.
      **Verify:** 90 Cahoots tests pass (spec.md AC6, AC8, AC12, AC13).
      **Deviation from plan.md's first draft:** the first `resolveDragTarget`
      used `Number(overId.slice('pile-'.length))` with an
      `Number.isInteger(...) && >= 0` guard. The test for a bare `pile-`
      failed — `Number('')` is `0`, so it resolved to a real play on pile 0.
      Replaced with an explicit `/^pile-(\d+)$/` match.
      **Second deviation:** the first draft of `HandView.test.tsx` asserted the
      Cahoots hand contains no `role="button"` elements at all. dnd-kit puts
      `role="button"` on whichever node is the drag activator, which here is the
      card slot itself — correct and wanted for keyboard drag. The assertion was
      rewritten to check that the activator *contains* the card and has no
      nested activator, which is the actual distinction from Regicide/Crew.

- [x] 10. `spec/features/031-hand-sorting/{spec.md,plan.md,tasks.md}`.

- [ ] 11. Full verification sweep — see below.

## Verification record

- `npm run typecheck` passes in `packages/game-core`, `packages/client` and
  **`packages/server`** — the layering guard (spec.md AC15). `grep "ui/"
  packages/game-core/src/index.ts` returns nothing.
- `npm run test:unit --workspace=packages/game-core`: **70 files, 637 tests
  passing** (baseline before this feature: 61 files, 557 tests).
- `npm run test:unit --workspace=packages/client`: **23 files, 241 tests
  passing**, including `localeParity.test.ts` and feature 027's
  `dndKitSmoke.test.tsx` (whose 10px pointer move still clears the new 8px
  activation threshold — spec.md AC17).
- `npm run lint`: 2 errors, both pre-existing and in files this feature does not
  touch (`packages/client/src/boardRegistry.ts`'s `no-explicit-any`, and
  `games/loveletter/PrivateRevealToast.tsx`'s reference to the unconfigured
  `react-hooks/exhaustive-deps` rule). No new lint problems introduced.
