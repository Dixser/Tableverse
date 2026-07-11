# Feature 008 — Seat Picker UI: Implementation Plan

## `SeatPicker` replaces `ClaimSeatForm`

`RoomShell.tsx` already imports `gamesCatalog` from `@tableverse/game-core`
for the game-selection dropdown; `getGameModule` (also exported from the
same barrel, already used in `App.tsx` for the identical lookup) resolves
`room.selectedGameID` to its `GameModule`, whose `maxPlayers` drives the
button count:

```tsx
function SeatPicker({
  maxPlayers,
  seats,
  currentUserID,
  onClaim,
}: {
  maxPlayers: number;
  seats: SeatAssignment[];
  currentUserID: string;
  onClaim: (playerID: string) => void;
}) {
  const seatByPlayerID = new Map(seats.map((s) => [s.playerID, s]));
  return (
    <div className={styles.seatPicker}>
      {Array.from({ length: maxPlayers }, (_, i) => String(i)).map((playerID) => {
        const occupant = seatByPlayerID.get(playerID);
        return (
          <button
            key={playerID}
            className={occupant ? styles.seatButtonTaken : styles.seatButtonOpen}
            type="button"
            disabled={!!occupant}
            onClick={() => onClaim(playerID)}
          >
            Seat {playerID}
            {occupant && ` — ${occupant.userID === currentUserID ? 'You' : occupant.userID}`}
          </button>
        );
      })}
    </div>
  );
}
```

Render site, replacing `<ClaimSeatForm onClaim={claimSeat} />`:

```tsx
{canClaim && room.status === 'lobby' && module && (
  <SeatPicker
    maxPlayers={module.maxPlayers}
    seats={seats}
    currentUserID={user.id}
    onClaim={claimSeat}
  />
)}
```

where `module = room.selectedGameID ? getGameModule(room.selectedGameID) : undefined`
computed once alongside the other `canX` flags — this is the exact same
gating `ClaimSeatForm` had (`canClaim && room.status === 'lobby'`) plus one
more condition (`module` must resolve), satisfying AC4: no game selected
means no picker, same as before.

`claimSeat` itself, and everything it does (credential handling via
`onSeatClaimed`, `actionError` on failure), is untouched — `SeatPicker`
only changes *how* a `playerID` reaches it (a button's `onClick` instead of
a form's `onSubmit`).

## `ClaimSeatForm` removal

Deleted entirely, along with its own local `playerID` input state — no
longer reachable once `SeatPicker` replaces its render site.

## Styling

New classes in `RoomShell.module.css`, reusing existing tokens (no new
design decisions — feature 003's token layer already covers this):

```css
.seatPicker {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.seatButtonOpen {
  composes: button;
}

.seatButtonTaken {
  composes: button;
  background: var(--color-surface);
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
}
```

## File layout

```
packages/client/
  src/room/RoomShell.tsx       # SeatPicker replaces ClaimSeatForm; module lookup added
  src/room/RoomShell.module.css # + .seatPicker/.seatButtonOpen/.seatButtonTaken
  src/room/RoomShell.test.tsx  # ClaimSeatForm-specific cases replaced/updated; new SeatPicker cases
```

Nothing else changes — no server, no shared, no game-core file, per
spec.md's non-goals.

## Testing / verification strategy

- `RoomShell.test.tsx` — replace the existing claim-related tests
  (`fireEvent.change` + `fireEvent.submit` against the old text input) with
  button-click equivalents; new cases for AC1 (N buttons for N
  `maxPlayers`), AC2 (taken seat disabled + labeled, open seat enabled),
  AC4 (no picker without a selected/resolvable game). AC3 is covered by
  the existing `claimSeat`-wiring tests (credential handling,
  `onSeatClaimed`, `actionError`), unmodified in behavior, just retargeted
  to click a seat button instead of submitting a form.
- No server or shared test changes — `claimSeat` itself is untouched.

## Open risks

None identified — smallest-scope feature since 006, same pattern (a
client-only rendering change wired to an already-correct, already-tested
action).
