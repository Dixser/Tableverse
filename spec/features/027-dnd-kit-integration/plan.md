# Feature 027 — dnd-kit Library Integration: Implementation Plan

## Dependency install

Run from the repo root, using npm workspaces' `-w` flag so the dependency
lands only in `packages/client/package.json` (per spec.md AC2, `game-core`
and `server` must be untouched):

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities -w packages/client
```

This adds all three to `dependencies` (not `devDependencies`) — verified
against `packages/client/package.json` after the install, since npm's
default is `dependencies` but it's worth confirming rather than assuming
(spec.md AC1).

## Smoke test: proving a real drag completes under this project's jsdom

`packages/client/src/dnd/dndKitSmoke.test.tsx` — new file, new directory.
Everything in it is defined **inside the test file**, not exported from a
separate component module, per spec.md's "verification is a test-only
fixture, not a demo feature" decision:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/core';

function SmokeDraggable() {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: 'smoke-drag-item' });
  return (
    <button ref={setNodeRef} {...listeners} {...attributes}>
      drag me
    </button>
  );
}

function SmokeDroppable() {
  const { setNodeRef } = useDroppable({ id: 'smoke-drop-zone' });
  return <div ref={setNodeRef}>drop zone</div>;
}

describe('dnd-kit toolchain smoke test', () => {
  it('completes a pointer drag and fires onDragEnd with the correct ids', () => {
    const onDragEnd = vi.fn();
    const { getByText } = render(
      <DndContext onDragEnd={onDragEnd}>
        <SmokeDraggable />
        <SmokeDroppable />
      </DndContext>,
    );

    const handle = getByText('drag me');
    fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 10, clientY: 10, pointerId: 1 });

    expect(onDragEnd).toHaveBeenCalledTimes(1);
    const event = onDragEnd.mock.calls[0][0] as DragEndEvent;
    expect(event.active.id).toBe('smoke-drag-item');
    // `over` depends on real layout/hit-testing, which jsdom does not
    // provide (getBoundingClientRect() is always zero-sized) — see "Open
    // risks" below for why the id-level assertion above, not `over`, is
    // this test's actual correctness bar.
  });
});
```

**Why this specific assertion bar, not "drops onto the droppable":**
dnd-kit's default collision detection (`rectIntersection`) compares
`getBoundingClientRect()` output between the active draggable and every
droppable, and `jsdom` always reports zero-sized rects — no real layout
engine runs in `jsdom`. This means `event.over` cannot reliably be
asserted as the smoke droppable's id in this environment, through no fault
of the library. What *can* be proven, and is the thing actually worth
proving before a real game is built — is that dnd-kit's `PointerSensor`
correctly recognizes the `pointerdown → pointermove → pointerup` sequence
as a drag at all (activating past its distance/delay constraint) and
fires `onDragEnd` with the dragged element's `active.id` intact. That is
the toolchain-compatibility question this feature exists to answer; hit
detection accuracy is a `jsdom` limitation orthogonal to it, and a future
game's own component tests (real DOM in a real browser via e2e, or
`over`-agnostic assertions like this one) will be the right place to
verify drop-target behavior once a real game has real layout to test
against.

## Discovered blocker: jsdom has no `PointerEvent` at all

