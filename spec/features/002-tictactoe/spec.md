# Feature 002 — Tic-Tac-Toe

## Versioning classification (per tech-stack.md's heuristic)

Brand-new catalog entry, `tictactoe-v1`. There is no prior version of this
game on the platform, so the "additive parameter vs. independent entry"
question doesn't apply yet — this note exists to establish the pattern
future game specs should open with, per the roadmap's instructions for
feature 003 onward.

## Description

A minimal, standard 3x3 Tic-Tac-Toe implementation, registered as the
platform's first real `GameModule`. Its purpose is narrower than "ship a
fun game": it exists to validate the `GameModule` contract end-to-end —
catalog registration, the chrome/board split, and the conformance suite —
against a real game, before any game with meaningfully more complexity
(hidden information, phases, configurable settings) is attempted. The
ruleset is deliberately kept as simple as possible; no house rules, no
timers, no settings.

## Rules

- 2 players, fixed (`minPlayers = maxPlayers = 2`) — no variable seat count,
  sidestepping any ambiguity about partially-filled matches for this first
  game.
- A 3x3 grid, 9 cells, indexed 0–8 left-to-right, top-to-bottom.
- Players alternate turns starting with player `'0'` (`'X'`), placing their
  mark on any empty cell. A move on an already-occupied cell is illegal.
- The game ends when either player forms a horizontal, vertical, or
  diagonal line of three of their own marks (win), or all 9 cells are
  filled with no line formed (draw).
- No hidden information — `G` is fully public. No `playerView` filtering is
  needed; every player and every spectator sees the identical board state.
- No `settingsSchema` — intentionally minimal, per this feature's narrow
  purpose (see Description). A future game exercises the generic settings
  form path (see roadmap.md's placeholder 004).

## User stories

### 1. Playing a full game to a win

As two seated players, we alternate placing marks until one of us
completes a line of three, so that the match ends with a clear winner.

- The board updates after each move, visible to both players and any
  spectator identically (no hidden state).
- Once a line is completed, the game recognizes it as over; no further
  moves are accepted.

### 2. Playing a full game to a draw

As two seated players, we fill the board without either of us completing a
line, so that the match ends in a draw rather than hanging indefinitely
waiting for a move that can't happen.

### 3. Attempting an illegal move

As a seated player, if I try to place a mark on a cell that's already
occupied, my move is rejected and the board is unchanged, so a client-side
bug or a stale board never corrupts match state.

### 4. Plugging into the platform with zero platform-code changes

As the developer validating the `GameModule` contract (this feature's real
purpose), I register `tictactoe-v1` in `gamesCatalog.ts` and it becomes
playable through feature 001's existing room/seat/match flow — host selects
it from the game list, players claim seats 0 and 1, host starts the match —
without modifying anything in `packages/server`'s room logic or
`packages/client`'s chrome components.

## Acceptance criteria

`[unit]` denotes a headless-`Client` test against `game-core`'s Tic-Tac-Toe
`Game` definition. `[conformance]` denotes the shared conformance suite from
feature 001, run against this module. `[component]` denotes a client-side
test of `BoardComponent` in isolation. `[manual]` denotes verification via
the actual room flow, since feature 001's automated coverage didn't include
a real game to plug in.

1. `[unit]` A move placing a mark on an empty cell succeeds and updates `G`.
2. `[unit]` A move targeting an already-occupied cell is rejected
   (`INVALID_MOVE`); `G` is unchanged.
3. `[unit]` Three in a row — horizontal, vertical, and diagonal, for both
   players — is each independently detected as a win with the correct
   winner recorded.
4. `[unit]` A fully filled board with no line is detected as a draw.
5. `[unit]` No further moves are accepted once the game is over (win or
   draw).
6. `[conformance]` `testGameModuleConformance(tictactoeModule, {
   secretKeys: [] })` passes in full — setup validity at exactly 2 players
   (`minPlayers === maxPlayers`), `G` is JSON-serializable, no leak check
   needed (empty `secretKeys`, since there's no hidden information),
   determinism (trivially true — Tic-Tac-Toe uses no randomness at all).
7. `[component]` `BoardComponent`, given a `G`/`ctx` fixture, renders a 3x3
   grid reflecting the current board state, and calls the `play` move with
   the correct cell index when an empty cell is clicked; does not call
   `play` when an occupied cell or a cell is clicked after game-over.
8. `[component]` `BoardComponent` renders only the grid itself — no player
   list, seat controls, or presence indicators; confirms the chrome/board
   split from tech-stack.md holds for a real game, not just the contract's
   type signature.
9. `[manual]` Registering `tictactoe-v1` in `gamesCatalog.ts` (one line)
   makes it selectable from feature 001's room game-selector dropdown, and
   a full match (create room → both seats claimed → start match → play to a
   win/draw) works through the existing room/seat/presence flow with no
   changes to `packages/server`'s room logic or `packages/client`'s chrome
   components outside the one catalog registration line and the new
   `tictactoe` module's own files.

## Non-goals

- Any settings (turn timer, first-player choice, board size) — see
  roadmap.md's placeholder 004 for where that gets exercised instead.
- AI/bot opponents.
- Move history / replay UI.
- Anything requiring `playerView` filtering — this game has no hidden
  information, so it cannot validate that part of the conformance suite
  (feature 001's dummy fixture already covers it structurally; a future
  hidden-information game, per roadmap.md's Love Letter placeholder,
  validates it against a real, shipped game).
