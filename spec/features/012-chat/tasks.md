# Feature 012 — Room & Match Chat: Tasks

The `GameLogEntry` contract first (a type-only addition nothing else
compiles against yet), then the server-side store/channel (independently
testable without a client), then the client hook/component, then chrome
wiring, then i18n, then verification.

- [ ] 1. `packages/game-core/src/types.ts` — add `GameLogEntry`, per
      plan.md. `packages/game-core/src/index.ts` — export it as a type.
      **Verify:** `game-core` typechecks; no behavior change (type-only
      addition).
- [ ] 2. `packages/server/src/chat/chatStore.ts` + `chatStore.test.ts` —
      `ChatMessage` type, `ChatStore` (append + 200-message-per-room cap +
      `historyFor(roomID, viewerIsSeated)` filtering), per plan.md.
      **Verify:** spec.md AC1/AC2/AC7 covered by unit tests.
- [ ] 3. `packages/server/src/chat/chatChannel.ts` — `createChatSystem`:
      session-token-verified `hello` (reject non-members before joining,
      spec.md AC6), `chatHistory` emit on join (AC5), `sendMessage`
      handling with per-socket seated-status-aware individual delivery
      (AC3/AC4), body length cap/trim. `chatChannel.integration.test.ts`
      — real two-client Socket.IO tests per plan.md's testing strategy.
      **Verify:** AC3-6 covered by integration tests against a real
      Socket.IO server/client pair.
- [ ] 4. `packages/server/src/index.ts` — wire `createChatSystem(...)`
      alongside the existing `createPresenceSystem(...)` call.
      **Verify:** server boots locally with both channels active.
- [ ] 5. `packages/client/src/chat/useChat.ts` + `useChat.test.ts` —
      connects to `/chat`, sends `hello`, accumulates history then live
      messages, exposes `sendMessage`, per plan.md (mirrors
      `usePresence.ts`'s structure).
      **Verify:** unit tests with a mocked `socket.io-client`.
- [ ] 6. `packages/client/src/chat/ChatPanel.tsx` (+ `.module.css`) +
      `extractGameLogEntries` + `ChatPanel.test.tsx` — merges `useChat`'s
      messages with `gameLogEntries` into one rendered, time-ordered feed
      per plan.md's sort rule.
      **Verify:** spec.md AC8/AC9 covered by component tests.
- [ ] 7. `packages/client/src/room/RoomShell.tsx` — new `gameLog?: unknown`
      prop, renders `<ChatPanel>`. `packages/client/src/App.tsx` —
      `ActiveRoom` passes `seatClients.boardProps?.G`'s `log` field
      through to `RoomShell`.
      **Verify:** client typechecks; existing `RoomShell`/`App` tests
      unaffected; new cases added for the `gameLog` pass-through.
- [ ] 8. i18n: add `chat.*` keys (input placeholder, send button, any
      chrome copy) to the existing `en`/`es` resource files from
      feature 010. No game-status keys added here (those belong to
      whichever game defines them — feature 014).
- [ ] 9. Run `test:unit`/`typecheck` across every workspace. Manual/
      browser verification (spec.md AC10/AC11): three real sessions (two
      seated, one spectator) against Tic-Tac-Toe, confirming the
      free-text filtering rule end-to-end and correct history on a late
      join; the `G.log` rendering path itself can only be exercised once
      feature 014 ships a game that populates it, so defer that specific
      check to feature 014/015's own manual verification.
