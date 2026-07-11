# Feature 005 — Spectator Live View: Implementation Plan

## Where the gap actually lives

`GameMount` was already correct and generic — feature 001's own plan.md
even notes it "needs no per-game awareness." The gap is entirely inside
`useSeatClients`: its mounting effect only ever looks at
`seatCredentialStore.getForMatch(matchID)`, and when that's empty
(no claimed seat), it mounts nothing at all — `boardProps` stays `null`
forever, which is why `GameMount` fell back to a static placeholder. This
feature adds a second, spectator-shaped code path to that same effect; no
change to `GameMount`'s branching logic, only its placeholder copy (see
below).

## Spectator `Client()` — no presence socket

`mountSeat` (existing, for a claimed seat) opens both a boardgame.io
`Client()` **and** a dedicated `/presence` socket identifying that seat
(`hello` with `{ roomID, seat: { matchID, playerID } }`), because a claimed
seat has a grace-period timer to drive. A spectator has no seat and
therefore nothing for the presence/grace-period system to track — the
room-level presence badges members already see are driven by `RoomShell`'s
own `usePresence(roomID)` call, which is a separate, already-existing
observer-only join. So the new `mountSpectator` only needs the boardgame.io
`Client()`, nothing else:

```ts
// packages/client/src/seats/useSeatClients.ts
interface MountedSpectator {
  client: ClientInstance;
  unsubscribe: () => void;
}

function mountSpectator(
  gameDef: Game,
  matchID: string,
  onState: (state: SeatState) => void,
): MountedSpectator {
  const client = Client({
    game: gameDef,
    multiplayer: SocketIO({ server: API_BASE_URL }),
    matchID,
    // No playerID, no credentials -- this is exactly what makes
    // boardgame.io's own multiplayer transport treat the connection as a
    // spectator and scope playerView accordingly (spec.md story 2). No new
    // enforcement layer is added here; this relies entirely on
    // boardgame.io's existing behavior for a playerless client.
  });
  const unsubscribe = client.subscribe(onState);
  client.start();
  return { client, unsubscribe };
}

function unmountSpectator(spectator: MountedSpectator): void {
  spectator.unsubscribe();
  spectator.client.stop();
}
```

## Mounting logic — extending the existing effect

```ts
useEffect(() => {
  if (!roomID || !matchID) {
    setSeats(new Map());
    setActiveSeatIDState(null);
    setStatesBySeat(new Map());
    setSpectator(null);
    setSpectatorState(undefined);
    return;
  }

  const credentials = seatCredentialStore.getForMatch(matchID);

  // AC3: claimed seats always take priority -- a spectator Client() is
  // only ever mounted when this browser holds zero seats in this match.
  if (credentials.length === 0) {
    const spectatorClient = mountSpectator(gameDef, matchID, setSpectatorState);
    setSeats(new Map());
    setStatesBySeat(new Map());
    setActiveSeatIDState(null);
    setSpectator(spectatorClient);
    return () => unmountSpectator(spectatorClient);
  }

  const mounted = new Map<string, MountedSeat>();
  for (const credential of credentials) {
    /* ...unchanged from today... */
  }
  setSeats(mounted);
  setStatesBySeat(new Map());
  setActiveSeatIDState(credentials[0]?.playerID ?? null);
  setSpectator(null);
  setSpectatorState(undefined);

  return () => {
    for (const seat of mounted.values()) unmountSeat(seat);
  };
}, [roomID, matchID, gameDef]);
```

`boardProps` falls back to the spectator's state only when there's no
active seat client, and always passes an empty `moves` object and
`playerID: null` for the spectator case — spec.md AC4's "no moves are ever
dispatched from spectator view" is enforced structurally (the spectator
never even receives a real `moves` object to call), not by hoping nobody
clicks:

```ts
const boardProps: BoardProps | null =
  activeClient && activeState
    ? { G: activeState.G, ctx: activeState.ctx, moves: activeClient.moves, playerID: activeClient.playerID, isActive: activeState.isActive }
    : spectator && spectatorState
      ? { G: spectatorState.G, ctx: spectatorState.ctx, moves: {}, playerID: null, isActive: false }
      : null;
```

## Story 3 — spectator claims a seat, without a reload

This is where feature 005 collides with a gap feature 001's own plan.md
already flagged and explicitly left unfixed: `addSeat` (the function that's
supposed to hot-mount a newly claimed seat's `Client()`) exists on
`useSeatClients`'s returned state, but **nothing calls it**. `RoomShell`'s
`claimSeat` writes a fresh mid-match credential straight to
`seatCredentialStore` and just calls `refresh()`, which never re-triggers
`useSeatClients`'s mount effect (that effect only depends on
`[roomID, matchID, gameDef]`, none of which change on a same-match seat
claim). Today this means a spectator who claims an open seat sees nothing
change until they reload — silently failing spec.md's story 3 ("without
needing to reload the page").

Fixing this is in-scope here (not a separate feature) because story 3 is
this feature's own promise, and the fix is small: `RoomShell` gains one new
optional prop, called only for the case it already special-cases today
(the credential a mid-match `claimSeat` call returns directly):

```ts
// RoomShellProps
/** Called with a freshly-claimed seat's credential (mid-match claims only
 *  -- a lobby claim has no credential yet, per feature 001's two-phase
 *  model). Lets the caller hot-mount a Client() for it immediately,
 *  closing the gap feature 001's plan.md flagged and left unfixed:
 *  useSeatClients previously had no way to learn about a seat claimed
 *  after its mount effect already ran. */
onSeatClaimed?: (credential: SeatCredential) => void;
```

