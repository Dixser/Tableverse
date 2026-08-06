# Feature 031 — Hand Sorting: Implementation Plan

## Two layers, three consumers

| Layer | Lives in | Knows about |
|---|---|---|
| Ordering state | `src/ui/handOrder.ts`, `src/ui/useHandOrder.ts` | Card ids only — never a suit, rank, or colour |
| Drag/sort UI | `src/ui/SortableCardSlot.tsx`, `HandSortControls.tsx`, `useHandSortSensors.ts`, `handSortA11y.ts` | dnd-kit and i18n — never a specific game |
| Comparators | `games/<game>/handSort.ts` | That game's `Card` shape only |
| Wiring | each `BoardComponent.tsx` / `HandView.tsx` | Both, plus that game's own rules |

The split is forced by the card types: Regicide's `Card` is a discriminated
union where a Jester has neither suit nor rank, Crew's is `{ suit, rank }` with
a trump suit, Cahoots' is `{ color, number }` with duplicate copies. Nothing
generic can sort all three, so `applySort` takes a comparator and each game
supplies its own. What *is* generic is the ordering itself, which only ever
manipulates a list of ids.

## The reconciliation rule

`reconcileOrder(preferred, actual)` is the whole of the state model:

- keep every id in `preferred` that is still in `actual`, in `preferred`'s order;
- append ids in `actual` not in `preferred`, in server order;
- drop the rest; collapse duplicates.

`useHandOrder` calls it on **every render** rather than in a `useEffect`, so a
draw or a play shows up in the same paint. `preferred` is only a preference; the
server hand is the truth about membership. Both actions (`moveCard`, `applySort`)
write back from the already-reconciled order, which prunes stale ids as a side
effect.

Seat switching needs no special case: card ids are unique per deck in all three
games, so switching seats makes every remembered id absent and the function
falls through to pure server order.

A memo key of the hand's joined ids stands in for `hand` itself, since boards
re-render on every server state push with a fresh array object.

## Why Regicide and Crew need a drag grip and Cahoots does not

The deciding detail is in the existing `CardTile`s, not in dnd-kit:

```tsx
// regicide/CardTile.tsx and crew/CardTile.tsx
<button type="button" onClick={onClick} disabled={disabled || !onClick} …>
```

Off-turn those boards pass no `onClick`, so the card is a natively **disabled**
`<button>`. A disabled control dispatches no pointer events and does not bubble
them — making the card its own drag activator would leave it undraggable exactly
when a waiting player wants to tidy up. `SortableCardSlot`'s `handle` prop exists
for this: `handle` renders an always-enabled grip wired to `setActivatorNodeRef`,
`handle={false}` spreads the listeners on the slot itself.

The grip also resolves a keyboard collision. `KeyboardSensor` activates on
Space/Enter on the activator; on a Crew card button that already means *play this
card*, which would be an unrecoverable double action.

Cahoots' `CardTile` is an inert `<div>` — no click semantics to collide with —
and its drag must be able to land on a pile, so the whole slot is the activator.

## Sensors

One shared config (`useHandSortSensors`), used by all three:

```ts
useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
```

The 8px threshold is what lets a card be both clickable and draggable. It is a
behaviour change for Cahoots (which shipped with the unconstrained defaults) and
is called out in spec.md as such. Feature 027's `dndKitSmoke.test.tsx` fires a
10px move, so it still clears the threshold.

## Cahoots' two-meaning drag

`resolveDragTarget(overId, handCardIds)` in `cahoots/dragTarget.ts` is the one
place a drop's meaning is decided:

- `pile-{digits}` → `{ kind: 'pile', pileIndex }`
- an id present in this hand → `{ kind: 'reorder', overCardId }`
- anything else → `{ kind: 'none' }`

Matched with `/^pile-(\d+)$/` rather than `Number(overId.slice(5))`, because
`Number('')` is `0` — a bare `pile-` would otherwise resolve to a real play on
pile 0. (Caught by the test, not by inspection.)

Extracted as a pure function specifically because jsdom reports zero-sized
rects, so a simulated drag cannot reliably produce an `over` at all — feature
027's plan.md documents this. Every branch of "what does this drop mean" is
therefore covered in the `node` environment, and the component tests cover the
deterministic path (the sort buttons) plus the presence and enabled-ness of the
drag affordances.

In `onDragEnd`, `reorder` is handled first and **outside** the `canPlay` gate.
`onDragStart` gains a `canPlay ? card : null` guard so an off-turn reorder drag
doesn't light up all four piles with a promise it can't keep.

## Secondary consumers

Regicide's `DefendPanel` and Crew's `CommunicationPanel` render the same hand
array and receive `orderedHand`. Showing one order in the hand and a different
one in a panel directly beneath it would be worse than having no feature. Both
are order-independent internally (a `reduce` sum; `filter`/`every` predicates),
so this is a pure display change.

## Files

**New** — `packages/game-core/src/ui/`: `handOrder.ts`, `useHandOrder.ts`,
`useHandSortSensors.ts`, `handSortA11y.ts`, `SortableCardSlot.tsx` + `.module.css`,
`HandSortControls.tsx` + `.module.css`, and tests for the first two.
`games/{regicide,crew,cahoots}/handSort.ts` + tests.
`games/cahoots/dragTarget.ts` + test. `games/{crew,cahoots}/i18nFixture.ts`.
`games/{crew,cahoots}/HandView.test.tsx`, `games/cahoots/BoardComponent.test.tsx`.

**Modified** — `packages/game-core/package.json`, `vitest.setup.ts`;
`games/{regicide,crew,cahoots}/{BoardComponent,HandView}.tsx`;
`games/cahoots/HandView.module.css`; `games/regicide/i18nFixture.ts`;
`games/regicide/{HandView,BoardComponent}.test.tsx`;
`packages/client/src/i18n/locales/{en,es}.json`.

## Testing / verification strategy

Node-environment unit tests carry the logic: reconciliation, all six
comparators, and every `resolveDragTarget` branch. jsdom component tests carry
the wiring: that grips exist and stay enabled when cards do not, that presets
reorder the DOM without sending a move, that a click still lands, and that
Regicide's selection survives a sort.

No test asserts that a *simulated pointer drag* lands on a specific target —
jsdom has no layout, so `over` is unreliable. That is stated as an explicit
non-goal of the test plan, not an oversight.

## Open risks

1. **Someone later "simplifies" the grip away** in Regicide/Crew, silently
   killing off-turn reordering. Mitigated by a test asserting the grip is
   enabled while the card is disabled, and by a comment at the prop definition.
2. **Someone swaps Cahoots to `closestCenter`**, turning empty-space drops into
   pile plays. Mitigated by a note in spec.md and a comment in the board.
3. **Drawn cards appending at the end** will be reported as a bug by someone.
   It is deliberate and documented; the presets are the escape hatch.
4. **A hand can change mid-drag** (a teammate's move triggers a Cahoots draw).
   Reconciliation runs every render so the ordering stays sound; if the dragged
   card itself leaves the hand, its sortable node unmounts and dnd-kit cancels
   the drag. No code needed.

## Implementation-level non-goals

- No `DragOverlay` for any game (029's dim-in-place presentation is unchanged).
- No shared `CardTile` — only the *behavioural* wrapper is shared; the
  presentational tiles stay per-game, per feature 029's convention.
- No touch-specific sensor tuning beyond the shared 8px constraint.
