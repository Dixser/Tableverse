# Feature 001 — Platform Core: Tasks

Ordered so the `GameModule` contract and its conformance suite exist before
(or alongside) the catalog — every future game, starting with feature 002,
depends on this suite being built and correct first. Server-side
room/presence/permission logic is built and tested before any client UI,
since the client only ever consumes contracts the server already exposes.

Each task is checked off only after its own verification step passes.

## 0. Monorepo scaffolding

- [x] 0.1 Root `package.json` with npm workspaces (`packages/*`), root
      `tsconfig.base.json` (strict mode), root ESLint + Prettier config.
      **Verify:** `npm install` succeeds at the root.
- [~] 0.2 `packages/shared`, `packages/game-core`, `packages/server`,
      `packages/client` each get a `package.json` + `tsconfig.json`
      extending the root config, and an empty `src/` (or `src/`+`testing/`
      for game-core).
      **Verify:** `npm run build --workspaces` (or per-package `tsc
      --noEmit`) succeeds on empty packages. (package.json/tsconfig done;
      final typecheck verified once real source files land in section 1.)
- [x] 0.3 Pick and wire a test runner (Vitest) for all four packages, plus
      a root `test:unit` script that runs `game-core` unit/conformance
      tests and `shared` tests (fast, every-commit tier) and a separate
      `test:integration` script scoped to `packages/server` (slower tier).
      **Verify:** `npm run test:unit` runs successfully with zero tests
      collected.

## 1. `packages/shared` — types and permissions

- [x] 1.1 `src/user.ts` — `User` interface per tech-stack.md.
- [x] 1.2 `src/room.ts` — `Room`, `RoomStatus` interfaces per spec.md/plan.md
      (note: `members` only — seat assignments are a server storage detail
      per plan.md's `room_seats` decision, not part of this shared type).
      Also added `src/seat.ts` (`SeatAssignment`, `SeatPresence`,
      `SeatStatusChangedEvent`) — not explicitly listed in plan.md's file
      layout but needed as shared types between server and client for the
      presence/seat-assignment wire format.
- [x] 1.3 `src/seatCredential.ts` — `SeatCredential`, `SeatCredentialStore`
      types per plan.md.
- [x] 1.4 `src/permissions.ts` — `RoomRole`, `RoomAction`,
      `ROOM_PERMISSIONS`, `canPerform`. **Deviates from tech-stack.md's
      literal code sample**: `host`'s set now includes `claimSeat`/
      `leaveSeat` — see plan.md's resolved-decisions item 6 (discovered gap:
      the literal spec left the host unable to ever claim a seat, breaking
      solo play). tech-stack.md's sample was corrected to match.
      **Verify (unit):** table-driven test asserting `canPerform` matches
      `ROOM_PERMISSIONS` for every `(role, action)` pair, including pairs
      not explicitly listed (must return `false`) — 19/19 passing.
- [x] 1.5 `src/index.ts` barrel export.
      **Verify:** `packages/game-core` and `packages/server` can import
      from `@tableverse/shared` after `npm install`.

## 2. `packages/game-core` — GameModule contract + conformance suite

- [x] 2.1 `src/types.ts` — `GameModule`, `BoardProps` interfaces per
      tech-stack.md/plan.md. Note: `BoardComponent: React.FC<BoardProps>`
      requires `@types/react` as a type-only devDependency in game-core —
      this is a type reference only, no React runtime dependency, so it
      doesn't violate game-core's framework-agnostic charter.
- [x] 2.2 `src/gamesCatalog.ts` — empty `gamesCatalog: GameModule[]` array
      and `getGameModule(id)` lookup.
      **Verify (unit):** `getGameModule('anything')` returns `undefined`
      against the empty catalog. 2/2 tests passing.
- [x] 2.3 `testing/fixtures/dummyGame.ts` — minimal valid `GameModule`
      (2–4 players, one hidden per-player field `hands`, one mutating move
      `playCard`, uses the `random.Shuffle` plugin API in `setup`), **not**
      registered in `gamesCatalog`. Also `brokenDummyGameModule`, a copy
      whose `playerView` is a no-op passthrough, for the "must fail"
      direction of 2.5.
