# Feature 007 — Room Membership: Leave & Kick: Tasks

Permissions first (everything else depends on `leaveRoom` existing as an
action), then the server-side cascade + routes, then the client wiring,
then live/structural verification.

- [x] 1. `packages/shared/src/permissions.ts` — add `'leaveRoom'` to
      `RoomAction`; grant it to `member` only (never `host`, per the
      resolved host-can't-leave decision). Add `'leaveRoom'` to
      `permissions.test.ts`'s `ALL_ACTIONS`.
      **Verify:** shared unit tests, 22/22 (up from 19). Discovered along
      the way: the existing "host can do everything a member can" test
      encoded an assumption that's no longer true (`leaveRoom` is the one
      deliberate exception) — split it into two precise tests instead of
      leaving a false assumption in place.
- [x] 2. `packages/server/src/rooms/seatService.ts` — `releaseSeatsForUser`.
      `packages/server/src/rooms/roomService.ts` — `leaveRoom`,
      `kickPlayer` (self-kick + non-member-target guards), per plan.md.
      **Verify:** new `roomService.test.ts` cases (4 new) — cascade
      release including >1 seat under `allowMultiSeat`, self-kick
      rejection, non-member-target rejection, kick-matches-leaveRoom
      effect.
- [x] 3. `packages/server/src/rooms/roomRoutes.ts` — `POST /:roomID/leave`,
      `POST /:roomID/kick`.
      **Verify:** new `roomRoutes.test.ts` cases (3 new) — host calling
      `/leave` gets 403; non-host member calling `/kick` gets 403 (and a
      voluntary `/leave` by that member succeeds, cascading their seat); a
      kicked player rejoins with the same invite code afterward (AC6,
      end-to-end through the real routes). server 38/38 (up from 31).
- [x] 4. `packages/client/src/api/roomApi.ts` — `leaveRoom`, `kickPlayer`.
      `RoomShell.tsx` — `onLeftRoom` prop, `leaveRoom`/`kickPlayer`
      handlers, `canLeaveRoom`/`canKick` flags, Players-row controls.
      `App.tsx` — wires `onLeftRoom` (new `leaveActiveRoom` callback) to
      reset `roomID`/URL back to home, the inverse of `enterRoom`.
      **Verify:** new `roomApi.test.ts` (2 new) and `RoomShell.test.tsx`
      (9 new) cases per plan.md's testing strategy; client typechecks.
      client 48/48 (up from 39).
- [x] 5. Live verification of the mid-match cascade (plan.md's open risk
      #1). Restarted the dev backend to pick up the new routes (was still
      running pre-007 code), then wrote a throwaway Node script — same
      approach as feature 005 — that: created a room, seated host + guest,
      started a match, mounted the guest's real boardgame.io `Client()`
      (connected and live, exactly like an open browser tab), then had the
      host kick the guest mid-match via the real HTTP route. Confirmed:
      kick returned 200 and removed the guest from `Room.members`; the
      guest's seat was gone from `GET /:roomID`'s seat list immediately
      after; the room stayed reachable/healthy afterward (host could still
      fetch it); the guest's already-connected client attempting a move
      after the kick was rejected server-side ("disallowed move").
      **Caveat honestly noted**: that final rejection doesn't cleanly
      isolate "kicked" from "not this player's turn" as the cause (no move
      had been made yet, so it wasn't player 1's turn regardless) —
      `releaseSeatsForUser` only touches the `room_seats` table, not the
      boardgame.io match's own credential metadata in storage, exactly
      like the pre-existing host-`release` path already didn't. This
      matches plan.md's own scoping ("no worse than the existing
      host-release behavior") — not a new gap, not something this feature
      was ever meant to fix, but recorded here for traceability rather
      than silently claiming more was proven than was.
- [x] 6. Run `test:unit` (shared + game-core + client) and
      `test:integration` (server) and confirm nothing broke; run
      `npm run typecheck --workspaces` clean across all four packages.
      **Confirmed:** shared 22/22, game-core 25/25, client 48/48, server
      38/38; `typecheck --workspaces` clean across all four packages;
      `git status --porcelain` shows no stray files from the verification
      scripts (both deleted after their run).
