# Feature 009 — Gameover Banner: Tasks

Contract type first (nothing else compiles against it without it), then the
`playerNames` data plumbing (needed by the component but independently
testable), then the pure message-resolution function (unit-testable
without React), then the component, then wiring into `GameMount`/`App.tsx`,
then verification.

- [x] 1. `packages/game-core/src/types.ts` — add `GameoverResult`, per
      plan.md. `packages/game-core/src/index.ts` — export it as a type.
      **Verify:** `game-core` typechecks; no behavior change (type-only
      addition). Confirmed.
- [x] 2. `packages/client/src/seats/useSeatClients.ts` — add
      `playerNamesFrom()` and the `playerNames` field on
      `SeatClientsState`. **Corrected mid-implementation from plan.md's
      first draft:** `matchData` is not part of `SeatState`/`getState()` —
      checked directly against boardgame.io's client source, it's a
      property on the `Client()` instance itself
      (`activeClient.matchData` / `spectator.client.matchData`), updated by
      a separate `'matchData'` transport event that still calls
      `notifySubscribers()`. `useSeatClients.test.ts` — new cases: empty
      `playerNames` before any sync, derivation from the spectator client's
      `matchData`, derivation from the active seat client's `matchData`
      (9 tests total, all passing).
      **Verify:** `npx vitest run src/seats/useSeatClients.test.ts` — 9/9
      pass.
- [x] 3. `packages/client/src/gameMount/GameoverBanner.tsx` +
      `GameoverBanner.module.css` — `resolveGameoverMessage`, `nameFor`,
      `formatNameList` (exported pure functions) and the `GameoverBanner`
      component, per plan.md's table. `GameoverBanner.test.tsx` (`.tsx`,
      not `.ts` — it renders JSX, matching this repo's convention) — every
      row of the table covered: `undefined`, `{ draw: true }`,
      single-winner seated-win, single-winner seated-loss, multi-winner
      (`{ winner: ['0','1'] }` and 3-winner) from a co-winner's
      perspective, a non-winner's perspective, and a spectator's, the
      "Seat N" name-fallback case, the unrecognized-shape fallback, plus
      3 render smoke tests.
      **Verify:** `npx vitest run src/gameMount/GameoverBanner.test.tsx` —
      15/15 pass.
- [x] 4. `packages/client/src/gameMount/GameMount.tsx` — added the
      `playerNames` prop; renders `<GameoverBanner gameover={...}
      playerID={...} playerNames={playerNames} />` above `<BoardComponent
      {...boardProps} />`, per plan.md. `GameMount.test.tsx` — added a
      gameover-present case with a populated `playerNames` map (banner
      shows "Alice wins!") and a gameover-present case with an empty map
      (banner shows "Seat 0 wins!" fallback); the existing four cases
      updated to pass `playerNames={{}}` and still pass.
      **Verify:** full client suite — 71/71 pass, including the untouched
      `BoardComponent.test.tsx` "no chrome" assertion.
- [x] 5. `packages/client/src/App.tsx` — passes `seatClients.playerNames`
      to `<GameMount>` in `ActiveRoom`.
      **Verify:** client typechecks clean.
- [x] 6. Confirmed zero changes needed to
      `packages/game-core/src/games/tictactoe/gameDef.ts`,
      `gameDef.test.ts`, `packages/server/**`, or `packages/shared/**` —
      spec.md AC10 and the "no new endpoint/shared type" non-goal.
      **Verify:** `git status --porcelain` scoped to those paths shows only
      pre-existing unrelated modifications from other in-progress work on
      this branch, none touched by this feature.
- [x] 7. `test:unit`: game-core 25/25, client 71/71. `npm run typecheck`
      clean for both `game-core` and `client` workspaces.
- [x] 8. Manual/browser verification (spec.md stories 1-5): created a room,
      claimed both seats solo, played Tic-Tac-Toe to a win for Seat 0.
      Seat 0's own view read **"You win!"**; switching to Seat 1's
      perspective via `SeatSwitcher` updated the banner to **"Dixser
      wins!"** — the real display name (both seats were claimed by the
      same solo user, "Dixser"), not "Seat 0 wins!" — confirming both the
      perspective-switching behavior (story 4) and name resolution (AC5)
      end-to-end. `matchData` was observed to already be populated by the
      time the `gameover`-carrying render happened — plan.md's open risk
      #1 (sync-timing race) did not manifest in this run. Draw case and
      the multi-winner path were not separately screenshotted (no game
      produces multiple winners yet; multi-winner is covered by unit
      tests per task 3). Match ended (cleaned up) after verification.
