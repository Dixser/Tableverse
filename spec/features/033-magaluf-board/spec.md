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
   any client renders, the roll is already in `G.jumps`.

Turn interaction is three buttons — **Beber**, **Retirarse**, and one per item
held — plus the platform's own confirm control between phases.

## Amendments to feature 032

Three changes to the rules module land with this feature. All are additive or
structural changes to `magaluf-v1` **rather than a `magaluf-v2`**, on the same
reasoning each time: `tech-stack.md` forbids mutating a published version
*once real matches are recorded against it*, because boardgame.io replays the
move log against the `Game` definition. Magaluf shipped without a board and
has never been playable, so no match exists to corrupt.

**That window closes the moment anyone plays a real match**, which is the
point of this feature — so this is the last opportunity to make structural
changes for free, and both of the significant ones are being taken now
deliberately rather than deferred.

### A. `G.lastDraw` (done)

```ts
lastDraw: { seatID: string; alcohol: string; event: EventId | null } | null;
```

Set in `takeDrink`, cleared at each phase start. Needed because recovering
"the current draw" from the log tail is unreliable: a Ronda appends one
`drank` entry per player and a Chupito de la casa chains a second for the same
seat.

### B. Round-confirm gates between phases and between days

Magaluf currently advances automatically: a phase ends and the next one deals
inside the same move. This adds the platform's shared wait-for-everyone step
(`roundConfirm.ts`, feature 021) at **both** boundaries:

- After **Último en Pie** is awarded and before the next venue's decks are
  dealt (Tardeo → Noche → After).
- After the night resolves — including every balconing roll — and before the
  next day begins.

`MagalufG` gains the reserved `RoundConfirmG` fields (`roundConfirm`,
`hostPlayerID`) and two moves, `confirmRoundReady` and `forceAdvanceRound`,
wired exactly as Love Letter and The Mind wire theirs.

**This forces a turn-architecture change.** Feature 032 has a real round-robin
turn order, so only the current seat can move — but every seat must be able to
confirm. The Mind avoids this by being turn-less (`ActivePlayers.ALL`
permanently); Love Letter, which has turn order like Magaluf, uses a dedicated
boardgame.io phase with `activePlayers: ALL` for its wait. Magaluf follows
Love Letter:

| boardgame.io phase | Turn order | Moves |
|---|---|---|
| `party` | the custom `TurnOrderConfig` from 032 | `drink`, `withdraw`, `useItem` |
| `confirm` | `activePlayers: ALL` | `confirmRoundReady`, `forceAdvanceRound` |

So feature 032's "there is deliberately no boardgame.io phase machinery"
decision is **reversed here**, and its doc comments must be corrected rather
than left contradicting the code.

Note the naming collision this creates and keep it straight: `G.phase` is the
*venue* (Tardeo/Noche/After); a boardgame.io phase is `party` or `confirm`.

**Pending seats are the seats that are not dead.** A dead player is out of the
weekend and should not be able to hold the table hostage by walking away; they
still see the banner, they are just not waited on. The host's
`forceAdvanceRound` covers a disconnected living player.

**Why this is worth the clicks.** Nine venues per weekend means eight gates,
which is a real pacing cost — but they land exactly on the two beats that
matter. The phase gate is where the decks change and where the limit is turned
face-up; the day gate is where the balcony resolves. It also removes a risk
this feature had otherwise: the balcony reveal firing unprompted while another
player was mid-decision. If playtesting finds it draggy, the honest fix is a
setting, not removing the gate.

### C. `endIf` populates gameover standings

See the platform extension below.

## Platform extension: gameover standings

`GameoverBanner` currently renders one sentence. Magaluf's ending needs the
whole table — final VP for every seat, and who did not make it home.

This is done **generically in the platform**, not as a custom board panel:

```ts
export interface GameoverStanding {
  playerID: string;
  /** Final score, rendered as-is. The platform does not know what it counts. */
  score: number;
  /** Optional i18n key for a status label, e.g. eliminated. */
  labelKey?: string;
}

export interface GameoverResult {
  winner?: string | string[];
  draw?: boolean;
  standings?: GameoverStanding[];   // new, optional
}
```

`GameoverBanner` renders the existing message and, when `standings` is
present, an ordered list beneath it: rank, player name, score, and the
translated label if any. No game-identity branching — any game may populate
it, and every game that does not is unaffected because the field is optional.

Magaluf's `endIf` fills it with `bankedVP` and `magaluf.status.dead` for
eliminated seats.

