# Feature 001 — Platform Core: Implementation Plan

This plan implements spec.md against the architecture fixed in
`spec/constitution/tech-stack.md`. It does not revisit decisions already
made there (SQLite-first storage, SocketIO-only transport, etc.) — only how
those decisions map onto concrete modules and files.

## Module / file layout

```
packages/shared/
  src/
    room.ts                   # Room, RoomStatus types
    user.ts                   # User type
    permissions.ts            # RoomRole, RoomAction, ROOM_PERMISSIONS, canPerform
    seatCredential.ts          # SeatCredential, SeatCredentialStore types
  package.json / tsconfig.json

packages/game-core/
  src/
    types.ts                 # GameModule, BoardProps interfaces
    gamesCatalog.ts           # registry — empty of real games in this feature
  testing/
    conformance.ts            # testGameModuleConformance(module, options)
    fixtures/
      dummyGame.ts             # minimal valid GameModule, test-only
      dummyGame.conformance.test.ts   # proves the suite passes/fails correctly
  package.json / tsconfig.json

packages/server/
  src/
    index.ts                  # Koa app bootstrap: boardgame.io Server + room routes mounted together
    bgio/
      serverConfig.ts          # boardgame.io Server(...) config: transport, storage adapter wiring
      storage/
        sqliteStorageAdapter.ts   # StorageAPI implementation (SQLite via Sequelize/bgio-postgres-style adapter)
    rooms/
      roomRepository.ts        # RoomRepository interface + SQLite implementation
      roomService.ts           # room lifecycle: create, join, changeGame, startMatch, endMatch
      seatService.ts           # claimSeat, leaveSeat, releaseSeat
      roomRoutes.ts             # HTTP/WS endpoints for room actions, wired through permissions.canPerform
    presence/
      presenceStore.ts          # in-memory per-seat state: connected | grace_period | released
      presenceTimers.ts         # grace-period timer management
      presenceChannel.ts        # dedicated broadcast channel (Socket.IO namespace/room), separate from bgio's own
    identity/
      userRepository.ts         # User persistence (SQLite)
      sessionMiddleware.ts      # resolves session token -> User
  test/
    integration/
      rooms.test.ts
      seats.test.ts
      presence.test.ts
      permissions.test.ts
  package.json / tsconfig.json

packages/client/
  src/
    identity/
      useSession.ts             # nickname + session token, localStorage-backed
    seats/
      seatCredentialStore.ts    # localStorage-backed SeatCredentialStore, read/write/reconnect-scan
      useSeatClients.ts          # mounts one boardgame.io Client() per claimed seat; exposes active-seat switcher
    room/
      RoomShell.tsx              # chrome: player list, seat manager, presence badges, game selector
      SeatSwitcher.tsx
      PresenceBadge.tsx
    gameMount/
      GameMount.tsx              # looks up GameModule from catalog by Room.selectedGameID, mounts BoardComponent
    api/
      roomApi.ts                 # typed client for room HTTP/WS endpoints
  package.json / tsconfig.json
```

