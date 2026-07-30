# Feature 029 — Cahoots: Board UI

## Description

The `packages/client`-visible half of Cahoots — `CahootsBoard`, the
`BoardComponent` for `cahoots-v1` (feature 028). Depends on feature 028's
`G`/`playerView` shape existing first. Cards render as **placeholders**
(color + number, no artwork), matching this codebase's existing
convention (Love Letter, Regicide, Crew).

This is the **first real consumer of `@dnd-kit`** (feature 027's
plumbing): playing a card is drag-from-hand-to-pile, not click-to-select-
then-click-to-play. Each hand card is a `useDraggable` (only while it's
the viewer's own turn and they're the active seat); each of the 4 piles
is a `useDroppable`. While a card is being dragged, every pile it could
legally land on (per feature 028's own `isLegalPlacement` — not a second,
independently written copy of that check) is visually highlighted as a
valid target; dropping on any other pile, or off the board entirely,
snaps the card back with no move submitted.

Unlike Crew/Love Letter, there is **no `RoundConfirmBanner` concern
here at all** — Cahoots has no phase machinery and no simultaneous
wait-for-everyone step (see feature 028's "Resolved design decisions").
`CahootsBoard`'s own job is only the play surface: hand, piles, goal
board, turn/status readout. Win/loss is entirely the existing generic
`GameoverBanner` (feature 009), off `endIf`'s `GameoverResult` — no
custom win/loss UI is built here.

## Resolved design decisions

- **Drag-and-drop, not click-to-select-then-click-to-play** — this is the
  one interaction Regicide/Crew/Love Letter's click model doesn't fit,
  since the user specifically asked for drag placement onto a pile,
  mirroring the physical game's own "play a card onto a pile" gesture.
- **Legal-drop highlighting is computed client-side from
  `isLegalPlacement`, re-exported from feature 028's `deck.ts`**, not
  reimplemented — same "don't duplicate legality" precedent as Crew's
  `HandView` reusing `isLegalTrickPlay`.
- **A pile's full stack is viewable, not just its top card** — a small
  expand/collapse affordance per pile (the rulebook explicitly allows
  looking through a pile at any time), reading directly from `G.piles[i]`
  (feature 028 already keeps the full stack, not just the top, in public
  `G` for exactly this reason).
- **No shared drag/drop wrapper component is extracted here.** Feature
  027 deliberately left that for "a second real consumer" to generalize
  from — this is the first, so any wrapper built now would still be a
  guess at the wrong shape. `CahootsBoard`'s own `PileZone`/`HandView`
  own their `useDraggable`/`useDroppable` calls directly.
- **The goal deck's remaining count is a card-stack (`DeckStack`), not a
  "{{completed}} of {{target}}" progress sentence** — a Cahoots-local copy
  of Regicide's own `DeckStack` (count + 0-2 dimmed background layers for
  an at-a-glance thin/thick read). Copied rather than imported from
  `regicide/DeckStack.js`, matching this codebase's established per-game-
  copy convention for small presentational atoms (every game already has
  its own `CardTile`/`playerLabel`, never a shared one). Only
  `G.goalDeck.length` is shown, deliberately excluding the 4 already-
  visible `activeGoals` — same split as Regicide's Castle-deck count
  excluding its own currently-faced enemy.
- **`DeckStack` carries a `variant: 'goal' | 'draw'` prop, same shape as
  Regicide's own tavern/castle/discard variants** — added once Cahoots
  itself grew a second real deck (the draw pile, next to
  `PlayerStatusList`), each with its own `--deck-color` override so the
  two stacks read as visually distinct even sitting near each other. Not
  added speculatively ahead of that second consumer.

## User stories

### 1. Dragging a card onto a pile

