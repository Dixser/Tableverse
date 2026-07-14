# Feature 017 — Live Room Sync

## Description

Fixes a gap found during real multi-device testing (one desktop session as
host/admin, one phone session as guest): none of a room's lobby-level state
changes are visible to a *different*, already-connected browser until that
browser is manually reloaded. Observed symptoms, all one root cause:

- A guest joining the room via invite code — the host's player list does
  not update.
- The host changing the selected game — the guest's game selector and seat
  picker do not update.
- Either side claiming or releasing a seat — the other session's seat list
  does not update.
- The host starting a match — the guest's screen stays on "waiting for
  match" even after the match has actually begun, and the guest cannot
  join the board without a manual refresh.

This feature adds a lightweight real-time notification so every connected
browser in a room re-fetches and re-renders automatically the moment any of
these change, matching the always-live feel `/presence` (seat connection
badges) and `/chat` already have. It does **not** change how actual
in-match moves sync — that already happens correctly over boardgame.io's
own Socket.IO transport once a client is mounted for the right match; this
feature's job is only to make sure every browser reaches that "mounted for
the right match" state without needing a manual reload.

## Resolved design decisions

- **The push is a content-free "this room changed" ping, not a full state
  broadcast.** Every listening client reacts by calling its own existing
  `GET /api/rooms/:roomID` fetch (`RoomShell`'s existing `refresh()`), the
  same one it already runs on mount and after its own actions. This reuses
  the one place per-user filtering (spectator credentials) is already
  correctly implemented, instead of adding a second, parallel
  serialization/filtering path over a socket that would have to reproduce
  it — see plan.md for the concrete risk this avoids.
- **A new, dedicated Socket.IO namespace** (`/room-events`), joined per
  `roomID`, mirroring the existing `/presence` and `/chat` namespaces —
  consistent with this repo's "never share a channel between concerns"
  convention.
- **No authentication on the channel's `hello`**, matching `/presence`
  (not `/chat`): the payload carries zero information beyond "which room
  to watch," so there is nothing here impersonation could exploit — a
  socket that joins the wrong room only causes itself to redundantly
  re-fetch a room it's not part of (and that re-fetch is itself
  permission-checked by the existing REST route).
- **No change to boardgame.io's own multiplayer transport, `useSeatClients`,
  or `GameMount`.** Those already work correctly; they were just never
  being reached because the room state that drives mounting them
  (`selectedGameID`/`currentMatchID`) was stale.

## User stories

### 1. Host sees a guest join without reloading

As the host, when another member joins my room via invite code, I see them
appear in the player list immediately, without refreshing my own page.

### 2. Everyone sees a game change live

As any room member, when the game selector or currently-selected game
changes, my own view of the game selector and available seats updates
immediately.

### 3. Everyone sees seat claims/releases live

As any room member, when any seat in the room is claimed, released, or
left (by myself or anyone else), every connected member's seat list
reflects it immediately.

### 4. A guest sees a match start without reloading

As a guest, when the host starts the match, my screen transitions from
"waiting for match" to the actual board, with my own seat (if I hold one)
or spectator view already mounted — no manual refresh needed.

### 5. Everyone sees room/kick/settings changes live

As any room member, host actions that change room-wide state (kicking a
member, toggling `allowMultiSeat`, editing game settings, ending a match)
are reflected in my view immediately.

## Acceptance criteria

`[unit]`/`[integration]`/`[component]`/`[manual]` conventions match feature
012's spec.md.

1. `[integration]` Two sockets `hello`'d into the same `roomID` on the new
   `/room-events` namespace: emitting a `roomChanged` broadcast for that
   `roomID` reaches both.
2. `[integration]` A third socket `hello`'d into a different `roomID` does
   not receive a `roomChanged` broadcast emitted for the first `roomID`.
3. `[integration]` Each mutating room route (join, claim, leave-seat,
   release-seat, leave-room, kick, settings, change-game, start-match,
   end-match) invokes the injected room-events broadcaster with the
   correct `roomID` exactly once on success, and not at all if the
   route's own authorization/validation fails first.
4. `[component]` `RoomShell`, on receiving a `roomChanged` event from its
   room-events connection, calls its room-fetch (`roomApi.getRoom`) again
   — verified via a mocked socket in `RoomShell.test.tsx`.
5. `[manual]` Two real browser sessions (one host, one guest): join, game
   change, seat claim/release, and match start are each visible on the
   *other* session within roughly one round-trip, with no manual reload,
   confirming stories 1-5 end-to-end.
6. `[manual]` Once both sessions are in an active match, moves made by
   either side continue to sync live to the other (regression check —
   this path is unchanged by this feature but was never reachable
   end-to-end before it, due to the bug this feature fixes).

## Non-goals

- Pushing the actual updated `Room`/seat data over the socket — clients
  always re-fetch via the existing REST route (see "Resolved design
  decisions").
- Any change to presence badges, chat, or boardgame.io's own game-state
  transport.
- De-duplicating the redundant re-fetch the acting browser itself performs
  (it both calls `refresh()` locally after its own action *and* receives
  its own broadcast) — harmless and not worth the added complexity for
  this MVP-scale feature, consistent with prior features' accepted minor
  inefficiencies (e.g. feature 012's per-socket seat lookup on every chat
  send).
- Any kind of retry/offline-queueing if a client's `/room-events` socket
  is briefly disconnected — a missed ping is self-healing the next time
  any change happens, or on the client's own next manual reload, same
  safety net that existed before this feature for every case it fixes.
