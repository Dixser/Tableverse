# Feature 033 — Magaluf: Board UI

## Description

The `packages/client`-visible half of Magaluf — `MagalufBoard`, the
`BoardComponent` for `magaluf-v1` (feature 032). Depends on feature 032's
`G`/`playerView` shape existing first. Cards render as **placeholders**
(name + numbers, no artwork), matching this codebase's existing convention.

Until this feature lands, `magaluf-v1` is selectable in the room but
`GameMount` renders `gameMount.unknownGame` for it — the catalog entry exists
so the server accepts the id, but there is nothing to play on.

Magaluf's play surface is unusual for this codebase in two ways, and both
shape the whole feature:

1. **There is no hand.** Every other game here renders cards a player holds.
   Magaluf's only per-player holdings are items; the drama is in what the deck
   just dealt you. The board is therefore a *state readout plus a draw
   reveal*, not a hand manager. No `@dnd-kit`, no card selection, no reorder.
2. **The most important moment happens after a player's last decision.** The
   engine resolves balconing inside the move that ends the day, so by the time
   any client renders, the roll is already in `G.jumps`. Presenting that as a
   moment rather than a log line is this feature's centrepiece.

Turn interaction is three buttons — **Beber**, **Retirarse**, and one per item
held — which is the whole move surface `magalufGameDef` exposes.

## Amendment to feature 032

The board needs to show **the cards a player just drew**, and `G` does not
currently carry them. `G.log` records every draw, but recovering "the current
draw" from the log tail is fragile: a Ronda appends one `drank` entry per
player, and a Chupito de la casa chains a second for the same seat, so there
is no reliable "last one" to read.

This feature therefore adds one additive field to `magaluf-v1`:

```ts
/** The cards face-up on the table from the most recent draw. */
lastDraw: { seatID: string; alcohol: string; event: EventId | null } | null;
```

Set in `takeDrink`, cleared at the start of each phase. It is public — every
seat should see what the active player drew, which is most of the fun.

**This is safe to do rather than a `magaluf-v2`.** `tech-stack.md`'s rule is
that a published version is never mutated *once it has real matches recorded
against it*, because boardgame.io replays the move log against the `Game`
definition. `magaluf-v1` has never been playable — feature 032 shipped without
a board — so no match exists to corrupt. Doing it now is the last moment this
is free, and it is recorded as a deviation in feature 032's `tasks.md`.

## Resolved design decisions

- **The balcony is a two-beat overlay, driven entirely client-side.** Beat one
  shows who is over, by how much, and the survival percentage, with a single
  button. Beat two shows pool or concrete. The engine is not paused, gains no
  new stage, and is not consulted: the outcome is already in `G.jumps` and the
  overlay only controls when the viewer learns it. Feature 032 deliberately
  left this here (see its non-goals).
- **The overlay's queue starts at `G.jumps.length` on mount, not at zero.**
  Otherwise a player who reconnects on Sunday, or a spectator who joins late,
  would sit through every jump of the weekend before seeing the board. Only
  jumps that appear *while you are watching* get the reveal; the rest are
  history, readable in the chat log. Same class of problem as `ChatPanel`'s
  unread watermark, solved the same way.
- **Several jumps can resolve in one state update** — everyone over the limit
  at the end of a day — so the overlay is a queue shown one at a time, with an
  affordance to skip the remainder.
- **Balcony risk is shown only when the viewer can already see the limit.**
  The board reads `G.limit` and, when it is `HIDDEN_LIMIT`, simply has nothing
  to display. It must never infer or approximate the limit from the limit
  decks, the day, or anything else — the hiding is enforced by `playerView`
  server-side and the board must not undo it client-side.
- **Intoxication renders as a meter, not a number alone.** The relationship
  between three values — where your hangover put you this morning, where you
  are now, and where the limit sits — is the entire decision, and three bare
  integers do not communicate it. The Resaca floor is a distinct band from
  zero; the limit is a hard marker; the fill crosses it visibly.
- **No custom win/loss UI**, following feature 029's precedent: the platform's
  generic `GameoverBanner` announces the result off `endIf`. The board does
  render a **final standings** panel (banked VP, who survived, who did not),
  which is game state rather than a win announcement — Magaluf's death toll is
  the point of the game and belongs on its own surface.
- **No `RoundConfirmBanner` concern.** Magaluf has no wait-for-everyone step;
  day and phase transitions are automatic inside a move.
- **Sounds need no work here.** `useGameSounds` already plays cues from
  `G.log` entries generically, and feature 032's moves already carry them
  (`play` on a drink, `special` on an arrest or a pool landing, `failure` on
  the concrete).
- **Card atoms are a per-game copy**, matching every existing game (each has
  its own `CardTile`/`playerLabel`, never a shared one).

## User stories

### 1. Taking a turn

