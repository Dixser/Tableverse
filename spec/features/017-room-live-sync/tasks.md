# Feature 017 — Live Room Sync: Tasks

1. [x] Write spec.md and plan.md.
2. [x] Server: `packages/server/src/roomEvents/roomEventsChannel.ts` —
   `createRoomEventsSystem(httpServer, corsOrigins)` returning `{ io,
   roomChanged }`.
3. [x] Server: wire `roomEvents` dependency into `RoomRoutesDeps`
   (`roomRoutes.ts`), call `roomEvents.roomChanged(roomID)` after every
   mutating route succeeds.
4. [x] Server: wire `createRoomEventsSystem` into `index.ts` with the
   deferred-attach pattern (mirrors `setPresenceManager`).
5. [x] Client: `packages/client/src/roomEvents/useRoomEvents.ts`.
6. [x] Client: wire `useRoomEvents(roomID, refresh)` into `RoomShell.tsx`.
7. [x] Client: add `/room-events-socket` to `vite.config.ts`'s dev proxy
   (found missing during manual verification -- without it, the socket
   never reached the backend even though its handshake requests returned
   200 OK from Vite's own fallback, silently no-op).
8. [x] Tests: `roomEventsChannel.test.ts` (new, integration).
9. [x] Tests: extend `roomRoutes.test.ts` for broadcaster calls.
10. [x] Tests: extend `RoomShell.test.tsx` for refetch-on-event.
11. [x] Run full test suite (`npm run typecheck`, `test:integration`,
    `test:unit`, `lint` -- all clean; the 4 pre-existing lint issues are
    unrelated, confirmed present on the base branch too).
12. [x] Manual verification: two real browser sessions (desktop host tab +
    a second "guest" tab with a distinct identity), confirmed live:
    guest join, game selection, seat claims (both directions), match
    start, and in-match move sync -- all without a manual reload.
