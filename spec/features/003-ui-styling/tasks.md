# Feature 003 — UI Styling: Tasks

Global stylesheet + tokens first (everything else depends on the tokens
existing), then the tooling prerequisite for game-core's CSS Module import,
then each component/game restyle, then live verification.

- [x] 1. `packages/client/src/styles/global.css` — `:root` design tokens
      (color, spacing, radius, type) + base reset/typography, per plan.md.
      Import once in `main.tsx`.
      **Verify:** client typechecks/builds; no visual check yet (nothing
      consumes the tokens until later tasks).
- [x] 2. `packages/game-core/tsconfig.json` — add `vite/client` to the
      `types` array so `BoardComponent.module.css`'s import typechecks.
      **Verify:** `game-core` typechecks with a throwaway `.module.css`
      import before wiring the real one in task 6. Confirmed, then removed
      the throwaway file.
- [x] 3. `packages/client/src/App.module.css` + wire into `App.tsx`
      (`IdentityGate`, `RoomEntry`, `ActiveRoom` layout/forms).
      **Note:** avoided double-wrapping a `.page` layout div around
      `RoomEntry` (which already provides its own) by adding an
      `initialError` prop to `RoomEntry` instead of rendering the
      auto-join error as a sibling — a small, in-scope refactor, not a
      deviation from plan.md's file list. 21/21 client tests still pass.
- [x] 4. `packages/client/src/room/RoomShell.module.css` + wire into
      `RoomShell.tsx`. 21/21 client tests still pass.
- [x] 5. `packages/client/src/room/SeatSwitcher.module.css` + wire into
      `SeatSwitcher.tsx`.
- [x] 6. `packages/client/src/room/PresenceBadge.module.css` + wire into
      `PresenceBadge.tsx`, mapping `status` to `connected`/`grace_period`/
      `released` classes per plan.md. 21/21 client tests still pass.
- [x] 7. `packages/game-core/src/games/tictactoe/BoardComponent.module.css`
      — the 3x3 grid fix — + wire into `BoardComponent.tsx`
      (`className="tictactoe-board"` → `styles.board`, cells → `styles.cell`).
      **Verify (component):** `BoardComponent.test.tsx`'s 5 existing tests
      pass unmodified (spec.md AC4) — 25/25 game-core tests pass. Also
      resolves plan.md's open risk #1: confirms Vitest correctly processes
      `.module.css` imports inside `packages/game-core`'s own test run,
      not just `packages/client`'s.
- [x] 8. Live verification (spec.md AC1, 2, 3, 5, 6). **Partial —
      browser preview tooling was unavailable for the entire feature
      (both `mcp__Claude_Browser__preview_*` and the
      `mcp__claude-in-chrome__*` fallback report no connected browser,
      retried at the end of the feature and still unavailable). Verified
      instead via `curl` against Vite's compiled module output and
      `git status --porcelain`:
      - AC3 (3x3 grid): confirmed — `BoardComponent.module.css`'s compiled
        output (served at `/@fs/.../BoardComponent.module.css`) contains
        `display: grid; grid-template-columns: repeat(3, 1fr);
        grid-template-rows: repeat(3, 1fr);` verbatim.
      - AC5 (CSS Modules scoping is real): confirmed — Vite emits
        generated class names (`._board_1t5cd_1`, `._cell_1t5cd_10`), not
        the old literal `tictactoe-board` string.
      - AC6 (no file outside plan.md's list touched): confirmed via
        `git status --porcelain` — every changed/new file maps to a
        task 1–7 deliverable or to the BoardComponent/GameModule split
        (see note below).
      - AC1 (chrome legible/readable) and AC2 (colors visibly change
        immediately): **NOT verified** — both require an actual rendered
        screenshot, which the tooling outage blocked. Flagged to the user;
        pending either browser-tool availability or the user's own visual
        check.

      **Mid-implementation architecture pivot (not in original plan.md):**
      while wiring task 7, `npm run typecheck --workspaces` passed but a
      direct runtime check of `packages/server`
      (`npx tsx -e "import('./src/index.js')"`) crashed with
      `TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension
      ".css"`. Cause: `gamesCatalog.ts` (imported by the server at real
      Node runtime, no bundler) unconditionally imported
      `tictactoeModule` → `BoardComponent.tsx` → the new
      `BoardComponent.module.css`, and Node has no CSS-import support the
      way Vite does. This reopened feature 002's earlier decision to keep
      `BoardComponent` on the `GameModule` interface (that worked pre-CSS
      because Node tolerates an unused `react` peerDependency, but has no
      equivalent tolerance for a `.css` import). Presented two options via
      AskUserQuestion; user chose "Split metadata from BoardComponent."
      Implemented: removed `BoardComponent` from `GameModule`
      (`packages/game-core/src/types.ts`); added
      `packages/game-core/src/boards.ts` as the sole client-only entry
      point allowed to import BoardComponents/CSS; added
      `packages/client/src/boardRegistry.ts` mapping game id →
      BoardComponent, consumed by `GameMount.tsx` instead of destructuring
      off the module. Re-verified after the fix: `npm run typecheck`
      clean across all 4 packages; server boots without crashing
      (confirmed via direct `tsx` execution + `curl`); 25/25 game-core and
      21/21 client unit tests still pass.
- [x] 9. Run `test:unit` (shared + game-core + client) and confirm nothing
      broke; run `npm run typecheck --workspaces` clean across all four
      packages. **Confirmed, including after the task-8 architecture
      pivot:** shared 19/19, game-core 25/25, client 21/21 unit tests
      pass; server `test:integration` 30/30 also pass (unaffected, but
      re-run for full workspace confidence since the pivot touched the
      server's import graph); `npm run typecheck --workspaces` clean
      across all four packages.
