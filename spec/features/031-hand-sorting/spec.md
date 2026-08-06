# Feature 031 — Hand Sorting

## Description

Every card hand in this codebase renders in raw server array order. `HandView`
receives `G.hands[playerID]` and maps over it directly, in all five games that
have a hand — no game sorts, filters, or reorders at render time. That array is
the deal order, and it only ever changes the way the rules change it: a drawn
card is `push`ed onto the end (`cahoots/gameDef.ts`'s `playCard`,
`regicide/gameDef.ts`'s refill), a played card is `splice`d out. A player who
wants their suits grouped, or their high cards together, cannot have it.

This feature adds a per-player, purely cosmetic arrangement of one's own hand:
drag any card to any position, plus one-click presets to sort by suit/colour or
by rank/number. It is entirely client-side. Nothing here is written to `G`, sent
as a move, or visible to any other player — the hand is a secret anyway (every
consuming game lists `hands` as a conformance `secretKey`), so there is nothing
for the server to arbitrate. The server stays the sole authority over which
cards are in the hand; the client only decides what order to draw them in.

Feature 027 installed `@dnd-kit/sortable` and `@dnd-kit/utilities` ahead of any
consumer, stating the reason outright: *"the most likely first real consumer (a
card game reordering a hand) needs `useSortable` / `arrayMove`"*
(`spec/features/027-dnd-kit-integration/spec.md`). Feature 029 then made Cahoots
the first `@dnd-kit/core` consumer, but left both other packages unused. This is
the consumer they were installed for.

It is also the first feature entitled to build a shared drag abstraction. 027
and 029 both declined to, on this repo's standing rule — inherited from features
009 and 015 — that a shared abstraction is extracted from two real consumers
rather than designed ahead of the first. Three real `BoardComponent`s need
identical ordering behaviour here and land together, so the shape is observed,
not guessed.

## Resolved design decisions

- **Both drag-to-reorder and one-click sort presets** (per user decision).
  Dragging alone would make "group my suits" a five-drag chore on a 13-card Crew
  hand; presets alone could not express an arbitrary arrangement and would not
  use dnd-kit at all. They share one state layer, so having both costs little
  beyond the buttons themselves.
- **Three games are in scope: Regicide, Crew, Cahoots.** Each has a `Card`
  object with a stable string `id`, already used as the React key. Love Letter
  is excluded: its hand is `CardRank[]` — bare numbers, index-keyed, with a
  maximum of two cards — so there is no card identity to reorder by and nothing
  worth arranging. The Mind is excluded on stronger grounds: its hand is
  `number[]` sorted ascending **server-side** (`themind/gameDef.ts`), and its UI
  treats `index === 0` as "your lowest card". A player-chosen order would break
  the game's central affordance, not just look different. Tic-Tac-Toe has no
  hand.
- **Order is session-only React state, never persisted** (per user decision).
  No `localStorage`, unlike `useTheme`/`useSoundSettings`/`useLanguage`. A hand
  turns over completely every few minutes; a saved arrangement would be stale
  before it was ever read, and would need keying by match *and* seat plus a
  cleanup story, for no benefit a player would notice.
- **The order is derived on every render, not synced in an effect.** The hook
  holds a *preference* (a list of card ids) and reconciles it against the
  incoming server hand each render. An effect-based sync would show one frame of
  stale order every time a card is drawn or played.
- **A newly drawn card is appended at the END, even when the hand is sorted.**
  It is not silently sorted into place. This matches physical play — you put the
  drawn card at the edge of your fan and re-sort if you care — and, more
  importantly, means a draw never rearranges cards the player was looking at.
  The preset buttons are the one-click escape hatch.
- **Reordering is always available to a seated player, regardless of whose turn
  it is.** `useSortable` is never passed `disabled` and the sort controls are
  never disabled by turn state; the only gates are "you hold a hand" (a
  spectator does not) and "it holds more than one card". Organising your hand
  while waiting is the main thing players want this for. This is stated as an
  acceptance criterion because the instinct when wiring dnd-kit is to reach for
  `useSortable({ disabled: !interactive })` — which is exactly what Cahoots'
  existing `useDraggable` call does.
- **Regicide and Crew get an explicit drag grip; Cahoots does not.** Discovered
  from the code, not assumed: both games' `CardTile` renders
  `<button disabled={disabled || !onClick}>`, so the card is a *natively
  disabled* control precisely when it is not your turn — and a disabled control
  dispatches no pointer events and does not bubble them. Making the card its own
  drag activator would produce a dead zone exactly where the feature is most
  wanted. The grip resolves a second collision too: dnd-kit's `KeyboardSensor`
  activates on Space/Enter on the activator, which on a Crew card button already
  means *play this card*. Cahoots' `CardTile` is an inert `<div>` with no click
  semantics, so its whole slot is the activator — as it must be, since the same
  drag also has to be able to land on a pile.
