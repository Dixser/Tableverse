# Feature 017 — Live Room Sync: Implementation Plan

## Root cause

`RoomShell`'s room-level state (`members`, seat list, `selectedGameID`,
`status`, `currentMatchID`) is fetched exclusively via `GET
/api/rooms/:roomID`, and that fetch (`refresh()` in
`packages/client/src/room/RoomShell.tsx`) only re-runs on mount or right
after *the current browser's own* action succeeds. No other connected
browser is ever told the room changed, so a second session shows stale
state until it happens to reload (re-running the mount effect). This
single gap explains every symptom found in testing, including "guest
didn't see the match start" — `currentMatchID`/`status` live on the same
stale `Room` object `ActiveRoom` (`packages/client/src/App.tsx`) reads via
`onRoomUpdate`, which only fires from that same `refresh()`. Once
`currentMatchID` propagates correctly, `useSeatClients` mounts the right
boardgame.io `Client()`, and boardgame.io's own Socket.IO transport already
syncs moves live — that part of the stack needs no changes.

## Why a content-free ping, not a full-state broadcast

`GET /api/rooms/:roomID` also returns `myCredentials`
(`roomService.getMyCredentials`) — per-user secret boardgame.io
credentials that must never reach a different user's socket. The REST
route already filters this correctly per-requesting-user. A broadcast that
pushed `Room`/seat data directly would need a second, parallel
recipient-aware filtering path (the way `chatChannel.ts` already has to,
because chat messages *do* legitimately differ per recipient) — extra
complexity this feature doesn't need, since the ping itself carries zero
information. Every listening client just re-runs its own already-correct
`refresh()`.

## Server: `/room-events` namespace

New `packages/server/src/roomEvents/roomEventsChannel.ts`, structurally
mirroring `presenceChannel.ts`'s `createPresenceSystem` (own namespace, own
engine.io path, per-`roomID` Socket.IO room), but with no state machine and
no auth check — the payload carries nothing sensitive, matching presence's
posture (not chat's, which needs session-token identity because message
authorship is broadcast content):

```ts
export function createRoomEventsSystem(
  httpServer: HttpServer,
  corsOrigins: string[] = [],
): { io: SocketIOServer; roomChanged: (roomID: string) => void } {
  const io = new SocketIOServer(httpServer, {
    path: '/room-events-socket',
    cors: corsOrigins.length > 0 ? { origin: corsOrigins } : undefined,
  });
  const namespace = io.of('/room-events');
  namespace.on('connection', (socket) => {
    socket.on('hello', ({ roomID }: { roomID: string }) => void socket.join(roomID));
  });
  const roomChanged = (roomID: string) => namespace.to(roomID).emit('roomChanged');
  return { io, roomChanged };
}
```

### Wiring into `roomRoutes.ts` / `index.ts`

The Socket.IO server can only be built from the HTTP server
`bgio.run(PORT)` creates (`index.ts`), which doesn't exist yet when
`createRoomRouter(...)` is called — the same ordering constraint
`RoomService.setPresenceManager` already works around by attaching its
collaborator after construction. Routes need only a stable callable
reference, so the simplest fix is a mutable object created before the
router, reassigned once the real system exists:

```ts
// index.ts
const roomEvents = { roomChanged: (_roomID: string) => {} }; // no-op until wired below
const roomRouter = createRoomRouter({ users, rooms, seats, roomService, roomEvents });
// ...bgio wiring...
const { appServer } = await bgio.run(PORT);
const { roomChanged } = createRoomEventsSystem(appServer, CLIENT_ORIGINS);
roomEvents.roomChanged = roomChanged;
```

`RoomRoutesDeps` (`roomRoutes.ts`) gains:

```ts
export interface RoomRoutesDeps {
  // ...existing...
  roomEvents: { roomChanged: (roomID: string) => void };
}
```

Every mutating route calls `deps.roomEvents.roomChanged(roomID)` right
after its own success path, using whichever `roomID` it already has in
scope (the route param, or `room.roomID`/`updated.roomID` from the
service's return value for `/join` where there's no `:roomID` param yet at
call time). This lives in the routes file rather than `RoomService`
because `leave`/`release` call `SeatService` directly, bypassing
`RoomService` entirely — the routes file is the one place every mutation
already converges:

| Route | roomID source |
|---|---|
| `POST /join` | `room.roomID` from `roomService.joinRoom`'s return |
| `POST /:roomID/seats/:playerID/claim` | route param |
| `POST /:roomID/seats/:playerID/leave` | route param |
| `POST /:roomID/seats/:playerID/release` | route param |
| `POST /:roomID/leave` | route param |
| `POST /:roomID/kick` | route param |
| `POST /:roomID/settings` | route param |
| `POST /:roomID/game` | route param |
| `POST /:roomID/start` | route param |
| `POST /:roomID/end` | route param |

