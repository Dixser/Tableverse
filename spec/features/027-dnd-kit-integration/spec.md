# Feature 027 — dnd-kit Library Integration

## Description

Adds [`@dnd-kit`](https://dndkit.com/) (`@dnd-kit/core`, `@dnd-kit/sortable`,
`@dnd-kit/utilities`) as a dependency of `packages/client`, and proves it
actually works end-to-end in this project's real toolchain (Vite build,
strict TypeScript, Vitest under `jsdom`) before any game is built on top of
it.

No current `GameModule` needs drag-and-drop today — Tic-Tac-Toe, Love
Letter, The Mind, Regicide, and Crew are all click/tap-to-select
interactions, not drag interactions. This feature is deliberately scoped to
**library plumbing only**: get the dependency in, confirm it typechecks and
builds, and confirm a real drag interaction (pointer down → move → up)
actually completes and fires `onDragEnd` under this repo's specific test
environment. It does **not** wire drag-and-drop into any existing game and
does **not** build a reusable drag/drop wrapper component — per
tech-stack.md's "Game module contract," `BoardComponent` is the only place
game-specific interaction code belongs, and per the precedent set by
feature 009 (gameover banner) and feature 015 (board UI kit), a shared
abstraction is extracted from **two real consumers**, never designed
speculatively ahead of the first one. The first real consumer is future
work: a specific game will be named next, and that game's own
`BoardComponent` will import `@dnd-kit` directly.

The one thing worth de-risking now, rather than discovering it mid-feature
later, is the test environment: dnd-kit's default sensor listens for
`PointerEvent`s, and `jsdom` (this project's Vitest environment) turns out
to have no native `PointerEvent` constructor at all — confirmed by
building this feature's own smoke test, not assumed up front (see
"Resolved design decisions"). A small internal-only smoke test (not a
product component — never imported by `App.tsx`, `RoomShell`, `GameMount`,
or any `GameModule`) exercises a real `DndContext` drag end-to-end to
confirm the toolchain, not just the library, is ready — and the fix that
makes it pass (a `vitest.setup.ts` polyfill) benefits every future game's
tests too, not just this one.

## Resolved design decisions

- **Packages added: `@dnd-kit/core`, `@dnd-kit/sortable`,
  `@dnd-kit/utilities`.** `sortable` and `utilities` are included alongside
  `core` even though nothing uses them yet, because the most likely first
  real consumer (a card game reordering a hand) needs `useSortable` /
  `arrayMove`, and all three are published and versioned together as one
  coherent API surface — splitting them across separate features would just
  mean re-running this same "does it work in our toolchain" check twice for
  no benefit.
- **Added to `packages/client` only, never `packages/game-core`.**
  tech-stack.md is explicit that `game-core` has zero dependency on React;
  `@dnd-kit` is a React hooks library, so it can only ever be consumed by a
  `BoardComponent`, which lives in `packages/client`'s board tree (or
  `game-core`'s `boards.ts` re-export, itself client-only — see feature
  011's "why three, not one" registration-point split). `packages/server`
  never touches it either.
- **No platform-level wrapper, hook, or shared `<Draggable>`/`<Sortable>`
  component is added.** This mirrors feature 009's and feature 011's own
  non-goals: a shared abstraction is extracted from two real
  `BoardComponent` implementations that need overlapping behavior, not
  designed ahead of the first one. Until a real game uses it, any wrapper
  built now would be a guess at the wrong shape.
- **Verification is a test-only smoke fixture, not a demo feature.** The
  smoke test's `DndContext`/draggable/droppable elements are defined
  inline inside the test file itself (not a separate `.tsx` component
  module), so it is structurally impossible for it to be imported by, or
  mistaken for, real product code — matching this feature's "plumbing
  only" scope.

## User stories

### 1. A future game's `BoardComponent` can import dnd-kit and it just works