Considered and rejected: giving the board its own final-standings panel.
Feature 029 set the precedent that win/loss presentation belongs to the
platform, and a per-game standings table would be the fourth place this
codebase renders "who won" — the generic banner is where it belongs, and
every other game gets it for free.

## Resolved design decisions

- **The intoxication meter's scale never depends on the hidden limit.** A
  meter that ran 0 → limit would leak the exact number through its own
  geometry, which is worse than showing it outright because it looks like it
  is hiding something. The scale runs `0 → max possible limit for the day +
  fixed headroom`, taken from the day's limit deck — which is **public**
  information, printed on the box and already treated as public by the
  simulator's bots.
- **While the limit is face-down the meter shows the possible-limit band, not
  a line.** Friday's deck is 26–29 and Sunday's is 14–26, so the band itself
  communicates that Sunday is the unpredictable night. When the limit becomes
  known — revealed, or peeked at with a Red Bull — the band collapses to a
  single hard marker. This is strictly more informative than the original
  design and leaks nothing that was not already public.
- **Every seat's meter uses the same scale**, so panels are visually
  comparable at a glance. The scale is a function of the day, not of the
  player.
- **The balcony is a two-beat overlay, driven entirely client-side.** Beat one
  shows who is over, by how much, and the survival percentage. Beat two shows
  pool or concrete. The engine is not consulted: the outcome is already in
  `G.jumps` and the overlay controls only when the viewer learns it. It now
  sits inside the end-of-day confirm gate, so nobody is mid-decision when it
  fires.
- **The overlay's queue starts at `G.jumps.length` on mount, not at zero** —
  otherwise a player reconnecting on Sunday would be walked through every jump
  of the weekend. Same class of problem as `ChatPanel`'s unread watermark.
- **Several jumps can resolve in one update**, so the overlay is a queue shown
  one at a time, with an affordance to skip the remainder.
- **Balcony risk is shown only when the viewer can already see the limit.** The
  board reads `G.limit`; when it is `HIDDEN_LIMIT` there is nothing to show. It
  must never infer the limit from anything else — the hiding is enforced by
  `playerView` server-side and the board must not undo it.
- **`RoundConfirmBanner` is the platform's, rendered by `GameMount`.** The
  board renders nothing for it, exactly as Love Letter and The Mind do not.
- **No custom win/loss UI and no board-owned standings panel** — the extended
  `GameoverBanner` owns both.
- **Card atoms are a per-game copy**, matching every existing game.

## User stories

### 1. Taking a turn

As the seated player whose turn it is, I see exactly three kinds of action —
drink, withdraw, and any item I hold — with items disabled once I have used
one this turn.

### 2. Seeing what the deck did to me

As any player or spectator, when someone drinks I see the alcohol card and the
event card that came up, with their numbers.

### 3. Reading the table at a glance

As any player or spectator, I can see for every seat how intoxicated they are
relative to their morning Resaca and to the possible limit, what they have
banked, what is still at risk, what items they hold, and whether they are out,
arrested or dead.

### 4. Judging the danger without being told the answer

As any player, while the limit is face-down I can see the *range* it could
fall in, so I can judge how close to the edge I am — without the board ever
revealing which card was actually drawn.

### 5. The reveal

As any player or spectator, when the limit is turned face-up at the start of
the After, the band collapses to a hard line and I immediately see who is
already over it and what their odds are.

### 6. The balcony

As any player or spectator, when a day ends with somebody over the limit, I
see who, how far over, and their survival chance — and only then whether they
landed in the pool or on the concrete.

### 7. Regrouping between venues

As a seated player, when a venue closes or a night ends, the match waits for
everyone to confirm before dealing the next one, so nobody is still reading
the balcony result while the next Tardeo is already underway.

### 8. Joining late

As a player who reconnects, or a spectator who joins mid-weekend, I am not
made to sit through balcony reveals that happened before I arrived.

### 9. Seeing how the weekend ended

As any player or spectator, when the weekend is over I see every seat listed
with their final points and a clear mark against anyone who died.

### 10. Playing in my own language

As any user, the language I pick from the room menu is mine alone — every
label, card name and event on the board follows my own setting, and two people
in the same match can be reading it in different languages.

## Acceptance criteria

`[component]` denotes a Testing Library test against `MagalufBoard` mounted
with mock `BoardProps` and this folder's `i18nFixture`. `[unit]` denotes a
plain test with no jsdom. `[platform]` denotes a test against shared
`packages/client` code.

### The board

1. `[component]` One panel per seat in `G.activeSeatIDs`, and none for
   unclaimed engine seats.
2. `[component]` Only the seat named by `G.turnSeatID` gets action controls,
   and only when `isActive` and `playerID` match it.