As the seated player whose turn it is, I see exactly three kinds of action —
drink, withdraw, and any item I hold — with items disabled once I have used
one this turn, so the move surface is never ambiguous.

### 2. Seeing what the deck did to me

As any player or spectator, when someone drinks I see the alcohol card and the
event card that came up, with their numbers, so a turn is a reveal rather than
a number silently changing.

### 3. Reading the table at a glance

As any player or spectator, I can see for every seat: how intoxicated they
are relative to their morning Resaca and to the limit, what they have banked,
what is still at risk, what items they hold, and whether they are out,
arrested or dead.

### 4. The reveal

As any player or spectator, when the limit is turned face-up at the start of
the After, the board makes that visible and immediately shows me who is
already over it and what their odds are.

### 5. The balcony

As any player or spectator, when a day ends with somebody over the limit, I
see who, how far over, and their survival chance — and only then whether they
landed in the pool or on the concrete.

### 6. Joining late

As a player who reconnects, or a spectator who joins mid-weekend, I am not
made to sit through balcony reveals that happened before I arrived.

### 7. Playing in Spanish or English

As any user, every label, card name and event on the board follows the
language toggle, with no English leaking into a Spanish match.

## Acceptance criteria

`[component]` denotes a Testing Library test against `MagalufBoard` mounted
with mock `BoardProps` and this folder's `i18nFixture`. `[unit]` denotes a
plain test against extracted logic, no jsdom.

1. `[component]` The board renders one panel per seat in `G.activeSeatIDs`,
   and none for unclaimed engine seats.
2. `[component]` Only the seat named by `G.turnSeatID` gets action controls,
   and only when `isActive` and `playerID` match it; every other viewer sees
   the same board without buttons.
3. `[component]` `Beber` calls `moves.drink`, `Retirarse` calls
   `moves.withdraw`, and an item button calls `moves.useItem` with that item.
4. `[component]` Item buttons are disabled when `itemUsedThisTurn` is true.
5. `[component]` Contraband items are marked distinctly from legal ones.
6. `[component]` `G.lastDraw` renders both the alcohol card (name,
   intoxication, VP) and the event card; a null `lastDraw` renders neither and
   does not crash.
7. `[component]` The intoxication meter marks the Resaca floor whenever
   `resaca > 0`, and marks the limit only when the limit is visible.
8. `[component]` When `G.limit` is `HIDDEN_LIMIT`, no limit marker, no numeric
   limit and no balcony-risk badge appear anywhere on the board.
9. `[component]` When the limit is visible and a seat is over it, that seat
   shows a risk badge whose percentage equals `poolChance(d, G.settings)`
   from feature 032 — imported, not reimplemented.
10. `[component]` A seat's status renders distinctly for partying, withdrawn,
    arrested and dead.
11. `[component]` Banked and at-risk VP are shown separately, never summed
    into one figure.
12. `[unit]` The jump queue starts at `G.jumps.length` on first observation,
    so a mid-match arrival reveals nothing retroactively.
13. `[unit]` The jump queue yields newly appended jumps in order, and skipping
    clears the remainder without re-showing them later.
14. `[component]` A newly appended jump opens the overlay showing the seat, the
    distance over, and the survival percentage — and not the outcome.
15. `[component]` Advancing the overlay reveals the outcome, distinguishing
    pool (with the legend bonus) from concrete.
16. `[component]` With two jumps appended in one update, the overlay shows the
    first, then the second, then closes.
17. `[component]` The overlay is not rendered at all when nothing new has
    arrived, including on a board mounted mid-weekend with a populated
    `G.jumps`.
18. `[component]` When `ctx.gameover` is set, a final standings panel lists
    every seat with banked VP and survival, ordered best first; no win/loss
    wording is rendered by the board.
19. `[component]` Every visible string resolves through `t`; the fixture's
    `TEST_`-prefixed strings appear, proving nothing is hardcoded.
20. `[component]` The board renders without error at both `minPlayers` (3) and
    `maxPlayers` (6) seat counts.

## Non-goals

- **Artwork.** Cards are typographic placeholders, as in every other game here.
- **Animation of the meter or the jump.** The overlay is a two-step reveal, not
  a falling-body animation. Motion can come later once the shape is proven.
- **Drag and drop.** There is no hand and nothing to reorder, so `@dnd-kit` is
  not used and no hand-sorting affordance (feature 031) applies.
- **A rules change of any kind beyond `G.lastDraw`.** The move surface, the
  turn structure and the balconing maths are feature 032's and are consumed
  as-is.
- **Custom win/loss messaging.** The platform's `GameoverBanner` owns it.
- **A spectator-specific board.** Spectators see the same surface without
  controls, which `playerID == null` already produces.
- **Deck-count displays.** Unlike Cahoots' goal deck, a Magaluf phase deck's
  remaining count is not a decision input — the phase ends on player choices
  and drink caps, never on the deck running out.