As a developer building a future game that needs drag-and-drop (e.g.
reordering a hand of cards, or dragging a piece onto a board cell), I can
`import { DndContext, useDraggable, useDroppable } from '@dnd-kit/core'`
(or the `sortable`/`utilities` equivalents) directly inside that game's own
`BoardComponent`, with no platform wiring required beyond what any other
client dependency already needs — because this feature has already
confirmed the library resolves, typechecks, builds, and drags correctly in
this project's actual environment.

### 2. The toolchain gap is caught now, not mid-feature later

As a developer, if `jsdom`'s `PointerEvent`/layout support were too
incomplete for dnd-kit's default sensor to work in this project's Vitest
setup, I find that out from this feature's own smoke test failing — with a
small, isolated, easy-to-debug fixture — rather than discovering it while
deep inside a real game's test suite later, with real game logic
entangled in the failure.

### 3. Nothing about the current app changes

As a player or host using any of the platform's existing games today, this
feature has zero visible or behavioral effect — no `BoardComponent`, no
`RoomShell`/chrome file, and no `GameModule` is modified.

## Acceptance criteria

1. `packages/client/package.json` lists `@dnd-kit/core`, `@dnd-kit/sortable`,
   and `@dnd-kit/utilities` as dependencies (not `devDependencies` — a
   future `BoardComponent` will import them at runtime), and the root
   lockfile reflects the install.
2. `packages/game-core/package.json` and `packages/server/package.json`
   are unchanged — the dependency is added to `packages/client` only.
3. `npm run typecheck --workspace=packages/client` and
   `npm run build --workspace=packages/client` both succeed with the new
   dependency present.
4. A test-only smoke fixture, defined inline in its own test file (not a
   separate reusable component), mounts a real `DndContext` with one
   draggable and one droppable element, simulates a pointer-down →
   pointer-move → pointer-up sequence via
   `@testing-library/react`/`fireEvent`, and asserts `onDragEnd` fires with
   the correct `active.id`/`over.id` pair — proving a real drag completes
   under this project's actual `jsdom`-based Vitest environment, not just
   that the library compiles.
5. `npm run test:unit --workspace=packages/client` passes, including the
   new smoke test, with no change to any existing test's pass/fail
   outcome.
6. No file under `packages/game-core/src/games/**` (any existing
   `GameModule`), `packages/client/src/gameMount/**`, `packages/client/src/room/**`,
   or `packages/client/src/App.tsx` is modified by this feature — grep/diff
   confirms the change set is limited to `package.json`/lockfile, the
   shared `vitest.setup.ts`, and the new smoke test file (and this
   feature's own docs).
7. `jsdom` (this project's Vitest environment) has no native `PointerEvent`
   constructor at all, which is discovered, not assumed, by this feature:
   without it, dnd-kit's default `PointerSensor` (which requires
   `event.isPrimary`) never activates, so any future game's own tests
   would hit this identically. `vitest.setup.ts` gains a minimal
   `PointerEvent` polyfill (guarded by `typeof globalThis.PointerEvent ===
   'undefined'`) so the smoke test — and every future `BoardComponent`
   test that uses dnd-kit's default sensor — works without each game
   needing to rediscover and work around this itself.

## Non-goals

- Wiring drag-and-drop into any existing game (Tic-Tac-Toe, Love Letter,
  The Mind, Regicide, Crew) — none of them need it today; this is pure
  library plumbing ahead of a named future game.
- A reusable `<Draggable>`/`<Sortable>` wrapper component, hook, or any
  other platform-level drag-and-drop abstraction in `packages/client` —
  deferred until a second real `BoardComponent` consumer exists to
  generalize from, per the precedent in "Resolved design decisions" above.
- Touch-specific sensor tuning, keyboard-accessible drag activation, or a
  chosen collision-detection strategy — all depend on the specific
  interaction a future game needs and are out of scope for a
  library-plumbing feature with no real consumer yet.
- Any change to `packages/game-core` or `packages/server` — `@dnd-kit` is a
  client-only, React-only dependency per tech-stack.md's "no React in
  game-core" rule.
- Any visible product UI, demo page, or Storybook-style showcase of
  dnd-kit — the smoke test exists purely to validate the toolchain, not to
  ship a feature a user can see.
