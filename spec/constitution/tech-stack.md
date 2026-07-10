# Tech Stack & Architecture

This document is a set of binding architectural decisions, not a generic
description of the stack. Every decision below is justified; where a
tradeoff was made, the tradeoff is stated explicitly.

## Monorepo layout

npm workspaces, three packages:

```
packages/
  game-core/   # boardgame.io Game definitions. No React, no server code.
  server/      # boardgame.io Server (Koa) + room/presence/permission layer.
  client/      # React app.
```

- **`packages/game-core`** contains only `Game` definitions (moves, phases,
  turn order, `playerView`, the `GameModule` wrapper — see below) plus the
  generic conformance test suite. It has zero dependency on React or on
  Node server APIs, so it can be unit-tested headlessly via boardgame.io's
  `Client` in `multiplayer: false` mode and, later, reused unchanged if a
  non-web client (e.g. a CLI or bot) is ever built.
- **`packages/server`** hosts boardgame.io's `Server` and, alongside it
  (not inside it), the platform's own room/session/presence/permission
  logic and its own HTTP/WebSocket endpoints for room actions. "Alongside"
  is the operative word: boardgame.io's `Server` only knows about matches;
  everything room-shaped is bespoke code living in this package, sharing
  the same Koa process for convenience but a logically separate layer.
- **`packages/client`** is the React app: the platform "chrome" (lobby,
  room, seat manager, presence badges) plus the generic mounting logic that
  instantiates a `GameModule`'s `BoardComponent` inside a boardgame.io
  `Client`.
- `packages/game-core` is a dependency of both `server` (for `gameDef` and
  the catalog, used to configure boardgame.io's `Server`) and `client` (for
  `BoardComponent` and the catalog, used to render).

## Transport

**Single transport: boardgame.io's `SocketIO` transport, everywhere.**
`Local()` is never used, including for solo play.

Solo play is modeled as an ordinary multiplayer match in which one user
claims some or all seats. Justification:

- **Zero divergent code paths.** If solo play used `Local()`, every game
  would effectively need to be correct under two different transports —
  one that talks to the server and one that runs entirely client-side. Any
  server-side validation, storage, or reconnection logic would silently not
  apply to solo games. Using `SocketIO` unconditionally guarantees solo and
  multiplayer matches are byte-for-byte the same code path: same server
  authority, same persistence, same reconnection flow, same presence
  tracking.
- **Solo play gets reconnection for free.** If a user closes the tab
  mid-solo-game, the exact same credentials-in-localStorage + reconnect flow
  used for multiplayer restores it. A `Local()`-based solo mode would need
  its own persistence and resume story built and tested separately.
- **Cost accepted:** solo play incurs a real network round-trip per move
  instead of a synchronous local call. This is an acceptable latency
  tradeoff for the uniformity gained, and is invisible to the user on any
  reasonable connection.

## Multi-seat claiming

- A room member may claim more than one seat only when the host has set
  `Room.allowMultiSeat = true`. This is a room-level toggle, not per-seat.
- A user controlling N seats runs **N separate `boardgame.io` `Client()`
  instances** in the same browser tab — one per claimed `playerID` — each
  configured with the credentials issued by the server at the moment that
  seat was claimed. There is no single "multi-seat client"; multi-seat
  control is N independent single-seat clients coexisting in one tab.
