# Feature 009 — Gameover Banner

## Description

Right now, no game tells the player anything when a match ends. Tic-Tac-Toe's
`BoardComponent` already stops accepting moves once `ctx.gameover` is set
(`canPlay` checks `!ctx.gameover`), but nothing renders a message — the board
just goes quiet. This is a platform-chrome gap, not a Tic-Tac-Toe gap: every
`GameModule` ends the same way boardgame.io-wise (`ctx.gameover` transitions
from `undefined` to a truthy value), so "tell the player the match ended, and
whether they won" should be built once, generically, and work for every game
without that game's `BoardComponent` ever having to render it.

This formalizes a small contract on top of what Tic-Tac-Toe's `endIf`
*already* returns (`{ winner: '0' }` / `{ draw: true }` — see
`gameDef.test.ts`) as `GameoverResult`, the required shape of `ctx.gameover`
for every game in the catalog, and adds one generic chrome component that
renders it. **Zero changes to Tic-Tac-Toe's `gameDef.ts` are needed** — it
already conforms; this feature only formalizes the shape it already produces
and builds the first consumer of it.

Deliberately scoped narrower than "shared UI components for games in
general": genre-shared board widgets (e.g. a card game's hand tray, opponent
card-count badges) are **not** part of this feature. Unlike the gameover
banner, those need a second real game to validate their shape against, and
no card game exists in the catalog yet (Love Letter is still an unspecced
roadmap candidate). Building them now would be guessing, not extracting —
see roadmap.md for where that work is deferred to.

## User stories

### 1. A seated player learns the outcome without reading the board

As a player in a claimed seat, when the match ends I see a clear message
telling me whether I won, lost, or the match was a draw — I don't have to
infer it from the board state myself.

### 2. A spectator sees who won, by name

As a room member with no claimed seat, watching a live match (feature 005),
I see the same outcome message, phrased for an observer rather than a
participant (no "you won" framing, since I didn't play) — naming the
winner(s) by their display name, not by an anonymous seat number.

### 3. Every game gets this for free

As the developer, adding a new `GameModule` to the catalog does not require
writing any gameover UI — as long as its `endIf` returns a `GameoverResult`
(`{ winner }` and/or `{ draw: true }`), the banner renders correctly with no
game-specific code. This is validated by Tic-Tac-Toe, the only real game
that exists, without touching its `gameDef.ts`.

### 4. Switching active seats updates the banner's perspective

As a multi-seat player (feature 001's multi-seat claiming) using the seat
switcher, if I switch from a seat that won to a seat that lost, the banner
updates to reflect the newly active seat's outcome — it is not "sticky" to
whichever seat was active when the match ended.

### 5. A game with more than one winner is named correctly

As a viewer of a hypothetical future game whose `endIf` can produce more
than one winner (e.g. a team win, or a last-players-standing game with a
tied finish), I see every winner's name in the message, not just the
first one — this platform-level component must not assume exactly one
winner just because Tic-Tac-Toe (the only game that exists today) always
has one.

## Acceptance criteria

1. When `ctx.gameover` is `{ winner: W }` (`W` a single `playerID` or an
   array of them) and the active seat's `playerID` is in `W`, the banner
   reads a "you won" message. If `W` has other winners besides the viewer
   (a multi-winner result), they are named in the same message (e.g. "You
   and Alice win!").
2. When `ctx.gameover` is `{ winner: W }` and the active seat's `playerID`
   is not in `W`, the banner names every winner in `W` by display name
   (e.g. "Alice wins!" for one winner, "Alice and Bob win!" for two,
   "Alice, Bob and Carol win!" for three or more) — never a bare "you
   lost" with no indication of who won.
3. When `ctx.gameover` is `{ draw: true }`, the banner reads a draw message,
   regardless of `playerID`.
4. When the viewer is a spectator (`playerID: null`), the banner never uses
   "you won" framing — it names the winner(s) by display name, using the
   same multi-winner list formatting as AC1/AC2 (or the draw message).
5. A winner's **display name** is used wherever a winner is named (AC1, AC2,
   AC4) — sourced from boardgame.io's own match metadata
   (`ClientState.matchData`, already populated server-side from
   `User.displayName` at seat-claim time, see plan.md), not a raw
   `playerID`/seat number. If a name genuinely isn't available yet (e.g.
   `matchData` hasn't synced), the banner falls back to `Seat {playerID}`
   for that one winner rather than blank text — this is a degradation path,
   not the normal-case phrasing.
6. `GameoverResult`'s `winner` field is explicitly documented and handled
   as "one or more playerIDs" (`string | string[]`) throughout message
   resolution — not just accepted by the type and then only ever tested
   with a single winner. A `{ winner: ['0', '1'] }` case (hypothetical
   future game) is covered by a dedicated test for each of AC1/AC2/AC4's
   multi-winner phrasing.
7. When `ctx.gameover` is `undefined`, no banner renders — this is the
   normal in-progress state for every existing `GameMount` test and must
   keep passing unmodified.
8. An unrecognized `ctx.gameover` shape (neither `winner` nor `draw: true` —
   a hypothetical future game that doesn't conform) renders a generic
   "Game over" fallback rather than throwing or rendering nothing. The
   banner must never crash `GameMount`.
9. The banner is rendered by `GameMount`, not by any `BoardComponent` —
   verified the same way feature 001/002's chrome/board split is verified
   today (`BoardComponent.test.tsx`'s "no chrome" assertion stays
   unmodified and still passes; the banner has zero presence in
   `TicTacToeBoard`'s own render output).
10. Tic-Tac-Toe's existing `gameDef.test.ts` assertions on `ctx.gameover`
    (`{ winner: '0' }`, `{ draw: true }`) pass unmodified — proof this
    feature formalizes an existing shape rather than requiring a migration.

## Non-goals

- Genre-shared board widgets (hand trays, opponent card counts, etc.) —
  deferred until a second real game exists to validate the shape against;
  see roadmap.md.
- A `reason`/detail field on `GameoverResult` (e.g. "three in a row") — no
  current game needs one; add it if/when a real game requires it, per
  `GameoverResult`'s own minimality.
- Adding `displayName` to `Room`/`RoomMember`/`SeatAssignment` (shared
  types) or any new server endpoint for player names — unnecessary once
  boardgame.io's own `matchData` (already carrying the display name) is
  surfaced client-side; see plan.md. This keeps the feature client-only,
  same as originally scoped.
- A "Play again" / rematch control inside the banner — `RoomShell` already
  owns "End match"; this feature is display-only.
- Animation, sound, or confetti-style celebration effects.
- A generic conformance-suite check that auto-plays an arbitrary game to a
  terminal state to verify its `endIf` return shape. The conformance suite
  has never known how to legally play an arbitrary game (see
  `testGameModuleConformance`'s existing checks, none of which advance game
  state past `setup`) and teaching it to do so is out of scope here. Shape
  correctness for a given game is instead verified the way Tic-Tac-Toe's
  already is: assertions on `ctx.gameover` in that game's own
  `gameDef.test.ts`.
- Team-based win semantics beyond "an array of winning `playerID`s" — no
  current or planned game needs teams; a multi-winner array reads
  correctly either way (AC1/AC2/AC4), whether or not it represents a
  "team."
