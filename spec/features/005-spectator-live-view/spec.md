# Feature 005 — Spectator Live View

## Description

Closes a gap between feature 001's spec.md and its actual implementation,
found during an explicit audit requested after a multi-seat bug fix. Story
5 and acceptance criterion 9 of feature 001 promise that a room member with
no claimed seat can watch the match live, mounted as a real boardgame.io
spectator (`playerID: undefined`) — "without any room/server code branching
on 'is this user a spectator.'" What actually shipped: `GameMount` renders
a static `Spectating {displayName} (no seat claimed).` string and never
mounts a `Client()` for a spectator at all. This was a known, documented
shortcut at the time (feature 001's `tasks.md`: "AC9 → covered structurally
rather than by one dedicated test"), not a regression — but it means the
promised behavior was never actually built. This feature builds it.

No changes to any game module are needed — this is entirely a platform/
chrome concern (`packages/client`'s `useSeatClients`/`GameMount`), exercised
against Tic-Tac-Toe (feature 002) since it's the only real `GameModule`
that exists so far.

## User stories

### 1. Watching a match with no seat claimed

As a room member who has not claimed a seat in the current match, I see the
live board update as seated players make moves, so that I can follow the
game without needing a seat of my own.

- I am mounted as a boardgame.io spectator (`playerID: undefined` /
  `null`), the same `Client()` mechanism used for a claimed seat, just with
  no `playerID` and no `credentials`.
- The board re-renders on every state change a seated player's move
  produces, with no manual refresh needed.
- I cannot make moves — the spectator view never receives a `moves` object
  that would let `GameMount`/`BoardComponent` call one (or, if it does,
  every call is a no-op enforced by boardgame.io's own multiplayer
  transport, which already rejects moves from an unauthenticated
  connection — this feature does not add a new enforcement layer beyond
  what boardgame.io already guarantees for playerless clients).

### 2. Spectator view respects hidden information

As a spectator watching a game with hidden information (a future game, not
Tic-Tac-Toe — see Non-goals), I never see any field a seated player's
`playerView` marks as hidden, so that spectating never leaks a secret no
seated player themselves can see.

- The spectator `Client()` is mounted with no `playerID`, so the game's own
  `playerView({ G, ctx, playerID: null })` (or `undefined`, per
  boardgame.io's convention) governs exactly what state reaches it — the
  same mechanism feature 001's conformance suite already validates
  (`secretKeys`), not a new one.

### 3. Switching from spectating to a claimed seat

As a spectator who then claims an open seat, my view switches from the
read-only spectator `Client()` to my own seat's `Client()`, so that I don't
need to reload the page to start participating.

- This composes with the existing `SeatSwitcher`/multi-seat machinery from
  feature 001 — claiming a seat while spectating is just the existing
  claim flow; the spectator `Client()` is torn down once a seat's `Client()`
  takes over as the active view.

## Acceptance criteria

`[component]` denotes a client-side test of `GameMount`/`useSeatClients` in
isolation, mocking boardgame.io's `Client`. `[manual]` denotes verification
via the actual room flow (two browser sessions, one seated one not), since
this is inherently a live-multiplayer-transport behavior no unit test fully
substitutes for.

1. `[component]` When a room has a `currentMatchID` and the current user
   holds no seat in it, `GameMount` mounts a boardgame.io `Client()` with
   `playerID: null` (or omitted, per boardgame.io's spectator convention)
   instead of rendering a static placeholder string.
2. `[component]` The spectator `Client()`'s state updates (subscribed the
   same way a claimed seat's state already is in `useSeatClients`) are
   reflected in `GameMount`'s rendered `BoardComponent` props on every
   change — proven with a fixture that pushes two successive states through
   the mocked client and asserts the rendered output updates both times.
3. `[component]` If the user holds one or more claimed seats in the current
   match, the spectator `Client()` path is never taken — claimed-seat
   `boardProps` (via `SeatSwitcher`'s active seat) always take priority,
   preserving feature 001's existing multi-seat behavior unchanged.
4. `[component]` No moves are ever dispatched from the spectator view —
   `BoardComponent` receives either no `moves` object or one that boardgame.io
   itself will reject for an unauthenticated/playerless connection (verified
   structurally: the spectator `Client()` is constructed with no
   `playerID`/`credentials`, matching how boardgame.io's own multiplayer
   transport already scopes move authority).
5. `[manual]` Two browser sessions against the real dev server: host claims
   a seat and starts a match against Tic-Tac-Toe; a second, unseated member
   in the same room sees the board render and update live as the host
   plays, with no page reload.
6. `[manual]` The second member then claims the remaining open seat — their
   view switches from the live (read-only) spectator board to their own
   interactive seat, without a page reload.

## Non-goals

- A dedicated "spectator count" or "who's watching" UI — out of scope,
  this feature only makes the *board* live for a spectator, not any social/
  presence surface beyond what feature 001's presence badges already show
  for seated players.
- Validating the hidden-information guarantee (story 2) against a real
  hidden-information game — Tic-Tac-Toe has no hidden information, so this
  can only be validated structurally (the same `playerView` mechanism the
  conformance suite already checks) until a hidden-information game exists
  (roadmap.md's Love Letter placeholder).
- Spectator chat or any interaction beyond watching — explicitly a
  non-goal of feature 001 too, unchanged here.
