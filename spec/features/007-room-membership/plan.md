# Feature 007 — Room Membership: Leave & Kick: Implementation Plan

## Data model / permissions

No schema change — `Room.members` and `room_seats` already have everything
needed. One addition to `packages/shared/src/permissions.ts`:

```ts
export type RoomAction =
  | 'changeGame'
  | 'kickPlayer'   // already existed, unused until this feature
  | 'manageSeats'
  | 'startMatch'
  | 'endMatch'
  | 'editRoomSettings'
  | 'claimSeat'
  | 'leaveSeat'
  | 'leaveRoom';   // new

export const ROOM_PERMISSIONS: Record<RoomRole, Set<RoomAction>> = {
  host: new Set<RoomAction>([
    'changeGame', 'kickPlayer', 'manageSeats', 'startMatch', 'endMatch',
    'editRoomSettings', 'claimSeat', 'leaveSeat',
    // Deliberately NOT 'leaveRoom' -- per the resolved decision, the host
    // cannot leave. No succession logic exists, so this is enforced purely
    // as data (host's permission set simply excludes the action), the same
    // "permissions are data, not branches" principle as everything else in
    // this map.
  ]),
  member: new Set<RoomAction>(['claimSeat', 'leaveSeat', 'leaveRoom']),
};
```

`permissions.test.ts`'s existing `ALL_ACTIONS` array (which drives an
exhaustive `(role, action)` matrix test, not a per-action bespoke test) just
needs `'leaveRoom'` added to it — the test itself is already generic.

## `SeatService` — cascade release

One new method, same shape as the existing `clearAllSeats`:

```ts
// packages/server/src/rooms/seatService.ts
async releaseSeatsForUser(roomID: string, userID: string): Promise<void> {
  await this.models.RoomSeat.destroy({
    where: { roomId: roomID, userId: userID },
  });
}
```

A single bulk delete, not a fetch-then-loop over `leaveSeat` — both `leave
room` and `kick` need exactly this (release every seat one user holds in
one room), and neither needs the per-seat granularity `leaveSeat(playerID)`
exists for.

## `RoomService` — `leaveRoom` and `kickPlayer`

