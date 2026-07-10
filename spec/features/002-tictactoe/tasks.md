# Feature 002 — Tic-Tac-Toe: Tasks

Rules first (with headless unit tests), then the board component, then
verify the whole thing plugs into feature 001's existing room/match flow
with no platform-code changes — per plan.md and this feature's entire
reason for existing: proving the `GameModule` contract holds for a real
game.

- [x] 1. `packages/game-core/package.json` — added `react` (and
      `react-dom`, `@testing-library/react`, `jsdom`, `@vitejs/plugin-react`)
      as `peerDependencies`/`devDependencies` per plan.md's resolved
      decision (`react` itself as an **optional** peer — `peerDependenciesMeta:
      { react: { optional: true } }` — so a headless-only consumer isn't
      forced to install it).
      **Verify:** `game-core`'s pre-existing tests (which never import
      `BoardComponent.tsx`) still passed after this change.
- [x] 2. `src/games/tictactoe/gameDef.ts` — the `Game<TicTacToeG>`
      definition (`setup`, `moves.play`, `turn.minMoves/maxMoves`,
      `endIf` with win/draw detection via an 8-line lookup table). No
      React import anywhere in this file.
      **Discovered runtime gap (same class of bug as feature 001's
      `bgio/vendor.ts`):** this file's `import { INVALID_MOVE } from
      'boardgame.io/core'` broke real Node execution
      (`ERR_MODULE_NOT_FOUND`) the moment `gamesCatalog.ts` started
      importing it — feature 001 never hit this because the catalog was
      empty, so no game-core file with a real boardgame.io subpath import
      was ever loaded by the server's actual Node process (only by
      Vitest/Vite, which resolve it fine). Fixed with a new
      `packages/game-core/src/vendor.ts`, mirroring the server's existing
      pattern: import the type from the clean subpath, the runtime value
      from `boardgame.io/dist/cjs/core.js`.
- [x] 3. `src/games/tictactoe/gameDef.test.ts` — headless-`Client` tests
      covering spec.md's AC1–5: a legal move updates `G`; an illegal move
      (occupied cell) is rejected and `G` is unchanged; a horizontal win,
      a vertical win, and a diagonal win are each detected with the
      correct winner; a full board with no line is a draw; no further
      moves are accepted after game-over.
      **Verify (unit):** 7/7 pass.
- [x] 4. `src/games/tictactoe/BoardComponent.tsx` — renders the 3x3 grid
      per plan.md, gated by `isActive`/occupied-cell/game-over, calling
      `moves.play?.(i)` on click. Renders nothing beyond the grid itself
      (no chrome).
- [x] 5. `src/games/tictactoe/BoardComponent.test.tsx` — component tests
      (spec.md AC7, AC8): renders the board reflecting a fixture `G`;
      clicking an empty cell calls `play` with the right index; clicking
      an occupied cell or any cell after game-over does not call `play`;
      confirms no non-grid chrome (player list, seat controls, presence)
      is rendered by this component. Needed a `// @vitest-environment
      jsdom` per-file override (the rest of `game-core`'s suite runs in
      `node`) plus a `vitest.setup.ts` (jest-dom matchers + RTL cleanup)
      added to `game-core`, mirroring the client package's existing setup.
      **Verify (component):** 5/5 pass.
- [x] 6. `src/games/tictactoe/index.ts` — the `tictactoeModule: GameModule`
      combining `gameDef` + `BoardComponent`, `id: 'tictactoe-v1'`,
      `minPlayers: maxPlayers: 2`, no `settingsSchema`.
- [x] 7. `src/games/tictactoe/tictactoeModule.conformance.test.ts` — calls
      `testGameModuleConformance(tictactoeModule, { secretKeys: [] })`
      (spec.md AC6).
      **Verify (unit):** 5/5 pass — setup validity at 2 players,
      serializability, (vacuous) leak-freedom, determinism.
- [x] 8. `src/gamesCatalog.ts` — registered `tictactoeModule`.
      **Discovered TS gap, not a platform-code gap:** `gamesCatalog:
      GameModule[]` didn't typecheck with a concrete `GameModule<TicTacToeG>`
      element — the same generic-contravariance issue hit in feature 001's
      test harnesses (`GameModule<Specific>` can never be a structural
      subtype of `GameModule<AnythingElse>` because move functions take
      `G` as a parameter). Fixed by typing the catalog array as
      `GameModule<any>[]` (aliased `AnyGameModule`, with a comment
      explaining why), not by touching the `GameModule` contract itself —
      this is a type-system erasure boundary, not evidence the contract
      has a real gap.
      Also updated `gamesCatalog.test.ts` (its old assertion, "catalog
      starts empty," was specific to feature 001 and is now false by
      design) and `GameMount.test.tsx` in `packages/client` (one of its
      feature-001 tests used `tictactoe-v1` as a stand-in for "an
      unregistered id," which stopped being true — replaced with a
      genuinely unknown id, and added two new tests exercising the real
      registered module through `GameMount`).
      **Verify:** `getGameModule('tictactoe-v1')` resolves; `gamesCatalog`
      has exactly one entry.
- [x] 9. Live verification (spec.md AC9) — booted the real server and
      client and played through the actual app: create room → select
      Tic-Tac-Toe (now populated in the selector for the first time) →
      claim seat 0 → start match → board renders a real 3x3 grid with
      live-synced `G`/`ctx` → clicked a cell → move round-tripped through
      the real server (`G.cells[4]` updated, `ctx.currentPlayer` advanced
      to `"1"`, board re-rendered). Confirmed no file outside
      `games/tictactoe/` and the one catalog line needed editing for the
      *game* to work — but this pass surfaced four real bugs in feature
      001's **client glue code** (not server code, and not the
      `GameModule` contract itself), invisible until a real game with a
      real, rendering `BoardComponent` existed to exercise them:
      1. **`RoomShell` never surfaced `selectedGameID`/`currentMatchID`
         upward.** `GameMount`/`useSeatClients` live outside `RoomShell`'s
         chrome (by design, per the chrome/board split), but nothing ever
         told them which game/match was active — `ActiveRoom` in
         `App.tsx` had hardcoded `matchID`/`selectedGameID` to `null`
         forever, a stub from when feature 001 had no real game to wire
         up. Fixed with a new `onRoomUpdate?: (room: Room) => void` prop
         on `RoomShell`, called every time it refreshes its own state.
      2. **`useSeatClients` never subscribed to the boardgame.io
         `Client`'s state changes.** It exposed the raw `Client` instances
         and expected the caller to call `.getState()` during render —
         but boardgame.io's `Client` doesn't itself trigger a React
         re-render, so the board would capture whatever state existed at
         mount (usually `null`, before the server's initial sync) and
         never update. Fixed by wiring `client.subscribe()` into React
         state inside the hook, and simplifying its public API to return
         ready-to-use `boardProps` directly instead of raw clients.
      3. **The client-side `gameDef` never had `.name` set.** The server's
         `buildGamesList` sets `.name` to the catalog id (boardgame.io
         routes its Socket.IO namespace by `game.name`), but the client
         passed the raw `GameModule.gameDef` straight into `Client()`,
         `.name` `undefined`. This produced a silent `connect_error:
         "Invalid namespace"` on the underlying socket — no error
         surfaced to the UI, the board just stayed on "Spectating"
         forever. Diagnosed by writing a standalone Node script
         (bypassing React/the browser entirely) that connected directly
         with boardgame.io's `Client` and logged raw socket events.
         Fixed by extracting the name-setting logic into a shared
         `withGameName(module)` helper in `game-core`'s `types.ts`,
         used by **both** the server's `buildGamesList` and the client's
         `App.tsx`, so the two sides can't drift out of sync again.
      4. **`gameDef` wasn't memoized on the client.** `withGameName`
         returns a new object every call; passing its result into
         `useSeatClients` (whose effect depends on it) caused the
         effect to tear down and recreate the `Client()` and its socket
         on *every render*, forever — so even after fix 3, the client
         never stayed connected long enough to receive its first sync.
         Fixed with `useMemo(() => ..., [module])` in `App.tsx`.
         (Briefly suspected `React.StrictMode`'s deliberate double-effect
         behavior instead; disabled it to test, confirmed that wasn't the
         cause, and re-enabled it once the real bug was found.)
      All four are documented here rather than in plan.md's architectural
      decisions, since none of them are design choices — they're bugs in
      code written in feature 001 that had never been exercised by a real
      `Client()`/`BoardComponent` pair until this feature's live
      verification step.
- [x] 10. Ran `test:unit` (now including `game-core`'s tictactoe +
      component tests) and `test:integration` (server) together.
      **Result:** `test:unit` — 19 (shared) + 25 (game-core) + 17 (client)
      = 61 tests, all passing. `test:integration` — 30 tests, all passing
      (unchanged from feature 001, confirming no server code needed to
      change). `npm run typecheck --workspaces` clean across all four
      packages.