- **Cahoots' single `DndContext` serves both gestures, disambiguated by drop
  target** (per user decision): a hand card dropped on a pile is played, a hand
  card dropped on another hand card is rearranged. The two id spaces are
  disjoint by construction — `PileZone` registers `pile-{index}`, hand cards
  register their own `${color}${number}-${copy}` id — so the decision is a pure
  function of the `over` id, extracted to `dragTarget.ts` and unit-tested
  independently. Reordering is handled *before* the `canPlay` gate, so it works
  off-turn.
- **An 8px pointer activation constraint applies to every hand.** Without it,
  `PointerSensor` activates on pointerdown and swallows the click that follows,
  which would break Regicide's click-to-select and Crew's click-to-play, where
  card and drag target are the same element. This is a deliberate behaviour
  change for Cahoots, which shipped with dnd-kit's unconstrained defaults; it is
  an improvement there too, since it also stops a jittery tap from flinging a
  card onto a pile.
- **Cahoots keeps dnd-kit's default `rectIntersection` collision detection.**
  `closestCenter` always returns *some* droppable, which would silently turn
  "dropped in empty space" into a pile play and break feature 029's snap-back
  behaviour. Recorded here because it looks like an easy later improvement.
- **Sort comparators live in a per-game `handSort.ts`, not in `deck.ts`.** The
  functions are pure and would work in either place, but `deck.ts` is imported
  by `gameDef.ts`, which is on `packages/server`'s real Node runtime path. How a
  player likes their cards laid out is client presentation and stays off that
  path.
- **Regicide's presets do not reuse `cardValue`.** That function is the
  rulebook's attack/discard value: it returns `10` for both a 10 and a Jack, so
  they would sort as equals, and `0` for a Jester, which would sort Jesters to
  the front of the hand. Correct for combat maths, wrong for a hand layout — so
  `handSort.ts` defines its own `rankOrdinal` (Companion 1, numbers 2–10, J/Q/K
  11/12/13, Jester last).
- **Crew keeps rockets grouped at the end under BOTH presets**, not just the
  suit one. Rockets are the trump suit; scattering rocket 1–4 among the colour
  cards of matching rank is precisely what a player sorting their hand is trying
  to avoid.
- **Every comparator ends in an `id.localeCompare` tiebreak**, making each a
  total order. Without it, Regicide's two Jesters and Cahoots' two copies of
  every colour/number pair compare equal, leaving their relative position to
  `Array.prototype.sort`'s stability and whatever order they happened to arrive
  in.
- **`packages/game-core/src/ui/` is never exported from `src/index.ts`.** That
  file is on `packages/server`'s real-runtime import path and these modules
  import React. They are reachable only from a `BoardComponent`, itself
  reachable only via `boards.ts` → `packages/client`'s `boardRegistry.ts` — the
  same invariant `boards.ts` already documents for board components and their
  CSS.

## User stories

### 1. Grouping my suits while I wait

As a Crew player holding thirteen cards dealt in random suit order, I press
"By suit" and my hand regroups into pink, blue, green, yellow, rockets — and I
can do it on someone else's turn, which is when I actually have time to.

### 2. An arrangement of my own

As a Regicide player, I drag a card by its grip to exactly where I want it,
because the arrangement I want isn't any of the presets — I like my Jester next
to the companion I plan to pair it with.

### 3. Rearranging without misplaying

As a Cahoots player, dragging a card onto another card in my hand rearranges my
hand, while dragging it onto a pile plays it, and the two never get confused —
including when I drop a card in empty space, which does nothing at all.

### 4. Nothing I do leaks

As a player of any of these games, arranging my hand sends nothing to the
server, tells my teammates nothing, and cannot make a move on my behalf — it is
my own view of my own cards.

### 5. Sorting doesn't cost me my selection

As a Regicide player who has already selected two cards for a combo, pressing a
sort preset rearranges the cards without clearing what I picked, and Play stays
enabled.

### 6. Keyboard and screen reader

As a keyboard user, I can pick up a card with Space or Enter on its grip, move
it with the arrow keys, and drop it — and I hear what happened in my own
language, rather than dnd-kit's hardcoded English.

### 7. A drawn card doesn't scramble my hand

As a Cahoots player who has just sorted, drawing a replacement card puts it at
the end of my hand rather than silently reshuffling everything I was looking at.

## Acceptance criteria

Test types are tagged `[unit]` (node environment), `[component]` (jsdom), and
`[manual]`.

1. `[unit]` `reconcileOrder(preferred, actual)` returns `actual` unchanged for
   an empty preference; preserves a custom order; appends an id absent from the
   preference at the **end**; drops ids no longer in `actual` and closes the
   gap; falls back to pure server order when every remembered id is gone (a seat
   switch); and collapses duplicates, so its result always has exactly
   `actual.length` entries.