3. `[component]` `Beber` calls `moves.drink`, `Retirarse` calls
   `moves.withdraw`, an item button calls `moves.useItem` with that item.
4. `[component]` Item buttons are disabled when `itemUsedThisTurn` is true.
5. `[component]` Contraband items are marked distinctly from legal ones.
6. `[component]` `G.lastDraw` renders both the alcohol card (name,
   intoxication, VP) and the event; a null `lastDraw` renders neither and does
   not crash.
7. `[component]` The meter marks the Resaca floor whenever `resaca > 0`.
8. `[component]` A seat's status renders distinctly for partying, withdrawn,
   arrested and dead.
9. `[component]` Banked and at-risk VP are shown separately, never summed.
10. `[component]` The board renders without error at 3 and at 6 seats.
11. `[component]` Every visible string resolves through `t`, proven by the
    fixture's `TEST_`-prefixed strings appearing.

### The limit, and not leaking it

12. `[unit]` The meter's maximum is a function of the day and `limitShift`
    only — identical for every seat, and unchanged by whether the limit is
    revealed or by what the limit actually is.
13. `[component]` With `G.limit === HIDDEN_LIMIT`, no limit marker, no numeric
    limit and no risk badge appear, and the possible-limit band is rendered
    instead.
14. `[component]` Two boards rendered with the same day and different hidden
    limits are visually identical — the geometry carries no information about
    which card was drawn.
15. `[component]` When the limit is visible, the band is replaced by a single
    marker at the exact value.
16. `[component]` When the limit is visible and a seat is over it, that seat
    shows a risk badge whose percentage equals `poolChance(d, G.settings)`
    from feature 032 — imported, not reimplemented.
17. `[component]` A seat that has spent a Red Bull sees the marker; a board
    rendered for any other seat with the same `G` does not.

### The balcony overlay

18. `[unit]` The queue starts at `G.jumps.length` on first observation.
19. `[unit]` The queue yields newly appended jumps in order; skipping clears
    the remainder without re-showing it.
20. `[component]` A newly appended jump opens the overlay showing the seat, the
    distance over and the survival percentage — and not the outcome.
21. `[component]` Advancing reveals the outcome, distinguishing pool (with the
    legend bonus) from concrete.
22. `[component]` Two jumps in one update show first, then second, then close.
23. `[component]` Nothing is rendered when nothing new has arrived, including
    on a board mounted mid-weekend with a populated `G.jumps`.

### Round confirm (rules amendment)

24. `[unit]` A venue ending begins a round-confirm wait instead of dealing the
    next venue immediately.
25. `[unit]` A night ending begins a wait *after* the balconing rolls are
    recorded in `G.jumps`, not before.
26. `[unit]` Pending seats are the non-dead active seats; a dead seat is
    neither waited on nor able to confirm.
27. `[unit]` Once every pending seat confirms, the next venue or day deals and
    `roundConfirm` returns to null.
28. `[unit]` The host seat's `forceAdvanceRound` advances without the
    remaining seats; a non-host caller gets `INVALID_MOVE`.
29. `[unit]` `drink`, `withdraw` and `useItem` are all rejected while a wait is
    in progress.
30. `[conformance]` The conformance suite still passes at 3 and 6 players with
    the phase machinery in place.

### Gameover standings (platform extension)

31. `[platform]` `GameoverBanner` renders its existing message unchanged when
    `standings` is absent, so no existing game's output changes.
32. `[platform]` With `standings` present it renders one row per entry with
    the resolved player name and score, in the given order.
33. `[platform]` A `labelKey` renders as its translated string; an entry
    without one renders no label.
34. `[platform]` A malformed `standings` value does not crash the banner —
    same defensive contract the component already keeps for `gameover` itself.
35. `[unit]` Magaluf's `endIf` returns standings ordered best first, with
    every active seat present and `magaluf.status.dead` on eliminated seats.

## Non-goals

- **Artwork.** Cards are typographic placeholders.
- **Animation.** The overlay is a two-step reveal, not a falling-body
  animation.
- **Drag and drop.** There is no hand; `@dnd-kit` and feature 031's hand
  sorting do not apply.
- **A board-owned standings or win/loss panel.** The platform banner owns it.
- **Making the confirm gate configurable.** Ships always-on; a setting is the
  fix only if playtesting shows it drags.
- **Localising the banner's name-list grammar.** Pre-existing, tracked in
  feature 010's open risks.
- **Deck-count displays.** A phase deck's remaining count is not a decision
  input — the phase ends on player choices and drink caps, never on the deck
  running out.