Both follow the same shape as `changeGame`/`endMatch`: validate a domain
rule the permission map can't express, cascade the seat release, patch
`members`, return the updated `Room`. Per `roomRoutes.ts`'s existing
`authorize()` doc comment ("no permission logic is duplicated in the
service layer — it trusts the router already checked"), neither method
re-checks role; `leaveRoom` structurally can never be called by a host
anyway, since `canPerform('host', 'leaveRoom')` is `false`.

```ts
// packages/server/src/rooms/roomService.ts

/**
 * A member gives up their room membership entirely (not just a seat).
 * Cascades: every seat they hold in this room is released as part of the
 * same operation, per spec.md story 1. The host can never reach this --
 * canPerform('host', 'leaveRoom') is false, enforced entirely by
 * ROOM_PERMISSIONS as data, not a check here.
 */
async leaveRoom(roomID: string, userID: string): Promise<Room> {
  const room = await this.mustGetRoom(roomID);
  await this.seats.releaseSeatsForUser(roomID, userID);
  const members = room.members.filter((m) => m.userID !== userID);
  await this.rooms.update(roomID, { members });
  return { ...room, members };
}

/**
 * Host removes another member entirely, per spec.md story 2. Same cascade
 * as leaveRoom, just triggered by the host acting on someone else instead
 * of a member acting on themself. Two domain rules the permission map
 * can't express, checked here:
 *  - a user cannot kick themself (kickPlayer targets a different userID);
 *  - the target must actually be a member of this room.
 * Not checked: the target having role 'host' -- structurally impossible
 * today, since there is exactly one host per room (assigned at creation,
 * never transferred) and the self-kick guard above already excludes the
 * one case where actingUserID could equal the host's own userID.
 */
async kickPlayer(
  roomID: string,
  actingUserID: string,
  targetUserID: string,
): Promise<Room> {
  const room = await this.mustGetRoom(roomID);
  if (actingUserID === targetUserID) {
    throw new RoomServiceError(`User ${actingUserID} cannot kick themself`);
  }
  if (!room.members.some((m) => m.userID === targetUserID)) {
    throw new RoomServiceError(
      `User ${targetUserID} is not a member of room ${roomID}`,
    );
  }
  await this.seats.releaseSeatsForUser(roomID, targetUserID);
  const members = room.members.filter((m) => m.userID !== targetUserID);
  await this.rooms.update(roomID, { members });
  return { ...room, members };
}
```

## Routes

```ts
// packages/server/src/rooms/roomRoutes.ts

router.post('/:roomID/leave', async (ctx) => {
  const room = await authorize(ctx, deps, param(ctx, 'roomID'), 'leaveRoom');
  if (!room) return;
  const updated = await deps.roomService.leaveRoom(room.roomID, ctx.state.user!.id);
  ctx.body = { room: updated };
});

router.post('/:roomID/kick', async (ctx) => {
  const room = await authorize(ctx, deps, param(ctx, 'roomID'), 'kickPlayer');
  if (!room) return;
  const { targetUserID } = getBody<{ targetUserID?: string }>(ctx);
  if (!targetUserID) {
    ctx.status = 400;
    ctx.body = { error: 'targetUserID is required' };
    return;
  }
  try {
    const updated = await deps.roomService.kickPlayer(
      room.roomID,
      ctx.state.user!.id,
      targetUserID,
    );
    ctx.body = { room: updated };
  } catch (err) {
    ctx.status = 409;
    ctx.body = { error: (err as RoomServiceError).message };
  }
});
```

Same `authorize()`/try-catch pattern as every existing route
(`changeGame`, `startMatch`, `endMatch`) — `authorize` handles the 403 case
(member calling `/leave`... wait, that's not possible, `leaveRoom` IS
granted to member; the 403 case is a **host** calling `/leave`, or a
**non-host member** calling `/kick`), the try/catch handles the two
domain-rule 409s (self-kick, target not a member).

## Client API + UI

```ts
// packages/client/src/api/roomApi.ts
leaveRoom(sessionToken: string, roomID: string): Promise<{ room: Room }> {
  return request(`/api/rooms/${roomID}/leave`, sessionToken, { method: 'POST' });
},

kickPlayer(
  sessionToken: string,
  roomID: string,
  targetUserID: string,
): Promise<{ room: Room }> {
  return request(`/api/rooms/${roomID}/kick`, sessionToken, {
    method: 'POST',
    body: JSON.stringify({ targetUserID }),
  });
},
```

`RoomShell.tsx` — two new callbacks following the existing
`setActionError`-wrapped-try/catch pattern every other action already uses
(`claimSeat`, `releaseSeat`, `changeGame`, ...), plus one new prop:

```ts
export interface RoomShellProps {
  // ...unchanged...
  /**
   * Called once this user's own leaveRoom action succeeds. RoomShell
   * itself has no navigation concept (chrome/board split -- it only owns
   * fetching *this* room) -- the caller (ActiveRoom in App.tsx) resets its
   * roomID state and the URL back to home, the same way `enterRoom`
   * currently sets them on the way in.
   */
  onLeftRoom?: () => void;
}
```

```ts
const leaveRoom = useCallback(async () => {
  setActionError(null);
  try {
    await roomApi.leaveRoom(sessionToken, roomID);
    onLeftRoom?.();
  } catch (err) {
    setActionError((err as Error).message);
  }
}, [sessionToken, roomID, onLeftRoom]);

const kickPlayer = useCallback(
  async (targetUserID: string) => {
    setActionError(null);
    try {
      await roomApi.kickPlayer(sessionToken, roomID, targetUserID);
      await refresh();
    } catch (err) {
      setActionError((err as Error).message);
    }
  },
  [sessionToken, roomID, refresh],
);
```

Players section gains the two controls, gated the same way every other
per-row control already is (`canManageSeats && room.status === 'in_game'`
pattern, just with different permissions/conditions):

```tsx
<section className={styles.section} aria-label="Players">
  <h2 className={styles.sectionTitle}>Players</h2>
  <ul className={styles.list}>
    {room.members.map((m) => (
      <li className={styles.listItem} key={m.userID}>
        {m.userID === user.id ? 'You' : m.userID} — {m.role}
        <span className={styles.spacer} />
        {m.userID === user.id && canLeaveRoom && (
          <button className={styles.buttonDanger} type="button" onClick={() => void leaveRoom()}>
            Leave room
          </button>
        )}
        {canKick && m.userID !== user.id && (
          <button className={styles.buttonDanger} type="button" onClick={() => void kickPlayer(m.userID)}>
            Kick
          </button>
        )}
      </li>
    ))}
  </ul>
</section>
```

with `canLeaveRoom = role != null && canPerform(role, 'leaveRoom')` and
`canKick = role != null && canPerform(role, 'kickPlayer')` alongside the
existing `canClaim`/`canManageSeats`/etc. block. `canLeaveRoom` is `false`
for the host purely because `ROOM_PERMISSIONS.host` excludes `'leaveRoom'`
-- no `m.role === 'host'` branch needed in the component either.

`App.tsx`'s `ActiveRoom` wires `onLeftRoom` up to the same reset `App()`
already does on the way in, just inverted:

```ts
// inside App() -- enterRoom already exists; add its inverse
const leaveRoom = useCallback(() => {
  setRoomID(null);
  setHomeUrl();
}, []);
// ...
<ActiveRoom roomID={roomID} user={session.user} sessionToken={session.sessionToken} onLeftRoom={leaveRoom} />
```

## What a kicked player's own client sees

Per spec.md's non-goals, no push notification -- deliberately reusing the
existing pull-on-refresh model. Concretely: the kicked user's `role`
(`room.members.find((m) => m.userID === user.id)?.role`) becomes
`undefined` on their next `RoomShell.refresh()`, which makes every
`canX` flag `false` -- they silently lose every action control (claim,
leave, etc.) and see a read-only room. They are **not** auto-navigated
back to `RoomEntry` -- `roomID` client-side state doesn't know it was
kicked, only that its permissions evaporated. This is an intentional,
minimal scope: it matches "no special notification beyond normal state
refresh" from spec.md's non-goals. Revisiting this (e.g. auto-redirecting
a kicked user home) is a natural follow-up if it proves confusing in
practice, not part of this feature.