```ts
// RoomShell.claimSeat, changed by exactly one line
if (credential) {
  seatCredentialStore.add(credential);
  onSeatClaimed?.(credential);
}
```

`ActiveRoom` (`App.tsx`) wires this to the already-existing (previously
dead) `addSeat`:

```tsx
<RoomShell
  // ...
  onSeatClaimed={(credential) => seatClients.addSeat(roomID, credential)}
/>
```

`addSeat` itself gains one addition: tearing down the spectator client it
supersedes, since a browser can't simultaneously be spectating and holding
the seat it just claimed:

```ts
const addSeat = useCallback(
  (targetRoomID: string, credential: SeatCredential) => {
    seatCredentialStore.add(credential);
    const seat = mountSeat(gameDef, targetRoomID, credential, /* ... */);
    setSeats((prev) => { /* ...unchanged... */ });
    setActiveSeatIDState(credential.playerID);
    setSpectator((prev) => {
      if (prev) unmountSpectator(prev);
      return null;
    });
  },
  [gameDef],
);
```

**Deliberately not fixed as part of this**: the *other* half of feature
001's acknowledged gap — a **lobby** claim's credential, delivered later
via `RoomShell.refresh()`'s `myCredentials` loop when the host starts the
match while this browser's tab is already open. That loop re-delivers
*every* currently-held credential on *every* refresh (not just newly
discovered ones), so wiring it to `addSeat` naively would tear down and
remount already-running seat `Client()`s (including the active one) on
every single room action — a real regression, not a narrow fix. Story 3 as
specced only covers the mid-match-claim path (`claimSeat`'s direct
credential return), which this plan fixes precisely. The lobby-claim case
remains a known, pre-existing, documented limitation (a page reload picks
it up) — unchanged by this feature, not newly introduced by it.

## `GameMount` — placeholder copy only

No logic change. The only remaining case where `boardProps` is `null` is
"no live match to show yet" (room still `lobby`) or the brief window before
a client's first state arrives — "Spectating {game} (no seat claimed)" is
now actively misleading (a spectator's board *does* render once a match
exists). Reworded to reflect what null actually means post-fix:

```tsx
if (!boardProps) {
  return <div>Waiting for the match to start…</div>;
}
```

## File layout

```
packages/client/
  src/seats/useSeatClients.ts       # + mountSpectator/unmountSpectator, spectator state, addSeat tears down spectator
  src/seats/useSeatClients.test.ts  # new -- mocks boardgame.io/client, boardgame.io/multiplayer, socket.io-client
  src/room/RoomShell.tsx            # + onSeatClaimed prop, one-line change in claimSeat
  src/room/RoomShell.test.tsx       # + onSeatClaimed wiring case
  src/gameMount/GameMount.tsx       # placeholder copy only
  src/gameMount/GameMount.test.tsx  # updated placeholder-text assertion
  src/App.tsx                       # wires onSeatClaimed={(c) => seatClients.addSeat(roomID, c)}
```

No changes to `packages/server` or any game-core/per-game file — this is
entirely the client-side `Client()`-mounting layer, exercised against
Tic-Tac-Toe (the only real `GameModule`) per spec.md's non-goals.

## Testing / verification strategy

- `useSeatClients.test.ts` (new) — mocks `boardgame.io/client`'s `Client`
  (a controllable fake exposing a `push(state)` escape hatch for the test
  to simulate successive state updates), `boardgame.io/multiplayer`'s
  `SocketIO`, and `socket.io-client`'s `io`. Covers AC1 (spectator
  `Client()` mounted with no `playerID`/`credentials` when the store holds
  no seat for the match), AC2 (two successive pushed states both appear in
  `boardProps`), AC3 (a claimed seat suppresses the spectator path
  entirely), AC4 (`boardProps.moves` is `{}` and `playerID` is `null` for
  the spectator case).
- `RoomShell.test.tsx` — one new case confirming `onSeatClaimed` fires with
  the credential from a mid-match `claimSeat` call.
- `GameMount.test.tsx` — update the existing "no seat claimed" case's
  expected text to match the reworded placeholder.
- AC5/AC6 (`[manual]`, two real browser sessions) — same status as feature
  003/004: browser preview tooling has been unavailable all session:
  `list_connected_browsers` returns `[]`, both toolsets fail. Will attempt
  again at implementation time; if still unavailable, flagged the same way
  as the prior two features rather than silently skipped.

## Open risks

1. **`useSeatClients.test.ts` mocking boardgame.io's `Client` is new
   territory** — no existing test in this codebase mocks it (`GameMount`'s
   tests pass `boardProps` directly as a prop, sidestepping `Client()`
   entirely). The mock needs to be realistic enough that a future game's
   `useSeatClients` behavior stays covered, not just Tic-Tac-Toe's shape —
   kept deliberately game-agnostic (fixture `G`/`ctx` are opaque objects,
   never Tic-Tac-Toe-specific fields).
2. **Fixing the mid-match half of the dead-`addSeat` gap while leaving the
   lobby-claim half unfixed** is a real inconsistency a user could notice
   (claim during an active match → live immediately; claim in the lobby
   right as the host starts → still needs a reload). Documented above and
   in spec.md's non-goals implicitly via story 3's scope, but worth
   flagging again here since it's the kind of thing that looks like a bug
   report waiting to happen.