`POST /` (createRoom) and `GET /:roomID` are unchanged — nothing to notify
for a brand-new solo room, and reads never mutate.

## Client: `useRoomEvents` hook

New `packages/client/src/roomEvents/useRoomEvents.ts`, mirroring
`usePresence.ts`'s connect/hello/listen/cleanup shape exactly, minus any
per-seat status tracking:

```ts
export function useRoomEvents(roomID: string | null, onChanged: () => void): void {
  useEffect(() => {
    if (!roomID) return;
    const socket = io(`${API_BASE_URL}/room-events`, { path: '/room-events-socket' });
    socket.on('connect', () => socket.emit('hello', { roomID }));
    socket.on('roomChanged', onChanged);
    return () => socket.disconnect();
  }, [roomID, onChanged]);
}
```

`RoomShell.tsx` calls `useRoomEvents(roomID, refresh)` alongside its
existing `usePresence(roomID)` call. `refresh` is already a stable
`useCallback` (deps: `sessionToken`, `roomID`, `onRoomUpdate`), so no new
memoization is needed. This one wire-up is sufficient to fix every story in
spec.md: the re-fetch already populates `onRoomUpdate` → `ActiveRoom`'s
`matchID`/`selectedGameID` state in `App.tsx`, which is what drives
`useSeatClients` to mount the correct `Client()` — no changes needed in
`useSeatClients.ts` or `GameMount.tsx`.

The acting browser will also receive its own broadcast (it's joined to the
same Socket.IO room as everyone else) and re-fetch a second, redundant
time on top of its own local `refresh()` call. Accepted as harmless
(idempotent GET) rather than adding de-duplication complexity, consistent
with this repo's existing MVP-scale tradeoffs (e.g. feature 012's
per-socket seat lookup on every chat send).

## File layout

```
packages/server/src/roomEvents/
  roomEventsChannel.ts        # createRoomEventsSystem(...)

packages/server/src/rooms/
  roomRoutes.ts               # + roomEvents dep, roomChanged() calls

packages/server/src/index.ts   # + createRoomEventsSystem(...) wiring

packages/client/src/roomEvents/
  useRoomEvents.ts

packages/client/src/room/
  RoomShell.tsx                # + useRoomEvents(roomID, refresh)

packages/client/vite.config.ts # + '/room-events-socket' dev proxy entry,
                                # alongside the existing /presence-socket
                                # and /chat-socket ones -- easy to miss
                                # since a missing proxy entry doesn't error,
                                # it just silently never reaches the
                                # backend (Vite's own dev server answers
                                # the handshake requests with 200 OK
                                # itself, so the failure is not visible
                                # without a real two-browser manual test)

packages/server/test/integration/
  roomEventsChannel.test.ts    # new
  roomRoutes.test.ts           # extended

packages/client/src/room/
  RoomShell.test.tsx           # extended
```

## Testing / verification strategy

- `roomEventsChannel.test.ts` — real Socket.IO server/client pair (mirrors
  `presenceChannel.test.ts`): two sockets `hello`'d into the same roomID
  both receive a `roomChanged` emit; a socket in a different roomID does
  not (spec.md AC1/AC2).
- `roomRoutes.test.ts` — inject a stub `roomEvents.roomChanged` (same
  dependency-injection style already used for other deps in this file),
  assert it's called with the right `roomID` exactly once per successful
  mutating route, and not called when authorization/validation rejects
  the request first (spec.md AC3).
- `RoomShell.test.tsx` — extend the existing mocked-socket setup (it
  already mocks `usePresence`'s socket) to also simulate a `roomChanged`
  event on the new room-events socket and assert `roomApi.getRoom` is
  called again (spec.md AC4).
- Manual (spec.md AC5/AC6): two real browser sessions (desktop + phone,
  matching how this was originally caught) — join, game change, seat
  claim/release, and match start each show up on the other session without
  a manual reload; once both are in a match, confirm moves still sync live
  (regression check on the unchanged boardgame.io path).

## Open risks

1. **The acting browser's own redundant re-fetch** (see "Client:
   useRoomEvents hook") is a minor, accepted inefficiency, not solved
   further for this MVP-scale feature.
2. **A missed `roomChanged` event during a brief socket disconnect is not
   retried** — self-healing on the next change or the client's own next
   reload, same safety net every one of this feature's fixed bugs already
   relied on before today. Flagged as the thing to revisit if this ever
   needs a stronger delivery guarantee.