- [x] 2.4 `testing/conformance.ts` — `testGameModuleConformance(module,
      { secretKeys })` implementing the four checks from tech-stack.md
      (setup validity at min/max players, JSON-serializability,
      `playerView` leak-freedom against `secretKeys`, determinism under a
      fixed seed compared across two independent `setup` runs). Each check
      is also exported as a standalone throwing function
      (`checkSetupValidity`, `checkSerializability`,
      `checkPlayerViewLeakFree`, `checkDeterminism`) so a game's test file
      — or the suite's own tests — can invoke a single check directly
      instead of only through the full `describe`/`it` wiring.
- [x] 2.5 `testing/fixtures/dummyGame.conformance.test.ts` —
      two cases: (a) `testGameModuleConformance(dummyGameModule, ...)` run
      directly, registering real `it()` cases that must all pass; (b)
      `checkPlayerViewLeakFree(brokenDummyGameModule, ...)` called directly
      and asserted (via `expect(...).toThrow(/leaked owner/)`) to throw —
      proving the leak check itself detects the violation, not a
      hand-rolled re-implementation of the same logic outside the suite.
      **Verify (unit):** both (a) and (b) run and produce the expected
      pass/fail outcome — this task is not done until both directions are
      confirmed, not just the happy path.

## 3. `packages/server` — identity, storage, room, seats, permissions enforcement

- [x] 3.1 Sequelize setup with a SQLite dialect, models for `User`,
      `Room`, `RoomSeat` per plan.md's schema (including the `room_seats`
      table decision), plus `MatchModel` for boardgame.io's own match
      storage (task 3.7 pulled forward — see note there).
      **Verify:** models sync against an in-memory SQLite DB in a test
      setup file with no errors. 2/2 tests passing.
- [x] 3.2 `identity/userRepository.ts` + `identity/session.ts` +
      `identity/sessionMiddleware.ts` — create/resolve a `User` from a
      client-supplied session token; issue a new token+`User` if none is
      presented.
      **Verify (integration):** a request with no session token gets a new
      `User` created and a token issued; a request with a known token
      resolves the same `User`. 4/4 tests passing.
- [x] 3.3 `rooms/roomRepository.ts` — `RoomRepository` interface +
      Sequelize implementation, including invite-code generation
      (6-char, ambiguity-free alphabet, retry-on-conflict per plan.md).
      **Verify (integration):** `create` produces a unique `inviteCode`;
      `getByInviteCode` round-trips a created room. 4/4 tests passing.
