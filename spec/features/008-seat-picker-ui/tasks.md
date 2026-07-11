# Feature 008 — Seat Picker UI: Tasks

Single-file change to `RoomShell.tsx` + its stylesheet — no server, shared,
or game-core changes (see plan.md).

- [x] 1. `RoomShell.tsx` — `SeatPicker` component, `selectedModule` lookup
      via `getGameModule`, replaces `ClaimSeatForm` at its render site.
      `RoomShell.module.css` — `.seatPicker`/`.seatButtonOpen`/
      `.seatButtonTaken`; removed the now-dead `.textInput`/`.inlineForm`
      rules `ClaimSeatForm` was the sole consumer of. `ClaimSeatForm`
      deleted entirely.
      **Verify:** `RoomShell.test.tsx` — 2 pre-existing claim-flow tests
      retargeted from text-input+submit to button clicks; 3 new cases for
      AC1 (exactly `maxPlayers` buttons), AC2 (taken seat disabled +
      labeled with occupant, open seat clickable), AC4 (no picker without
      a `selectedGameID`). client 51/51 (up from 48). Confirmed via curl
      against Vite's dev server that `RoomShell.tsx` compiles cleanly and
      contains `SeatPicker` with no remaining `ClaimSeatForm` reference —
      browser tooling remained unavailable
      (`list_connected_browsers` → `[]`) for interactive verification, but
      spec.md's ACs are all `[component]`-tagged and fully covered by the
      unit tests above, so no `[manual]` gap to flag this time (same as
      feature 006).
- [x] 2. Run `test:unit` (shared + game-core + client) and confirm nothing
      broke; run `npm run typecheck --workspaces` clean across all four
      packages. **Confirmed:** shared 22/22, game-core 25/25, client
      51/51 unit tests pass; server `test:integration` 38/38 also
      re-confirmed (unaffected, as expected — no server file changed);
      `typecheck --workspaces` clean across all four packages.
