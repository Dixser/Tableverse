# Roadmap

Features are ordered strictly by **dependency**, not by priority: each
feature below assumes every feature above it is complete, because it either
consumes an interface the earlier feature defines or validates that
interface end-to-end.

## 001 — Platform core

The shared foundation every game plugs into. No specific game ships as
part of this feature. Delivers:

- Identity: nickname + client-side session (`User`), per
  tech-stack.md's Phase 1 identity design.
- Room creation and joining via a private, shareable invite code.
- Seat claiming, including multi-seat claiming gated by
  `Room.allowMultiSeat`, and solo play as a special case of multi-seat
  claiming (one user claims every seat).
- The `Room` state machine (`lobby` / `in_game`), including the
  game-change-resets-seats and match-end-preserves-seats rules.
- Presence and reconnection: per-seat connection tracking, grace-period
  timer, release-by-host, the room-presence broadcast channel, and the
  client-side seat-credentials store in `localStorage`.
- The permissions model (`ROOM_PERMISSIONS` / `canPerform`), enforced on
  every room action.
- Generic wiring for boardgame.io's `Server` (SocketIO transport, pluggable
  `StorageAPI`) and `Client` mounting on the frontend, built against the
  `GameModule` contract — but with no real `GameModule` registered yet
  beyond the test fixture used by the conformance suite.
- The `GameModule` contract itself and the generic conformance test suite
  (`packages/game-core/testing/conformance.ts`), since every subsequent
  feature depends on this contract existing and being correct before any
  game is built against it.

This feature is the dependency root for everything else in this roadmap:
no game can be added until the catalog mechanism, chrome/board split, and
room/seat/presence machinery it plugs into all exist.

## 002 — Tic-Tac-Toe

A minimal, intentionally trivial `GameModule` (2 players, no
`settingsSchema`) whose entire purpose is to validate the platform core's
`GameModule` contract end-to-end: catalog registration, the chrome/board
split, and the conformance suite, before any game with real complexity
(hidden information, phases, multiple settings) is attempted.

If implementing Tic-Tac-Toe requires touching anything in
`packages/server` or `packages/client` outside of its own game module and
its one line in `gamesCatalog`, that is a signal the platform core's
contract has a gap — not something to special-case around.

## 003 — UI Styling

Not part of the original dependency-ordered sequence below — inserted
ahead of it by explicit user priority once feature 002 proved the
`GameModule` contract holds for a real game. Establishes a global
stylesheet for the platform chrome and a per-game CSS convention (scoped,
colocated with each game's `BoardComponent`), validated by fixing
Tic-Tac-Toe's board to render as an actual 3x3 grid. Depends on feature
002 existing (needs a real `BoardComponent` to restyle) but has no
dependency relationship with the hidden-information/settings-game
candidates below — it could equally have been sequenced after either of
them; it was prioritized here purely because the current unstyled UI was
the more pressing problem.

## Later candidates (placeholders — not specced yet)

These are provisional next games, listed only to sanity-check that the
platform core and the versioning heuristic in tech-stack.md generalize
beyond Tic-Tac-Toe. Each will get its own spec → plan → tasks cycle when
its turn comes, including an explicit up-front decision (per the versioning
heuristic) on whether it's a new catalog entry or an `edition` of an
existing one.

- **004 — Love Letter** (candidate): small hidden-information card game.
  Chosen as the next step up in complexity specifically to exercise
  `playerView` filtering and the spectator hidden-information risk called
  out in tech-stack.md, which Tic-Tac-Toe (no hidden information) cannot
  validate.
- **005 — TBD**: a game with a configurable `settingsSchema` (e.g. a house
  rule or turn timer), to exercise the generic settings-form rendering
  path that neither Tic-Tac-Toe nor Love Letter necessarily requires.