As the active seat on my turn, I see my hand as draggable cards; picking
one up highlights every pile it could legally land on (matching color or
number of that pile's current top card) and dims the rest; dropping it on
a highlighted pile plays it immediately, dropping it anywhere else does
nothing.

### 2. Watching the piles and goals update live

As any seated player or spectator, I see all 4 piles' current top cards,
the 4 active goal cards with their requirement spelled out in plain
language, and a card-stack showing how many goals are still face-down in
the deck, all updating live as any seat plays.

### 2a. Knowing how close the draw pile is to running out

As any seated player or spectator, I see a card-stack (next to the player
list) showing exactly how many cards are left in the shared draw pile --
the same information every seat's own turn already draws down, made
visible without needing to infer it from hand sizes.

### 3. Reviewing a pile's full history

As any seated player or spectator, I can expand any one of the 4 piles to
see every card that's been played into it, in order, then collapse it
back down.

### 4. Knowing whose turn it is, and everyone's hand size

As any seated player or spectator, I see every active seat listed with its
current hand size (one face-down card icon per held card, same visual
language as The Mind's own player status widget) — since turn order
started from a random seat, this is the only way to know whose turn it is
without checking `ctx.currentPlayer` indirectly. The currently active
seat's name is colored (Regicide's own `.active .name` convention) so it
reads at a glance, not just from a single sentence.

### 5. A spectator sees the same public information a seated player sees

As a spectator (no seat claimed), I see the piles, goal board, and player
status list identically to a seated player, but no seated player's actual
hand contents — matching feature 028's `playerView` guarantee.

### 6. Winning or losing

As any seated player, once the match ends (every goal completed, or the
current seat left with no legal play, or the table run completely dry),
I see the platform's existing generic `GameoverBanner` — `CahootsBoard`
itself renders nothing extra for this.

## Acceptance criteria

`[component]` denotes a client-side concern verified by reading the
component source against feature 028's `BoardProps`/`CahootsView` shape.
`[manual]` denotes verification via the real dev server.

1. `[component]` `HandView` wraps each of the viewer's own hand cards in
   a `useDraggable` only when `isActive` is true and it's the `trick`-
   equivalent turn (i.e. this player is `ctx.currentPlayer`); otherwise
   cards render non-draggable, with no drag affordance at all — matching
   feature 027's confirmed toolchain (real `PointerEvent`-driven drag
   under this project's actual sensors).
2. `[component]` Each `PileZone` is a `useDroppable`; while any card is
   being dragged, every pile `isLegalPlacement(draggedCard, pile's top)`
   accepts is visually distinguished from the piles that would reject it.
3. `[component]` Dropping a dragged card on a legal pile calls
   `moves.playCard(pileIndex, cardID)` with exactly that pair; dropping
   on an illegal pile, or anywhere off a droppable, calls no move at all.
4. `[component]` `PileZone`'s expand control reveals every card in
   `G.piles[i]` bottom-to-top (not just the current top card) and can be
   collapsed back to just the top.
5. `[component]` `GoalBoard` renders every entry in `G.activeGoals` with
   a translated, human-readable description generated from its `kind`/
   params (via a lookup covering all 19 kinds from feature 028's
   catalog), plus a `DeckStack` (same card-stack model as Regicide's own
   Castle deck) showing `G.goalDeck.length` -- the face-down remainder,
   deliberately excluding the 4 already-visible `activeGoals`, mirroring
   Regicide's own Castle-deck-count-excludes-the-current-enemy split.
6. `[component]` `PlayerStatusList` renders every entry in `G.activeSeatIDs`
   with its `G.handCounts` value as that many face-down card-back icons,
   sourced from `playerNames` the same way `GameoverBanner` already does
   for an unnamed seat's fallback, and gives whichever seat currently
   equals `ctx.currentPlayer` the colored/bold active-turn treatment —
   visible to seated players and spectators alike.
7. `[component]` `CahootsBoard` renders no platform seat-roster/room-chrome
   list, seat controls, presence badges, chat, or `RoundConfirmBanner`/
   confirm control of its own -- `PlayerStatusList` is this game's own
   hand-count/turn widget (same category as Regicide's/The Mind's own
   PlayerStatusList), not the platform's room chrome. Confirms the
   chrome/board split and the "this game has no
   confirm-wait phase" design decision both hold.
8. `[component]` A second `DeckStack`, next to `PlayerStatusList`, shows
   `G.drawPile.length` -- so every seated player and spectator can see how
   many cards are left to draw (and thus how close the match is to the
   "draw pile empty and every hand empty" loss condition) without either
   seat's own hand contents being involved.
9. `[manual]` A full match played across 2-4 real browser sessions (or
   solo multi-seat claiming) from setup through either a win (every goal
   completed) or an engineered loss (draining the deck without matching
   goal progress, or manufacturing a stuck-hand state): dragging a legal
   card onto a highlighted pile, confirming an illegal drop is rejected
   with no move submitted, expanding a pile's history, and confirming the
   resulting `GameoverBanner` state renders correctly for both outcomes.

## Non-goals

- Card artwork — placeholder rendering only, matching existing
  convention.
- A shared drag-and-drop wrapper component/hook — per feature 027's own
  non-goal, deferred until a *second* real consumer exists to generalize
  from.
- Touch-specific sensor tuning or keyboard-accessible drag activation —
  feature 027 explicitly deferred sensor configuration to "the specific
  interaction a future game needs"; this feature uses `@dnd-kit`'s
  default pointer sensor only.
- Animations/transitions for card plays or goal completion.
- Any UI enforcing (or even nudging) the rulebook's communication
  restriction — per feature 028's Non-goals, unenforced by design.