- **Client-side seat switcher.** The client holds an "active seat" concept
  (which of the user's claimed `playerID`s is currently focused/rendered).
  Switching seats is a pure UI operation — it swaps which `Client()`
  instance's state feeds the mounted `BoardComponent`; it does not
  reconnect, unmount, or otherwise disturb the non-active clients, which
  keep running in the background so their state stays live (important for
  e.g. timers or turn notifications on a seat that isn't currently focused).
- **Credentials store**, persisted in `localStorage` (explicitly not
  cookies, so it survives full browser/tab close, not just navigation):

  ```ts
  type SeatCredential = {
    matchID: string;
    playerID: string;
    credentials: string;
  };
  // localStorage key: "tableverse:seatCredentials"
  type SeatCredentialStore = SeatCredential[];
  ```

  On claiming a seat, the server-issued `{ matchID, playerID, credentials }`
  is appended to this array. On load, the client scans this array for any
  entries matching the current room's `matchID` and auto-reconnects each as
  a background `Client()`.
- **Hidden information rule:** if a game has hidden per-player information,
  the client may render **only the currently active seat's view** at any
  moment. State from two claimed seats must never be merged or shown
  simultaneously on screen — this would leak one seat's secret information
  into the other's view. This is enforced at the client rendering layer
  (only the active seat's `Client()` output feeds `BoardComponent`), on top
  of `playerView` already filtering secrets server-side per seat.

## Persistence

Two entirely separate persistence concerns, deliberately not sharing a
schema or an abstraction:

1. **Match persistence** — boardgame.io's own `StorageAPI`, storing game
   log/state (`G`, `ctx`, move log) keyed by `matchID`.
2. **Room persistence** — a platform-owned concern (see "Room vs Match"
   below), storing `Room` documents keyed by `roomID`/`inviteCode`.

**Decision: SQLite for the MVP, with PostgreSQL as the defined upgrade
path, for both concerns.**

Reasoning:

- boardgame.io's most actively maintained community storage adapter is
  [`bgio-postgres`](https://github.com/delucis/bgio-postgres) (built on
  Sequelize), which has first-class, tested PostgreSQL support and only
  unofficial/best-effort MySQL compatibility. This makes PostgreSQL the
  "path of least resistance" long-term choice for match storage.
- However, match state is fundamentally JSON, request volume for the MVP
  (small private rooms, not public matchmaking) is low, and operational
  simplicity matters more than horizontal scalability right now. SQLite
  needs no separate database process, has zero hosting cost, and is trivial
  to reset/inspect during development.
- Sequelize (which `bgio-postgres` and our own room-storage layer are both
  built on) supports SQLite and PostgreSQL through the **same dialect
  abstraction**, so the upgrade path is: swap the Sequelize `dialect`
  config from `sqlite` to `postgres`, point at a real Postgres connection
  string, run migrations. No application code changes required in either
  the match or room storage layer.
- Room storage additionally benefits from Postgres's native `JSONB` type
  for the `gameSettings` field once we outgrow SQLite's weaker JSON
  querying — but this is not needed at MVP scale and is not a reason to
  start with Postgres.

**Swappability requirement:** both the match `StorageAPI` implementation
and the room storage layer must be injected via a narrow interface
(`StorageAPI` for matches; a hand-rolled `RoomRepository` interface for
rooms — see plan.md for its shape). No code in `game-core` or in
room/permission logic may import a database client directly or assume a
specific SQL dialect. This is what makes the SQLite→Postgres migration a
config change instead of a rewrite.

## Identity

**Phase 1 (this MVP): no real accounts.** Identity is a nickname chosen on
first visit plus a client-side session token, persisted in `localStorage`.
No password, no login screen, no server-side auth beyond "this session
token maps to this user record."

**Phase 2 (future, explicitly not built now):** OAuth-based real accounts
(e.g. Google/Discord sign-in), letting a `User` be recognized across
devices.

**Design now, without building Phase 2:**

```ts
interface User {
  id: string;           // stable identifier, server-issued
  displayName: string;  // the nickname; editable
  createdAt: string;
}
```

`User` is deliberately decoupled from *how* a user proved who they are.
Phase 1's "proof" is just "holds the session token in localStorage that the
server previously issued for this `User.id`." Phase 2 would swap that proof
mechanism for an OAuth token/session — without `Room`, seat-claiming, or
permission logic ever needing to change, because none of that code touches
authentication; it only ever reads `User.id`.

**`User` is explicitly not the same thing as boardgame.io `credentials`:**

| Concept | Answers | Scope | Held by |
|---|---|---|---|
| `User` | "Who is this person?" | One per browser session (Phase 1) / one per real person (Phase 2) | Platform identity layer |
| `credentials` (per seat) | "Is this socket allowed to act as `playerID` X in `matchID` Y?" | One per claimed seat | boardgame.io, issued on seat claim |

A single `User` can simultaneously hold `credentials` for multiple seats
(multi-seat claiming, including solo play claiming every seat). Room
membership (`Room.members: { userID, role }[]`) references `User.id`, never
`credentials` — credentials live only in the client's seat-credential store
and in boardgame.io's own match-side auth check.

## Reconnection

On load, the client reads its `SeatCredentialStore` from `localStorage`,
finds entries for the room's current `matchID`, and reconnects each as a
`Client()` using the stored `{ playerID, credentials }` — this is exactly
the multi-seat mounting flow described above, just triggered on page load
instead of on a fresh claim.

This is **independent of the `User`/identity system**: reconnection works
purely off of boardgame.io credentials stored client-side, and requires no
authentication step. A user who clears `localStorage` or switches browsers
loses the ability to reconnect their seats — this is accepted and
documented below as a known limitation, not treated as a bug to route
around with a workaround.

**Explicitly out of scope for the MVP: cross-device reconnection** (resuming
a seat from a device/browser other than the one that claimed it). This
would require the server to know "this seat belongs to this durable
identity" independent of a local credentials blob — i.e. it requires
Phase 2's OAuth-backed identity. Until then, a seat is tied to the device
that claimed it.

## Presence and disconnection handling

boardgame.io has no built-in "player disconnected" concept. This is a
platform-level subsystem layered on top of it.

- **Tracked per seat** (`matchID` + `playerID`), not per user — because one
  `User` may hold multiple seats over multiple sockets, and each seat's
  connection can drop independently.
- **State machine per seat:** `connected → grace_period → released`.
  - On socket disconnect for a seat's `Client()`, start a grace-period
    timer (default 75s, configurable per room/server).
  - Reconnection with valid credentials for that seat before the timer
    fires cancels the timer and returns the seat to `connected`.
  - If the timer expires, the seat becomes `released`-eligible — **it is
    not auto-freed.** The host must explicitly release/reassign it via a
    `manageSeats` action. This avoids a flaky connection silently costing a
    player their seat mid-match.
- **Broadcast channel:** every seat status transition is broadcast to all
  room members over a **dedicated room-presence channel**, separate from
  boardgame.io's own game-state channel. This keeps presence UI (e.g. a
  "Bob — disconnected, reconnecting…" badge) fully decoupled from game
  logic — the game engine never needs to know or care about connection
  state, and presence updates don't require touching `G`/`ctx`.

## Room vs Match

boardgame.io manages **matches**: one game session, fixed `numPlayers`, its
own storage, its own lifecycle. It has no concept of a **room**: a
persistent lobby that a group of people share across possibly many matches
(rematches, switching games, spectators coming and going). Rooms are a
platform-owned entity with their own persistence, independent of
boardgame.io's match storage:

```ts
interface Room {
  roomID: string;
  inviteCode: string;        // private, short, shareable
  hostUserID: string;
  selectedGameID: string;    // key into the game catalog
  currentMatchID: string | null;  // null until a match is created/started
  status: 'lobby' | 'in_game';
  allowMultiSeat: boolean;
  gameSettings: Record<string, unknown>;  // validated against the game's settingsSchema
  members: { userID: string; role: RoomRole }[];
}
```

**State machine:**

- **`lobby`**
  - Host may change `selectedGameID`. This **resets all seat assignments**.
    Rationale: different games have different `minPlayers`/`maxPlayers` and
    different seat semantics; carrying over seat assignments across a game
    change risks stale/invalid assignments (e.g. seat 3 assigned in a
    4-seat game that doesn't exist in the new 2-seat game). Resetting is
    simpler and safer than trying to reconcile.
  - Host may assign/reassign seats, edit `gameSettings` (validated against
    the selected game's `settingsSchema`), and start the match — which
    creates a new boardgame.io `matchID` and transitions the room to
    `in_game`.
- **`in_game`**
  - The game selector is locked (no `changeGame` while a match is live).
  - Host may end the match at any time, which aborts/closes
    `currentMatchID` and returns the room to `lobby`.
  - **Ending a match without changing the selected game preserves seat
    assignments** — this is the deliberate "quick rematch" path: the group
    can immediately start a new match of the same game with the same
    seating, without re-claiming seats.
  - Changing the selected game always resets seats, per the `lobby` rule
    above (checked/enforced even though the selector is normally locked
    during `in_game`, since ending a match returns to `lobby` first).

**Spectators require no special-case code.** Any room member who has not
claimed a seat is simply mounted as a boardgame.io `Client()` with
`playerID: undefined` — boardgame.io's native spectator mode. There is no
separate "spectator" code path to build or maintain.

**Per-game risk to flag explicitly:** boardgame.io's spectator mode receives
the *default* `playerView` output for "no player" — if a game's `playerView`
does not correctly strip hidden information for the no-`playerID` case, a
spectator will see secrets meant only for seated players. This is called
out as a mandatory check in the conformance suite (see "Testing strategy").

## Game module contract

The single formal contract every game must implement. Nothing in
`packages/server` or `packages/client` may branch on a specific game's
identity — all game-specific behavior must be reachable only through this
interface.

```ts
interface GameModule {
  id: string;                            // versioned, e.g. "tictactoe-v1"
  displayName: string;
  minPlayers: number;
  maxPlayers: number;
  gameDef: Game;                         // boardgame.io Game definition
  BoardComponent: React.FC<BoardProps>;  // renders ONLY the play area
  settingsSchema?: JSONSchema;           // optional per-game room settings
}
```

- **Chrome vs board split.** The platform renders all shared UI: player
  list, seat management controls, connection/presence badges, and (if ever
  added) chat. `BoardComponent` renders **only** the game's play surface —
  board, pieces, hand, action buttons specific to the game. This boundary
  is enforced starting with the very first game built (Tic-Tac-Toe, feature
  002); if it is allowed to blur early, later games will informally grow
  dependencies on chrome internals owned by an earlier game, and the
  contract stops being enforceable.
- **`settingsSchema`** lets a game declare its own configurable room-level
  options (e.g. a turn timer, a house rule toggle) as a JSON Schema, without
  the platform ever needing to know what those options mean. The platform's
  only job is to render a generic form from the schema and persist
  submitted values under `Room.gameSettings` — there is no per-game
  branching anywhere in platform code to support this.
- **`gamesCatalog`** is the single registration point (a plain array/map of
  `GameModule`s) that both `server` (to configure boardgame.io's `Server`
  and validate `selectedGameID`/`gameSettings`) and `client` (to look up
  which `BoardComponent` and `settingsSchema` to render) import. **Adding a
  game = writing a new `GameModule` + one line in this catalog.** No other
  file in `packages/server` or `packages/client` should require a change —
  feature 002 (Tic-Tac-Toe) exists specifically to prove this end-to-end.

## Rules versioning strategy

Every `GameModule.id` is versioned (e.g. `loveletters-v1`). **Once a
published version has real matches recorded against it, it is never mutated
or deleted** — boardgame.io reconstructs match state by replaying the move
log against the `Game` definition, so retroactively changing rules can
corrupt replay/resume of existing matches.

Two strategies, chosen per change:

1. **Additive/parametric changes** — e.g. an expansion that adds player
   slots or cards without altering core turn structure or win condition.
   Model as **one `GameModule`**, with the variant exposed as an `edition`
   (or similar) field in `settingsSchema` (e.g.
   `edition: 'classic-v1' | 'expanded-v2'`), resolved inside `setup`/moves
   at match-creation time. One codebase serves multiple compatible rule
   variants.
2. **Structural changes** — a different turn/phase structure, a different
   win condition, an edition with a different activation system. Register
   as a **fully independent catalog entry** with its own `id`. Structurally
   different rule sets never share a single `Game` definition gated by
   conditionals; they may share low-level utility code (e.g. hex-grid math)
   via a shared internal module, but never share the `Game` definition
   itself.

**Heuristic (apply verbatim when deciding):** *If the new version is a
superset of the old one, it's a parameter of the same module. If it changes
or removes base rules (turn structure, win condition, phases), it's an
independent catalog entry.*

## Permissions model

Room-level permissions are **data**, not scattered
`if (userID === room.hostUserID)` checks. Two roles for the MVP —
`host`, `member` — structured so adding more roles later touches only the
map below, never call sites:

```ts
type RoomRole = 'host' | 'member';
type RoomAction =
  | 'changeGame' | 'kickPlayer' | 'manageSeats' | 'startMatch'
  | 'endMatch'   | 'editRoomSettings'
  | 'claimSeat'  | 'leaveSeat';

const ROOM_PERMISSIONS: Record<RoomRole, Set<RoomAction>> = {
  host: new Set([
    'changeGame', 'kickPlayer', 'manageSeats', 'startMatch',
    'endMatch', 'editRoomSettings',
    'claimSeat', 'leaveSeat', // host is always a member too and must be able to play
  ]),
  member: new Set(['claimSeat', 'leaveSeat']),
};

function canPerform(role: RoomRole, action: RoomAction): boolean {
  return ROOM_PERMISSIONS[role]?.has(action) ?? false;
}
```

Every server-side room action handler must call `canPerform` before
executing — no handler may inline its own role check.

## Known engine limitations

Documented explicitly so implementation does not attempt to fight the
framework:

- **Simultaneous-action / turn-less games (e.g. The Mind) are supported**
  via `setActivePlayers({ all: Stage.NULL })`, keeping every player
  permanently active with nothing to yield. This is a supported pattern,
  not a gap.
- **Fair, millisecond-precision reflex racing (e.g. Jungle Speed) is NOT
  supported and will not be built around.** boardgame.io is
  server-authoritative: "who acted first" is decided by server arrival
  order of network packets, which reflects each player's network latency,
  not their real reaction time. Games whose core mechanic depends on
  symmetric-fairness reflex racing are excluded from this platform (see
  mission.md).
- **All randomness must go through boardgame.io's `random` plugin API**,
  never `Math.random()` — required for deterministic server-side replay of
  the move log.
- **`G` must be JSON-serializable**: plain objects/arrays only. No class
  instances, `Map`/`Set`, functions, or circular references.
- **No built-in continuous-time simulation.** The engine is discrete and
  move-based. Chess clocks, decision timers, or any countdown must be
  built manually (client-side visual timer + server-side deadline check
  performed on move receipt) — there is no native ticking clock.
- **`playerView` is a flat per-player state filter, not a spatial
  visibility engine.** Fog-of-war / line-of-sight systems must be
  implemented entirely inside a game's own logic; the engine provides no
  help beyond "filter this JSON object per player."
- **No first-class non-player turn actor** (AI factions, environment
  turns). Must be modeled as a regular `playerID` driven by server-side
  logic in that game's own moves/phases — not a native framework feature.

## Testing strategy

- **Unit tests** for `game-core` rules, using boardgame.io's headless
  `Client` (no transport, no React).
- **Generic `GameModule` conformance suite**, built once at
  `packages/game-core/testing/conformance.ts`, exporting a single
  `testGameModuleConformance(module: GameModule)` function that every game
  module's own test file calls against itself. It verifies, for any
  `GameModule`:
  - `setup` produces a valid initial state at both `minPlayers` and
    `maxPlayers`.
  - `G` is JSON-serializable at every point along a played-out game.
  - `playerView` never leaks one player's hidden state to a spectator
    (`playerID: undefined`) or to another player.
  - Replaying the same move log against the same seed is deterministic.

  This is the automated enforcement of the `GameModule` contract, not just
  documentation of it — a game module is not considered done until it
  passes this suite.
- **Integration tests** for server room/presence/permission logic, run
  against an in-memory or throwaway database instance, via a separate
  `test:integration` script (slower; not run on every save).
- **Component tests** for client `BoardComponent`s in isolation (mounted
  with mock game state, no real server).
- **End-to-end tests (Playwright)**, minimal, covering only the critical
  happy path: create room → join via invite code → claim seats → play a
  full match → disconnect/reconnect. Run in CI on the main branch, not on
  every PR, given their cost.
- **Command split:** unit + conformance tests run fast on every commit;
  integration and e2e run in CI before merge/deploy.

## Language and tooling

- **TypeScript across all three packages.** boardgame.io ships typed
  `Game`/`Ctx`/`Move` interfaces, and the `GameModule` contract above is
  itself a TypeScript interface that needs compile-time enforcement — a
  game module with a mismatched `BoardComponent` prop shape or a
  `gameDef` that doesn't satisfy `Game` should fail to compile, not fail at
  runtime in someone's browser.
- **Linting/formatting:** ESLint (`@typescript-eslint`) + Prettier, run as
  a pre-commit check and in CI. Strict TypeScript config
  (`strict: true`) across all packages, since the correctness of shared
  contracts (`GameModule`, `Room`, `User`) depends on the type system
  actually catching mismatches.
- **Workspace tooling:** npm workspaces (no need for a heavier tool like
  Turborepo/Nx at this project's current size); revisit only if build times
  become a real problem.