2. `[component]` `useHandOrder` reorders via `moveCard`, no-ops when either id
   is absent or the two are equal, applies a supplied comparator via
   `applySort`, returns to server order via `resetOrder`, and — across a
   rerender with a card added and one removed — keeps the custom order, places
   the new card last, and keeps `orderedHand.length === hand.length`.
3. `[unit]` Regicide's `rankOrdinal` sorts a 10 strictly before a Jack (the
   collision `cardValue` would have), treats a Companion as an Ace below the 2,
   orders J < Q < K, and ranks the Jester above every real card. A Jester sorts
   last under both presets.
4. `[unit]` Crew's rockets sort last under **both** presets — a rocket 1 does
   not jump ahead of a pink 2 under the rank preset.
5. `[unit]` Cahoots' two copies of a colour/number pair stay adjacent and in a
   deterministic order under both presets. No comparator in any of the three
   games returns `0` for two distinct cards.
6. `[unit]` `resolveDragTarget` maps `pile-{n}` to a pile, a hand card id to a
   reorder, and everything else — a malformed `pile-x` or bare `pile-`, an id
   not in this hand, `undefined`, `null`, a numeric identifier — to `none`, so
   that dropping in empty space submits no move.
7. `[component]` In Regicide and Crew, each card renders exactly one drag grip,
   named for that card, and **the grip is enabled while the card button itself
   is disabled** — both off-turn and (in Crew) on a card that is illegal to
   play.
8. `[component]` In all three games the sort controls are enabled when it is not
   the seat's turn, and pressing one visibly reorders the rendered hand while
   `moves.playCard`/`moves.playCards` is never called.
9. `[component]` In Crew, clicking a legal card still calls `onCardClicked`
   exactly once — proving the 8px activation constraint did not swallow the
   click.
10. `[component]` In Regicide, an in-progress multi-card selection survives a
    sort: both cards remain `aria-pressed="true"` and Play stays enabled.
11. `[component]` Regicide's `DefendPanel` renders the same arranged order as
    `HandView`, so the two never disagree about card order.
12. `[component]` The sort controls render nothing for a hand of fewer than two
    cards, and nothing at all is rendered for a spectator (no hand, no
    controls).
13. `[component]` In Cahoots the whole card slot is the drag activator (it
    carries the reorder label and contains the card) with no separate grip, and
    the four piles still render alongside the hand under the one `DndContext`.
14. `packages/game-core/package.json` lists `@dnd-kit/sortable` and
    `@dnd-kit/utilities` as optional `peerDependencies` (plus
    `devDependencies`), mirroring the existing `@dnd-kit/core` treatment.
    `packages/server` and `packages/shared` are unchanged.
15. `packages/game-core/src/index.ts` exports nothing from `src/ui/`, and
    `npm run typecheck --workspace=packages/server` still passes — the server
    never resolves a React import.
16. Every new i18n key exists in both `en.json` and `es.json`
    (`localeParity.test.ts` enforces this).
17. `npm run test:unit` passes in `packages/game-core` and `packages/client`
    with no change to any pre-existing test's outcome, including feature 027's
    `dndKitSmoke.test.tsx` (whose 10px pointer move still clears the new 8px
    threshold).
18. `[manual]` In a real match: arrange a hand by dragging in each of the three
    games while it is *not* your turn; confirm a Cahoots hand-to-pile drag still
    plays the card; confirm dropping a Cahoots card in empty space does nothing.

## Non-goals

- **Persisting the arrangement across a reload or rejoin** — resolved above as
  session-only; a stale saved order has negative value on a hand that turns over
  every few minutes.
- **Hand sorting for Love Letter or The Mind** — neither has the card identity
  for it, and The Mind's sorted hand is load-bearing game rules, not a default.
- **Any change to `G`, any new move, or any server-side awareness of hand
  order** — this is a view concern end to end.
- **A `DragOverlay`** — feature 029 deliberately dims the dragged card in place
  rather than rendering a floating copy, and this feature does not revisit that
  presentation decision for one of three games while leaving the other two
  inconsistent.
- **Auto-sorting a hand on deal, or remembering "last used preset" and
  reapplying it after every draw** — both make the hand move without the player
  asking. Deferred until someone actually asks for it.
- **Reordering from Regicide's `DefendPanel` or Crew's `CommunicationPanel`** —
  both are transient, task-focused panels; they *follow* the arranged order but
  offer no controls of their own. `DefendPanel` in particular renders *instead
  of* `HandView`, so no reorder affordance is available while defending.
- **A generalized platform-level `<Sortable>` for anything other than a card
  hand** — `src/ui/` is shaped by exactly the three consumers that exist. A
  fourth, differently-shaped consumer is the trigger to revisit it, not
  speculation now.
