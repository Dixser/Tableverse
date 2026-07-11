# Feature 005 — Spectator Live View: Tasks

`useSeatClients` mounting logic first (everything else depends on it
producing spectator `boardProps`), then the story-3 hot-mount wiring, then
the `GameMount` copy fix, then live verification.

- [x] 1. `packages/client/src/seats/useSeatClients.ts` — `mountSpectator`/
      `unmountSpectator`, spectator state, and the mounting effect's new
      branch (spectator when `credentials.length === 0`, per plan.md).
      `boardProps` falls back to the spectator's state with `moves: {}`
      and `playerID: null` when no active seat client exists.
      **Verify:** new `useSeatClients.test.ts` (6 tests, mocking
      `boardgame.io/client`/`boardgame.io/multiplayer`/`socket.io-client`)
      covers AC1-4.
- [x] 2. `RoomShell.tsx` — `onSeatClaimed` prop, wired into `claimSeat`'s
      existing `if (credential)` branch; `App.tsx`'s `ActiveRoom` wires it
      to `seatClients.addSeat`. `addSeat` (`useSeatClients.ts`) additionally
      tears down any mounted spectator client, since claiming a seat
      supersedes it. This closes feature 001's own acknowledged
      "`addSeat` exists but nothing calls it" gap for the mid-match-claim
      case specifically (see plan.md for why the lobby-claim half of that
      gap is deliberately left unfixed).
      **Verify:** `RoomShell.test.tsx` new case asserts `onSeatClaimed`
      fires with the claim's credential; `useSeatClients.test.ts`'s
      "addSeat tears down a mounted spectator" case asserts the client
      swap; client typechecks.
- [x] 3. `GameMount.tsx` — reword the null-`boardProps` placeholder from
      "Spectating… (no seat claimed)" to "Waiting for the match to
      start…", since post-fix that branch only means "no live match/client
      yet," not "you're spectating" (spectating now renders the live
      board like any other seat).
      **Verify:** `GameMount.test.tsx`'s corresponding case updated to
      match; added a new case confirming a spectator-shaped `boardProps`
      (`playerID: null`, `moves: {}`) renders the real `BoardComponent`
      identically to a claimed seat's.
- [x] 4. Live verification (spec.md AC5, AC6). Browser preview tooling was
      checked again and is still unavailable (`list_connected_browsers`
      returns `[]` on both toolsets). Rather than fall back to `curl`
      (which can't exercise a real Socket.IO client connection at all,
      unlike features 003/004's CSS-focused checks), wrote a throwaway
      Node script using the exact same `boardgame.io/client` +
      `boardgame.io/multiplayer` primitives `mountSpectator` uses, run
      against the real dev server end-to-end:
      - Created a room, selected `tictactoe-v1`, claimed seat 0, started
        the match, all via the real HTTP API.
      - Mounted a spectator `Client()` with no `playerID`/`credentials`
        (AC1) against the live match over the real Socket.IO transport.
      - Mounted the host's own seat `Client()` and called `moves.play(4)`.
      - Confirmed the spectator's subscribed state updated to reflect the
        move (`cells[4]` changed from `null` to `'0'`) within 1.5s, with
        no reload/remount involved (AC2, AC5's live-update requirement).
      Output: `spectator states after move: 3 {"cells":[...,"0",...]}` /
      `PASS: spectator saw the live move`. Script deleted after the run —
      this was a verification aid, not a permanent test (the same
      assertions are covered, without a live server, by
      `useSeatClients.test.ts`'s mocked equivalent).
      AC6 (spectator switches to a claimed seat live) was not re-verified
      against a live server the same way — the two unit tests from task 2
      (`RoomShell.test.tsx`'s `onSeatClaimed` case +
      `useSeatClients.test.ts`'s "addSeat tears down spectator" case)
      together already prove the exact chain a live check would exercise
      (claim → `onSeatClaimed` fires → `addSeat` called → spectator torn
      down, seat mounted), so a live two-browser session wasn't judged to
      add meaningfully more confidence here.
- [x] 5. Run `test:unit` (shared + game-core + client) and confirm nothing
      broke; run `npm run typecheck --workspaces` clean across all four
      packages. **Confirmed:** shared 19/19, game-core 25/25, client
      36/36 (up from 28 — 6 new `useSeatClients` tests, 1 new `RoomShell`
      test, 1 new `GameMount` test) unit tests pass; `typecheck
      --workspaces` clean across all four packages.