**Decision: a fourth workspace package, `packages/shared`,** holds
`Room`/`User`/`SeatCredential` types and `permissions.ts`
(`RoomRole`, `RoomAction`, `ROOM_PERMISSIONS`, `canPerform`). This keeps
`game-core` strictly game-rules-only (no platform types leak into the
package that's meant to be reusable outside a web context), at the cost of
one extra package to configure/build — accepted as worth it for keeping
`game-core`'s charter clean. Both `packages/server` (for enforcement) and
`packages/client` (for optimistic UI gating and rendering `Room` state)
depend on `packages/shared`; neither depends on the other's internals.

## boardgame.io Server configuration

`packages/server/src/bgio/serverConfig.ts`:

- `Server({ games: [...gamesCatalog.map(m => m.gameDef)], transport: SocketIO({ ... }), db: sqliteStorageAdapter })`.
- Transport: `SocketIO` unconditionally (per tech-stack.md — no `Local()`
  anywhere, including in tests that exercise the real server; headless
  `Client` unit tests in `game-core` don't go through `Server` at all).
- `games` is derived directly from `gamesCatalog` — the server never lists
  a game by name itself, only by iterating the catalog. In this feature the
  catalog is empty of real games; only the test fixture exists, and it is
  **not** passed into the real `Server` config (it's exercised only via the
  conformance suite's own harness, which uses boardgame.io's `Client` in
  headless mode, not a running `Server`).
- The `Server`'s own HTTP server and the room-routes Koa app are mounted on
  the same Koa instance/process for deployment simplicity (one process to
  run), but as separate route trees — `packages/server/src/index.ts` is the
  only file that wires them together.

## Room persistence layer

`RoomRepository` interface (mirrors the `StorageAPI` swappability
requirement from tech-stack.md — no caller may depend on the concrete
implementation):

```ts
interface RoomRepository {
  create(room: Room): Promise<void>;
  getById(roomID: string): Promise<Room | null>;
  getByInviteCode(inviteCode: string): Promise<Room | null>;
  update(roomID: string, patch: Partial<Room>): Promise<void>;
}
```

- SQLite implementation via Sequelize (same ORM family as the
  Postgres-oriented `bgio-postgres`, per tech-stack.md's upgrade-path
  reasoning), with a single `rooms` table:

  | column | type | notes |
  |---|---|---|
  | `room_id` | TEXT PK | |
  | `invite_code` | TEXT, unique index | 6 chars, generated per scheme below |
  | `host_user_id` | TEXT | FK to `users.user_id` |
  | `selected_game_id` | TEXT, nullable | |
  | `current_match_id` | TEXT, nullable | |
  | `status` | TEXT | `'lobby' \| 'in_game'` |
  | `allow_multi_seat` | BOOLEAN | |
  | `game_settings` | TEXT (JSON-serialized) | SQLite has no native JSON type; becomes native `JSONB` on the Postgres upgrade path |
  | `members` | TEXT (JSON-serialized) | `{userID, role}[]`; small enough to not need a join table for the MVP |
  | `created_at` / `updated_at` | TEXT (ISO) | |

**Invite code scheme (decided):** 6 characters, drawn from the 32-character
alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (uppercase alphanumeric minus
the visually ambiguous `O/0/I/1`), giving ~1.07 billion combinations —
comfortably typeable/shareable while resistant to casual guessing given
rooms carry no separate password. Generation: draw 6 random characters from
the alphabet, attempt insert, and on a unique-constraint conflict (expected
to be exceedingly rare at this scale) regenerate and retry.

- `currentMatchID` is the *only* link between a `Room` and boardgame.io's
  own match storage. The room layer never reads boardgame.io's storage
  directly and vice versa — they are joined only by this ID, looked up
  independently by whichever side needs it (e.g. the client asks the
  room API for `currentMatchID`, then connects to boardgame.io's transport
  using that ID directly).
- Seat *assignments* (which `playerID` maps to which `userID` for the
  currently selected game) are **not** columns on `Room` — the schema above
  intentionally has no `seats` field. Seat assignment is tracked in a
  separate `room_seats` table (`room_id`, `player_id`, `user_id`,
  `claimed_at`), because seat state needs to be queried/updated
  independently of the rest of the room document (frequent writes on
  claim/release shouldn't require read-modify-write of the whole `Room`
  row) and because it must survive independently of `gameSettings`
  resets. `seatService.ts` owns this table exclusively.

## GameModule contract and gamesCatalog

`packages/game-core/src/types.ts` — the `GameModule` and `BoardProps`
interfaces exactly as specified in tech-stack.md, plus:

```ts
interface BoardProps {
  G: unknown;
  ctx: Ctx;
  moves: Record<string, (...args: unknown[]) => void>;
  playerID: string | null;
  isActive: boolean;
}
```

`packages/game-core/src/gamesCatalog.ts`:

```ts
export const gamesCatalog: GameModule[] = [
  // populated starting in feature 002; empty here.
];

export function getGameModule(id: string): GameModule | undefined {
  return gamesCatalog.find(m => m.id === id);
}
```

This is the **only** file that changes when a new game is added (plus the
new game's own module files) — enforced structurally by every other
package importing games exclusively through `getGameModule`/`gamesCatalog`,
never by importing a specific game module path directly.

## Conformance test suite

`packages/game-core/testing/conformance.ts` exports:

```ts
function testGameModuleConformance(
  module: GameModule,
  options: { secretKeys: string[] },
): void
```

Implemented using the test runner's own `describe`/`it` (so calling this
function from a module's test file registers real test cases in that
file's suite), covering exactly the four checks from tech-stack.md:

1. **Setup validity** — instantiate a headless `Client({ game: module.gameDef, numPlayers: n })` for `n = module.minPlayers` and `n = module.maxPlayers`, assert `getState()` is non-null and matches no built-in error state.
2. **Serializability** — after a short scripted sequence of legal moves (or, if the fixture/game exposes no generic "any legal move" helper, after just `setup`), run `JSON.parse(JSON.stringify(G))` and deep-equal it against `G` — catches class instances, `Map`/`Set`, functions.
3. **`playerView` leakage** — for each `playerID` and for `undefined`
   (spectator), compute `playerView(G, ctx, playerID)` and assert no key
   listed in `options.secretKeys` appears for a `playerID` other than its
   owner, nor for `undefined`. **Decision:** the generic suite cannot infer
   which `G` keys are hidden per-player for an arbitrary game, so each
   game's own test file must explicitly declare them:
   `testGameModuleConformance(module, { secretKeys: ['hand', 'deck'] })`.
   This `options` argument is test-only metadata passed alongside the
   module at the call site — it is not added to the shipped `GameModule`
   interface in tech-stack.md, since it has no runtime purpose outside the
   test harness. Chosen over structural diffing of `playerView` outputs
   across players because it's simpler to implement, gives unambiguous
   failure messages ("secret key `hand` was visible to spectator"), and
   won't false-flag legitimately shared public fields that happen to differ
   in shape between players.
4. **Determinism** — run the same fixed move log twice against the same
   seed, assert identical resulting `G`.

`packages/game-core/testing/fixtures/dummyGame.ts` — a minimal
2-4-player `GameModule` (not exported from `gamesCatalog`, not
game-catalog-registered, existing purely as conformance-suite test
infrastructure) with:
- one hidden per-player field (to exercise the `playerView` check),
- one move that mutates `G`,
- `random` plugin usage (to exercise determinism replay).

`dummyGame.conformance.test.ts` calls `testGameModuleConformance` against
the correct fixture (must pass) and, in a second describe block, against a
deliberately broken copy of the fixture whose `playerView` omits the
filtering step (must fail) — this is the "verify both directions" check
called for in the roadmap prompt. Task-level detail lives in tasks.md.

## Presence and reconnection subsystem

- **Where the timer lives:** `packages/server/src/presence/presenceTimers.ts`,
  in-process (`Map<seatKey, NodeJS.Timeout>`, `seatKey = matchID:playerID`).
  Not persisted to the database — a server restart is treated as "all
  in-flight grace periods lost, seats become immediately released-eligible
  on next presence check," which is acceptable for the MVP's small-scale
  deployment. **Decision:** this in-process design (and the `/presence`
  namespace's in-memory room membership) is accepted as an explicit
  single-server-instance constraint for the MVP, not designed against a
  shared store now. If the server is ever horizontally scaled, both the
  timer map and the presence namespace's room membership would need to move
  to a shared store (e.g. Redis pub/sub) — documented here as a known
  future migration, not an oversight.
- **Broadcast:** a dedicated Socket.IO namespace (e.g. `/presence`),
  separate from boardgame.io's own Socket.IO namespace/transport, joined
  per-room (`socket.join(roomID)`). Presence events:
  `{ type: 'seatStatusChanged', roomID, playerID, status }`. The game-state
  channel (boardgame.io's own) is never used to carry presence data.
- **Client-side store:**

  ```ts
  // localStorage key: "tableverse:seatCredentials"
  type SeatCredential = { matchID: string; playerID: string; credentials: string };
  type SeatCredentialStore = SeatCredential[];
  ```

  `seatCredentialStore.ts` provides `add`, `remove`, `getForMatch(matchID)`.
  `useSeatClients.ts` calls `getForMatch(currentMatchID)` on mount and
  instantiates one background `Client()` per stored credential, using
  `SocketIO({ ... })` transport configured with that seat's
  `{ playerID, credentials }` — this is the reconnection flow, and it is
  literally the same code path used for a fresh multi-seat claim (a claim
  just additionally calls `add(...)` first).

## Permissions module

`permissions.ts` — the exact `ROOM_PERMISSIONS`/`canPerform` shown in
tech-stack.md, in the shared location discussed under "Module layout"
above. Enforcement point: every handler in `roomRoutes.ts` (and any
socket-based room-action handler) calls
`canPerform(actorRole, action)` as its **first** statement before touching
`roomService`/`seatService`, and returns a rejection (HTTP 403 / socket
error ack) if it returns `false`. No permission logic is duplicated inside
`roomService`/`seatService` — those layers trust that the caller
(`roomRoutes.ts`) already checked.

## Chrome / BoardComponent split

- `RoomShell.tsx` owns: player list (with roles), seat manager (claim /
  release / reassign UI, gated client-side by `canPerform` for
  responsiveness, re-checked server-side regardless), presence badges (fed
  by the `/presence` channel), the game selector (host-only, `lobby`-only),
  and the generic settings form rendered from the selected game's
  `settingsSchema`.
- `GameMount.tsx` is the seam: it looks up the `GameModule` for
  `Room.selectedGameID`, and for the currently active seat (from
  `useSeatClients`) renders `<module.BoardComponent {...boardProps} />`
  inside the area `RoomShell` reserves for it. `GameMount` passes
  `BoardComponent` nothing about rooms, seats, or presence — only the
  standard boardgame.io board props for the active seat's `Client()`.
  This file is the only place that imports a `BoardComponent` by way of the
  catalog lookup; no other client file imports a `BoardComponent` directly.

## Resolved architectural decisions

The following were flagged as open risks during planning and have since
been decided; recorded here for traceability:

1. **Shared-types package** — a new `packages/shared` package holds
   `Room`/`User`/`SeatCredential`/`permissions.ts`, keeping `game-core`
   strictly game-rules-only. See "Module / file layout" above.
2. **Conformance suite leak detection** — an explicit `secretKeys: string[]`
   passed by each game's test file at the `testGameModuleConformance` call
   site, over structural diffing. See "Conformance test suite" above.
3. **Invite code scheme** — 6 characters, 32-character ambiguity-free
   alphabet, generate-and-retry-on-conflict. See "Room persistence layer"
   above.
4. **Presence timers** — accepted as an in-process, single-server-instance
   design for the MVP; a shared store (e.g. Redis) is a documented future
   migration, not built now. See "Presence and reconnection subsystem"
   above.
5. **Seat storage** — a separate `room_seats` table rather than a JSON
   column on `Room`, for write isolation on claim/release; `RoomRepository`
   still returns a merged `Room` object matching the shape in
   tech-stack.md/spec.md, so this is purely an internal storage detail. See
   "Room persistence layer" above.
6. **Host seat permissions (discovered during task 1.4 implementation).**
   tech-stack.md's `ROOM_PERMISSIONS` map, copied verbatim, left `host`
   without `claimSeat`/`leaveSeat`, which would make it impossible for the
   room creator to ever claim a seat — directly breaking spec.md's user
   story 4 (solo play, which requires the host to claim every seat) and
   story 1. **Decision:** `host`'s permission set now explicitly includes
   `claimSeat` and `leaveSeat` alongside its host-only actions (host is
   always a room member too). This is a pure data change to the
   `ROOM_PERMISSIONS` map — `canPerform`'s logic and every call site are
   unchanged. tech-stack.md's code sample has been corrected to match.
7. **Seat claiming vs. credential issuance timing (discovered during task
   3.4 implementation).** boardgame.io credentials are scoped to a specific
   `matchID`, but seat claiming happens in the lobby, before
   `currentMatchID` exists. **Decision: two-phase.** `claimSeat` while
   `status === 'lobby'` only writes a `room_seats` row (userID↔playerID
   reservation, no credentials). `startMatch` mints real
   `{matchID, playerID, credentials}` for every already-claimed seat in one
   batch when it creates the new boardgame.io match, and pushes each triple
   to its owning user. `claimSeat` while `status === 'in_game'` (e.g.
   reclaiming a seat the host just released) mints credentials immediately,
   since a matchID already exists at that point. spec.md's user story 3 and
   acceptance criterion 6 were updated to reflect this two-phase reality
   instead of promising a credential at every claim.
   **Implementation follow-up (found during task 5.2's AC-to-test
   verification pass):** the decision above was recorded here but never
   actually implemented — `SeatService.claimSeat` never minted credentials
   under any circumstance. Fixed by adding `RoomService.claimSeat`
   (mints+persists via storage only when `status === 'in_game'`) and
   `RoomService.getMyCredentials` (lets a user other than whoever called
   `startMatch`/`claimSeat` pull their own credential on their next room
   fetch, since `startMatch`'s batch only returns credentials to its single
   caller). See tasks.md's 5.2 entry for the full detail and the one
   acknowledged follow-up (an already-open tab doesn't auto-remount a
   newly-available seat's `Client()` without a refresh).