## File layout

```
packages/shared/
  src/permissions.ts          # + 'leaveRoom' action, updated ROOM_PERMISSIONS
  src/permissions.test.ts     # + 'leaveRoom' in ALL_ACTIONS

packages/server/
  src/rooms/seatService.ts    # + releaseSeatsForUser
  src/rooms/roomService.ts    # + leaveRoom, kickPlayer
  src/rooms/roomRoutes.ts     # + POST /:roomID/leave, POST /:roomID/kick
  test/integration/roomService.test.ts   # + leaveRoom/kickPlayer cascade cases
  test/integration/roomRoutes.test.ts    # + permission-gating cases

packages/client/
  src/api/roomApi.ts          # + leaveRoom, kickPlayer
  src/api/roomApi.test.ts     # + coverage for both
  src/room/RoomShell.tsx      # + onLeftRoom prop, leaveRoom/kickPlayer handlers, Players-row controls
  src/room/RoomShell.test.tsx # + control-visibility + wiring cases
  src/App.tsx                 # + onLeftRoom wired to ActiveRoom
```

No changes to `packages/game-core` or any per-game file — this is entirely
a room/chrome concern, same as feature 006.

## Testing / verification strategy

- `permissions.test.ts` — extend `ALL_ACTIONS`; the existing exhaustive
  matrix test then covers `leaveRoom`/`kickPlayer` for free.
- `roomService.test.ts` — new cases: `leaveRoom` removes membership +
  releases every seat the user held (including >1 seat, exercising
  `allowMultiSeat`'s interaction with this cascade); `kickPlayer` does the
  same for a target; `kickPlayer` rejects self-kick; `kickPlayer` rejects
  a non-member target.
- `roomRoutes.test.ts` — new cases: host calling `/leave` gets 403; non-host
  member calling `/kick` gets 403; a kicked player can `joinRoom` again
  with the same invite code afterward (spec.md AC6, exercised end-to-end
  through the real routes, not just the service layer).
- `RoomShell.test.tsx` — "Leave room" renders only on the current user's own
  row and never for the host; "Kick" renders only for a host viewer, only
  on other members' rows; both call the right API method and surface
  failures via the existing `actionError` banner.
- No `[manual]`/browser-verification-tagged criteria in spec.md this time
  (unlike 003/004) -- every acceptance criterion here is either
  `[integration]` or `[component]`, so this feature doesn't depend on the
  currently-unavailable browser preview tooling to be verifiable. Worth
  noting given 003 and 004 both had to flag partial verification because of
  that outage.

## Open risks

1. **A member holding a seat mid-match who leaves/is kicked** frees that
   seat via the same `releaseSeatsForUser` path a host's `manageSeats`
   release already uses today -- no new interaction with the presence
   system or boardgame.io's own match state is introduced, but this is the
   first time seat release is triggered by something other than an
   explicit per-seat action (host release, self leave-seat). Worth an
   explicit live check during implementation that a mid-match kick doesn't
   leave the boardgame.io match metadata or a connected `Client()` in a
   confusing state (e.g. still showing the kicked player as "connected" in
   presence until their socket naturally disconnects) -- not blocking,
   since this is no worse than the existing host-release behavior, just
   newly reachable via a different trigger.
2. **`canLeaveRoom`/`canKick` naming** in `RoomShell.tsx` slightly overloads
   the existing `canX` convention (which so far has mapped 1:1 to a single
   room-level action, not a per-row conditional) -- the per-row `m.userID
   === user.id` / `m.userID !== user.id` checks live in JSX alongside the
   permission checks rather than being folded into the `canX` booleans
   themselves. Consistent with how `canManageSeats && room.status ===
   'in_game'` already combines a permission with a second condition inline,
   so not a new pattern, just flagging it as the closest precedent.