Running the smoke test above as originally written failed with
`onDragEnd` never firing. Root cause, traced by hand
(`node_modules/@dnd-kit/core/dist/core.esm.js`'s `PointerSensor.activators`):
the activator handler rejects any event where `!event.isPrimary`, and
`fireEvent.pointerDown(...)` under this project's `jsdom` (via
`@testing-library/dom`'s `createEvent`) was silently constructing a plain
`Event`, not a `PointerEvent` — because **`jsdom` does not define a global
`PointerEvent` constructor at all** (confirmed directly:
`typeof PointerEvent === 'undefined'` inside a Vitest test). This is not a
partial-support gap (e.g. missing `getCoalescedEvents()`); the constructor
itself is absent.

Since dnd-kit's *default* sensor set is `[PointerSensor, KeyboardSensor]`,
every future game's own tests would hit this identically the first time
they simulate a drag — not just this feature's smoke test. The fix
belongs in the shared `vitest.setup.ts` (existing shared test
infrastructure, already the home of the `@testing-library/jest-dom`
setup and the i18n init), not worked around per-test or per-game:

```ts
// jsdom has no native PointerEvent constructor. Minimal polyfill — only
// the fields dnd-kit's PointerSensor (event.isPrimary, pointerId) and
// similar pointer-aware code read, not a full spec implementation.
if (typeof globalThis.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    public pointerId: number;
    public width: number;
    public height: number;
    public pressure: number;
    public tangentialPressure: number;
    public tiltX: number;
    public tiltY: number;
    public twist: number;
    public pointerType: string;
    public isPrimary: boolean;

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.width = params.width ?? 1;
      this.height = params.height ?? 1;
      this.pressure = params.pressure ?? 0;
      this.tangentialPressure = params.tangentialPressure ?? 0;
      this.tiltX = params.tiltX ?? 0;
      this.tiltY = params.tiltY ?? 0;
      this.twist = params.twist ?? 0;
      this.pointerType = params.pointerType ?? 'mouse';
      this.isPrimary = params.isPrimary ?? true;
    }
  }

  // @ts-expect-error -- jsdom's lib.dom types declare PointerEvent but the runtime never defines it
  globalThis.PointerEvent = PointerEventPolyfill;
}
```

Guarded by the `typeof` check so it is a no-op the moment a future `jsdom`
upgrade adds real support, rather than silently shadowing it forever.
`isPrimary` defaults to `true` (matching every realistic single-mouse
synthetic-event test) rather than requiring every call site to pass it,
though the smoke test still passes it explicitly for documentation value.

## File layout

```
packages/client/
  package.json                        # + @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities
  vitest.setup.ts                      # + guarded PointerEvent polyfill (see "Discovered blocker" above)
  src/dnd/
    dndKitSmoke.test.tsx               # new — test-only, no exported component
package-lock.json                      # updated by npm install
```

No other file changes anywhere in the repo.

## Testing / verification strategy

- `npm run typecheck --workspace=packages/client` — confirms the new
  dependency's types resolve cleanly under this repo's strict TypeScript
  config (spec.md AC3).
- `npm run build --workspace=packages/client` — confirms Vite can bundle
  the dependency (spec.md AC3).
- `npm run test:unit --workspace=packages/client` — runs the new smoke
  test alongside the full existing suite; the bar is "all pass, including
  the new one," not just "the new one passes in isolation" (spec.md AC5).
- `git diff --stat` against this branch's base — confirms the change set
  is exactly `package.json` + lockfile + the one new test file + this
  feature's own `spec/features/027-dnd-kit-integration/` docs, nothing
  under any existing `GameModule`, `gameMount`, `room`, or `App.tsx`
  (spec.md AC6).

## Open risks

1. **`jsdom`'s lack of real layout means this smoke test cannot validate
   hit-testing/collision detection**, only sensor activation and
   `active.id` propagation — see "Why this specific assertion bar" above.
   A future game's own board tests may need either a different assertion
   strategy (asserting on state changes a drag *should* cause, rather than
   on `over` directly) or e2e coverage (Playwright, already part of this
   repo's testing strategy per tech-stack.md) for real drop-target
   correctness. Flagged here so a future contributor doesn't assume this
   smoke test proves more than it does.
2. **Which sensor(s) a real game should configure (`PointerSensor` alone
   vs. adding `TouchSensor`/`KeyboardSensor` for accessibility) is
   intentionally left undecided** — per spec.md's non-goals, that decision
   depends on the specific interaction a future game needs and is not
   guessed at here.
3. **The `vitest.setup.ts` `PointerEvent` polyfill is intentionally
   minimal** (the fields dnd-kit's sensors read, not a spec-complete
   implementation — no `getCoalescedEvents()`, no real
   `pointerType`/pressure semantics beyond static defaults). If a future
   game's test needs a pointer-event field this polyfill doesn't provide,
   extend it in place rather than adding a second, competing polyfill
   elsewhere.
