# Feature 006 — Voluntary Seat Release: Tasks

Single-file change — everything server-side and API-side already exists
and is already tested (see plan.md).

- [x] 1. `RoomShell.tsx` — `leaveSeat` handler, `canLeaveSeat` flag, and the
      occupancy-gated "Leave seat" button in the seats list, per plan.md.
      **Verify:** `RoomShell.test.tsx` covers AC1-4 with 3 new cases
      (visibility on own seat only, click wiring, error surfacing); AC4
      (host-only `Release` unchanged) confirmed by the pre-existing
      release-button test still passing unmodified.
- [x] 2. Run `test:unit` (shared + game-core + client) and confirm nothing
      broke; run `npm run typecheck --workspaces` clean across all four
      packages. **Confirmed:** shared 19/19, game-core 25/25, client
      39/39 (up from 36 — 3 new `RoomShell` cases) unit tests pass;
      server `test:integration` 31/31 also re-run for full workspace
      confidence (unaffected, as expected — no server file changed);
      `typecheck --workspaces` clean across all four packages.
