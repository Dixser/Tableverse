# Feature 006 — Voluntary Seat Release: Implementation Plan

## Everything needed already exists except the button

`packages/shared/src/permissions.ts` already grants `leaveSeat` to both
`host` and `member`. `packages/server/src/rooms/roomRoutes.ts` already has
`POST /:roomID/seats/:playerID/leave` gated by
`authorize(ctx, deps, roomID, 'leaveSeat')`, delegating to
`SeatService.leaveSeat` (an unconditional `RoomSeat.destroy`, no
lobby/in_game restriction — already satisfies story 1's "works identically
in lobby or in_game"). `packages/client/src/api/roomApi.ts` already has
`leaveSeat(sessionToken, roomID, playerID): Promise<void>` with its own
passing test. None of this changes. The entire feature is:
`RoomShell.tsx` gains one handler and one conditionally-rendered button.

## `RoomShell.tsx`

New callback, same `setActionError`-wrapped-try/catch shape as every other
action (`releaseSeat`, `claimSeat`, ...):

```ts
const leaveSeat = useCallback(
  async (playerID: string) => {
    setActionError(null);
    try {
      await roomApi.leaveSeat(sessionToken, roomID, playerID);
      await refresh();
    } catch (err) {
      setActionError((err as Error).message);
    }
  },
  [sessionToken, roomID, refresh],
);
```

New permission flag alongside the existing `canX` block:

```ts
const canLeaveSeat = role != null && canPerform(role, 'leaveSeat');
```

New button in the seats list, gated on **occupancy** (`seat.userID ===
user.id`) rather than room status — deliberately no `room.status ===
'in_game'` condition, unlike the host's `Release` button, since story 1
requires this to work in both `lobby` and `in_game`:

```tsx
{seats.map((seat) => (
  <li className={styles.listItem} key={seat.playerID}>
    Seat {seat.playerID}: {seat.userID === user.id ? 'You' : seat.userID}
    <PresenceBadge status={presence[seat.playerID] ?? 'connected'} />
    <span className={styles.spacer} />
    {seat.userID === user.id && canLeaveSeat && (
      <button className={styles.buttonDanger} type="button" onClick={() => void leaveSeat(seat.playerID)}>
        Leave seat
      </button>
    )}
    {canManageSeats && room.status === 'in_game' && (
      <button className={styles.buttonDanger} type="button" onClick={() => releaseSeat(seat.playerID)}>
        Release
      </button>
    )}
  </li>
))}
```

Story 2's separation falls out for free: `seat.userID === user.id` and
`canManageSeats` targeting someone else's seat are structurally different
conditions on different rows in the common case (a host who has also
claimed a seat would see *both* buttons on their own row -- intentional,
not a bug: they hold both permissions simultaneously, same as `Release`
already coexisting with every other host control today).

## File layout

```
packages/client/
  src/room/RoomShell.tsx       # + leaveSeat handler, canLeaveSeat flag, button
  src/room/RoomShell.test.tsx  # + control-visibility + wiring + error-surfacing cases
```

Nothing else changes -- no server, no shared, no game-core file, per
spec.md's non-goals.

## Testing / verification strategy

- `RoomShell.test.tsx` — new cases: "Leave seat" renders only on the
  current user's own occupied-seat row, never on another user's row,
  regardless of host/member role (AC1); clicking it calls
  `roomApi.leaveSeat` with the user's own `playerID` and refreshes (AC2);
  a rejected `leaveSeat` call surfaces via the existing `actionError`
  banner without discarding the room chrome (AC3, reusing the exact
  pattern feature 001's multi-seat fix already established and feature 005
  didn't need to touch); the host-only `Release` button's existing
  rendering conditions are unchanged (AC4 — covered by not modifying its
  JSX at all, confirmed by the pre-existing release-button tests still
  passing unmodified).
- No new server-side test — `leaveSeat`'s route/permission/service
  behavior is unchanged, already covered by feature 001's own integration
  tests (`seats.test.ts`, `roomRoutes.test.ts`).

## Open risks

None identified — this is the smallest feature planned so far: one new
button, zero new server surface, reusing every pattern (`actionError`,
occupancy-gated rendering, `canX` permission flags) already established by
features 001 and 005.