- [x] 3.4 `rooms/seatService.ts` — `claimSeat`, `leaveSeat`, `releaseSeat`
      against the `room_seats` table, enforcing the `allowMultiSeat` rule
      and "seat already claimed" rejection. **Discovered gap, resolved with
      user input:** boardgame.io credentials are match-scoped but claiming
      happens pre-match — resolved as a two-phase model (see plan.md
      resolved-decision 7 and spec.md's updated story 3 / AC6); this task's
      `claimSeat` only ever writes the room-level `room_seats` reservation,
      never credentials.
      **Verify (integration):** covers spec.md acceptance criteria 3–6.
      5/5 tests passing.
- [x] 3.5 `rooms/roomService.ts` — `createRoom`, `joinRoom`, `changeGame`
      (resets seats + `gameSettings`), `startMatch` (creates a boardgame.io
      match via `boardgame.io/internal`'s `createMatch` + the storage
      adapter, mints `{matchID, playerID, credentials}` for every claimed
      seat in one batch, sets `currentMatchID` + `status: 'in_game'`),
      `endMatch` (wipes the match from storage, clears `currentMatchID`,
      returns to `lobby`, preserves seats iff `selectedGameID` unchanged).
      **Verify (integration):** covers spec.md acceptance criteria 1, 2,
      7, 14–17. 5/5 tests passing, using the game-core conformance suite's
      dummy fixture module (test-only) as the game under test, since
      feature 001 ships no real game.
- [x] 3.6 `permissions` enforcement wiring — `rooms/roomRoutes.ts` (Koa
      router) calls `canPerform` (from `@tableverse/shared`) via an
      `authorize()` helper as the first step of every handler that mutates
      room/seat state, before delegating to `roomService`/`seatService`.
      **Verify (integration):** covers spec.md acceptance criteria 13, 18 —
      a non-host attempting a host-only action (`manageSeats`/release) gets
      403 and the seat assignment is confirmed unchanged afterward; a
      non-member acting on a room is also rejected with 403; a request with
      no/invalid session token gets 401. 3/3 tests passing.
- [x] 3.7 `bgio/storage/sqliteStorageAdapter.ts` — boardgame.io `StorageAPI`
      (`Async`) implementation over the same SQLite database (own `matches`
      table). `bgio/serverConfig.ts` — boardgame.io `Server({ games:
      buildGamesList(gamesCatalog), transport: new SocketIO(), db:
      sqliteStorageAdapter, origins })`. Confirmed empty `games` array is
      valid boardgame.io config for this feature (no real game yet), and
      set explicit CORS `origins` (defaulting to the Vite dev origin) to
      avoid boardgame.io's startup warning.
      **Discovered runtime gap, fixed without needing to stop:**
      boardgame.io ships no root `package.json` "exports" map, so its
      subpath imports (`boardgame.io/server`, `boardgame.io/internal`)
      resolve fine under TypeScript/Vite/Vitest's lenient resolution but
      throw `ERR_UNSUPPORTED_DIR_IMPORT` under real Node ESM — verified by
      actually booting the server with `tsx`, not just running `tsc`/tests.
      Fixed via `bgio/vendor.ts`: import types from the clean subpath
      (erased at runtime) and runtime values from boardgame.io's compiled
      `dist/cjs/*.js` files directly, cast back to their proper types. This
      is a packaging workaround for a third-party dependency, not an
      architectural decision, so it didn't need a stop-and-ask — but it's
      the reason `packages/game-core`'s equivalent boardgame.io imports
      (`boardgame.io/client`, `boardgame.io/core`, used only by Vitest, via
      the conformance suite) did **not** need the same fix: they're never
      executed by plain Node, only by Vitest/Vite.
      **Verify:** `bgioServer.test.ts` — server boots without error with an
      empty games array. Additionally booted the real server process
      end-to-end (`tsx src/index.ts`) and smoke-tested it live over HTTP:
      `POST /api/identity` → `POST /api/rooms` → `POST
      /api/rooms/:id/seats/0/claim` → `GET /api/rooms/:id`, plus confirmed
      401 on an unauthenticated request — all against the real running
      process, not just the test suite.
- [x] 3.8 `presence/presenceStore.ts` + `presence/presenceTimers.ts` +
      `presence/presenceManager.ts` (composes the two, transport-agnostic —
      takes a broadcaster callback so it's testable without a real socket)
      + `presence/presenceChannel.ts` (wires a real `/presence` Socket.IO
      namespace on its own engine.io path, `/presence-socket`, calling into
      `presenceManager` on `hello`/`disconnect`) — per-seat `connected |
      grace_period | released` state, in-process grace-period timers
      (default 75s via `DEFAULT_GRACE_PERIOD_MS`, configurable), broadcasts
      independent of boardgame.io's own channel.
      **Verify (integration):** covers spec.md acceptance criteria 10–12 —
      disconnect starts the timer and broadcasts `grace_period`; reconnect
      before expiry cancels it (confirmed the original timer does NOT fire
      later); expiry makes the seat `released` (release-eligible) without
      touching any seat assignment (`PresenceManager` has no reference to
      `seatService`/`room_seats` at all — freeing a seat is a separate,
      host-only `manageSeats` action, already covered by 3.6's tests).
      4/4 state-machine tests (fake timers) + 1 real-Socket.IO-transport
      test proving the `/presence` namespace wiring itself works (had to
      force the `websocket` transport in the test client — the default
      polling-first handshake hung specifically under Vitest's test
      environment, unrelated to the presence logic itself).
- [x] 3.9 `src/index.ts` — mounts room/identity routes directly onto the
      Koa app boardgame.io's own `Server()` builds internally (`bgio.app`),
      as separate route trees, before calling `bgio.run(PORT)`; attaches
      the presence system to the resulting `appServer` afterward (shares
      the one HTTP server, distinct engine.io path from boardgame.io's own
      transport).
      **Verify:** `npm run test:integration` (full suite: rooms, seats,
      presence, permissions) passes against an in-memory/throwaway SQLite
      instance — 29/29 tests, 9/9 files. Also booted the real compiled
      process (see 3.7's note) and smoke-tested it live, not just via
      tests.

## 4. `packages/client` — chrome, seat management, reconnection

- [x] 4.1 `identity/useSession.ts` — nickname + session token,
      `localStorage`-backed, calling the server's identity endpoint.
- [x] 4.2 `seats/seatCredentialStore.ts` — `localStorage`-backed
      `SeatCredentialStore` (`add`, `remove`, `getForMatch`) per plan.md's
      key/shape.
      **Verify (component/unit):** round-trip add/remove/getForMatch —
      jsdom's real `localStorage` used directly (no mock needed). 5/5 tests
      passing.
- [x] 4.3 `seats/useSeatClients.ts` — mounts one boardgame.io `Client()`
      per claimed/stored seat credential using the `SocketIO` transport;
      exposes the active-seat switcher state (which claimed seat is
      currently focused). Each mounted seat also opens its own `/presence`
      socket identifying itself (`{roomID, seat: {matchID, playerID}}`),
      so that seat's disconnect — not the boardgame.io game-state socket's
      — is what drives its grace-period timer, per tech-stack.md's
      "presence is independent of the game channel."
- [x] 4.4 `room/RoomShell.tsx`, `SeatSwitcher.tsx`, `PresenceBadge.tsx` —
      chrome: player list, seat manager (claim/release, gated client-side
      by `canPerform` from `@tableverse/shared`), presence badges fed by
      a new `presence/usePresence.ts` hook (pure room-level observer on the
      `/presence` channel, no seat identity of its own), game selector,
      generic settings form placeholder (no real `settingsSchema` exists
      yet in this feature). `RoomShell` never renders game-specific UI —
      that's exclusively `children` (`GameMount`).
- [x] 4.5 `gameMount/GameMount.tsx` — looks up the `GameModule` via
      `getGameModule(room.selectedGameID)` and mounts
      `BoardComponent` for the active seat only, passing only standard
      board props (no room/seat/presence data).
      **Verify:** with no real game registered yet, `GameMount` renders a
      "no game selected" (null `selectedGameID`) or "unknown game" (id not
      in the empty catalog) placeholder without throwing. 2/2 tests
      passing.
- [x] 4.6 `api/roomApi.ts` — typed client for the room HTTP/WS endpoints
      from 3.6/3.9.
      **Verify:** component tests for 4.2–4.5 pass using a mocked
      `roomApi` (`RoomShell.test.tsx`, 4 tests) plus `roomApi.ts`'s own
      request/error/204-handling logic (4 tests). Needed a
      `cleanup()`-after-each fix in `vitest.setup.ts` — without it,
      `@testing-library/react` doesn't unmount between tests in the same
      file, and a later test's `getByText` matched leftover DOM from
      earlier tests.
      **Additional glue built to make the client a runnable app** (not
      individually itemized in plan.md's file layout, but required for
      "start the dev server and use the feature in a browser" verification):
      `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx` (wires
      `useSession` → room create/join → `RoomShell` + `SeatSwitcher` +
      `GameMount`), `.claude/launch.json`.
      **Verify (real browser, not just component tests):** ran the real
      backend (`tsx src/index.ts`) and the real Vite dev server together,
      drove the app through Claude Code's browser preview tool: entered a
      nickname → created a room → claimed seat 0 → saw the presence badge
      go "Connected" live over the real `/presence` socket. Found and fixed
      two real bugs invisible to any test in this feature, both only
      surfaced by exercising the actual browser/network stack:
      1. **Missing CORS on custom routes.** boardgame.io's own CORS setup
         answers the OPTIONS preflight for routes mounted on its Koa app,
         but never sets `Access-Control-Allow-Origin` on the actual
         response for routes outside its own Lobby API — confirmed by
         `curl -H 'Origin: ...'` showing the header simply absent. Fixed by
         adding explicit `@koa/cors` middleware in `src/index.ts`, applied
         before the identity/room routers.
      2. **Presence Socket.IO server had no CORS config of its own.**
         Socket.IO intercepts the HTTP handshake before Koa's middleware
         chain runs (it isn't a Koa route), so the app-level CORS fix above
         didn't cover it — the `/presence` polling handshake failed with
         `net::ERR_FAILED` in the real browser (invisible to the
         integration tests, which never go through a real browser's CORS
         enforcement). Fixed by passing `cors: { origin: corsOrigins }`
         directly to the `SocketIOServer` constructor in
         `presence/presenceChannel.ts`, and threading `CLIENT_ORIGINS`
         through from `index.ts`.
      Both fixes are internal to `packages/server`; no client code or
      contract changed. Recorded here rather than in plan.md's
      architectural decisions list, since these are bug fixes, not design
      choices.

## 5. Cross-cutting verification

- [x] 5.1 Run `test:unit` (shared + game-core, including the conformance
      suite's both-directions check) and `test:integration` (server) as
      separate scripts and confirm both are green. Also ran
      `npm run typecheck --workspaces` — all four packages clean.
      **Result:** `test:unit` — 19 (shared) + 8 (game-core) + 15 (client) =
      42 tests, all passing. `test:integration` — 30 tests across 9 files,
      all passing (rose from 29 to 30 — see 5.2's gap fix below).
- [x] 5.2 Re-read spec.md's 19 acceptance criteria against the tests
      written above and confirm each has a corresponding test; note any
      gap before closing out the feature.
      **Found and fixed a real implementation gap, not just a test gap:**
      AC6 (as amended in plan.md's resolved-decision 7) requires that
      claiming an *open* seat while a room is already `in_game` issues
      credentials immediately. `SeatService.claimSeat` never did this — it
      only ever wrote the room-level reservation, regardless of room
      status, so a mid-game seat claim (e.g. after the host releases a
      disconnected player's seat) silently produced no usable credential.
      Fixed by adding `RoomService.claimSeat` (wraps `seatService.claimSeat`
      for the bookkeeping, then mints+persists a credential via the storage
      adapter only when `room.status === 'in_game'`), wired into
      `roomRoutes.ts`'s claim handler in place of calling `seatService`
      directly. This surfaced a second, related gap: `startMatch` only
      returns its freshly-minted credentials to whichever single caller
      invoked it — every *other* seated user has no way to receive their
      own. Fixed by adding `RoomService.getMyCredentials(roomID, userID)`,
      exposed through the existing `GET /:roomID` endpoint (a pull-on-fetch
      model rather than a push channel — every client already refetches
      the room after any action). Both fixes are exercised by a new
      `roomService.test.ts` case (`AC6: claiming a seat while lobby...`)
      and wired through the client (`RoomShell.claimSeat` stores a non-null
      credential immediately; `RoomShell.refresh` stores any
      `myCredentials` returned on every room fetch). One acknowledged
      follow-up, not fixed now: if a client's tab is already open when
      another seat's credential newly becomes available (e.g. host starts
      the match while a spectator's tab is sitting idle), `useSeatClients`
      won't automatically re-mount a `Client()` for it until something
      re-triggers its effect (its dependency array is `[roomID, matchID,
      gameDef]`) — a manual refresh/reload picks it up. Left as a UX
      polish gap rather than blocking the feature, since AC6 only requires
      the credential be *issued and retrievable*, not instantly live in an
      already-open tab.
      **Full AC → test mapping**, confirming every criterion has coverage:
      AC1→`roomService.test.ts` "AC1"; AC2→"AC2"; AC3–5→`seats.test.ts`;
      AC6→`roomService.test.ts` "AC6" (new); AC7→"AC7/16"; AC8→
      `dummyGame.conformance.test.ts`'s leak-freedom check (includes the
      `viewerID: null` spectator case); AC9→covered structurally rather
      than by one dedicated test — `GET /:roomID` never gates on holding a
      seat (exercised incidentally by every test that fetches a room
      without every seat claimed), and `GameMount.test.tsx` confirms the
      "no seat → spectate, no throw" client path; AC10–12→
      `presenceManager.test.ts`; AC13→`roomRoutes.test.ts` "AC13/18";
      AC14/15→`roomService.test.ts` "AC14/15"; AC16→transition/currentMatchID
      asserted in "AC7/16", permission-gating asserted exhaustively for
      every `(role, action)` pair including `startMatch` by
      `permissions.test.ts` (19 cases) rather than a redundant per-action
      integration test; AC17→"AC17"; AC18→`permissions.test.ts` +
      `roomRoutes.test.ts` "AC13/18"; AC19→
      `dummyGame.conformance.test.ts`'s both-directions case.
- [ ] 5.3 End-to-end (Playwright) happy-path test — **deferred to feature
      002.** Feature 001 has no playable game, so "create room → join →
      claim seats → play a full match → disconnect/reconnect" cannot be
      exercised end-to-end until a real `GameModule` (Tic-Tac-Toe) exists.
      Recorded here so it isn't silently dropped, not because it's in
      scope now.
