# Feature 001 — Platform Core

## Description

The platform core is the shared foundation that every board game on this
platform is played through. It has no game-specific logic of its own. It
delivers: a lightweight identity (nickname + client-side session), rooms
that groups join via a private invite code, seat claiming (including
multi-seat and solo play), a room lifecycle (`lobby` / `in_game`),
per-seat presence/reconnection, a data-driven permissions model, and the
generic `GameModule` contract plus its conformance test suite — the
mechanism every future game plugs into without this feature (or any code
in it) needing to change again.

This feature ships with **no playable game**. It is validated using the
`GameModule` conformance suite against a minimal test fixture module (see
plan.md); the first real, playable game is feature 002.

## User stories

### 1. Creating a room

As a visitor, I choose a nickname and create a room, so that I have a
private place to invite others and pick a game.

- I become the room's `host`.
- A private `inviteCode` is generated and shown to me so I can share it.
- The room starts in `lobby` status with no `selectedGameID` yet (or a
  default — see plan.md) and no `currentMatchID`.

### 2. Joining via invite code

As a visitor with an invite code, I enter it and join the room as a
`member`, so that I can play with the group that invited me.

- I choose a nickname on joining if I don't already have a session.
- I'm added to `Room.members` with role `member`.
- I see the current room state: selected game (if any), current seat
  assignments, and who else is present.

### 3. Claiming one or more seats

As a room member, I claim a seat for the selected game so that I can play
in the upcoming match.

- If `Room.allowMultiSeat` is `false`, I may hold at most one seat at a
  time in this room.
- If `Room.allowMultiSeat` is `true`, I may claim more than one open seat.
- Claiming a seat while the room is still in `lobby` (no match exists yet)
  reserves that `playerID` for me — a room-level assignment only, since
  boardgame.io credentials are inherently scoped to a specific `matchID`
  that doesn't exist yet. My client receives real
  `{ matchID, playerID, credentials }` for every seat I hold once the host
  starts the match (see story 9's `startMatch` behavior), and records each
  in its seat-credential store at that point.
- Claiming an open seat while the room is already `in_game` (e.g. a seat
  the host just released) mints my `{ matchID, playerID, credentials }`
  immediately, since a match already exists to claim credentials against.
- I cannot claim a seat that's already claimed by someone else.

### 4. Playing solo by claiming all seats

As a visitor who wants to play alone, I create a room, enable
`allowMultiSeat`, and claim every seat myself, so that I can play a
multiplayer game solo using the identical rules engine and validation as a
real multiplayer match.

- Once I hold every seat, I can start the match exactly as any fully-seated
  room would.
- Each seat I control is presented through its own `Client()` instance and
  its own seat-scoped view (see "hidden information" rule in
  tech-stack.md) — I never see two seats' hidden state merged on screen.

### 5. Spectating without a seat

As a room member who has not claimed a seat, I can still watch the match in
progress, so that I don't have to leave the room just because I'm not
playing this round.

- I am mounted as a boardgame.io spectator (`playerID: undefined`) with no
  special-case platform code required.
- I never see another player's hidden information through the spectator
  view (enforced by each game's `playerView`, checked by the conformance
  suite).

### 6. Losing connection and reconnecting

As a seated player whose connection drops (network blip or tab close), I
can come back and resume my seat, so that a temporary disconnect doesn't
cost me my place in the match.

- On reconnect (same device/browser), my client reads my seat's stored
  credentials from `localStorage` and reconnects using them.
- If I reconnect before my seat's grace period expires, I resume exactly
  where the match left off, with no visible disruption to other players
  beyond a presence badge update.

### 7. A seat entering grace period and being released by the host

As the host, when another player's seat shows as disconnected for too
long, I can release that seat so the group isn't stuck waiting indefinitely.

- When a seated player's socket disconnects, their seat's presence status
  becomes `grace_period` and every room member sees this reflected (e.g. a
  "disconnected, reconnecting…" badge) via the room-presence channel.
- If the grace period expires without reconnection, the seat becomes
  eligible for release, but is **not** auto-freed.
- Only I (the host) can explicitly release or reassign that seat — this is
  gated by the permissions model (`manageSeats`).
- Once released, the seat becomes open for another member to claim.

### 8. Host changing the selected game

As the host, I change which game the room will play, so the group can
switch games between matches.

- Changing `selectedGameID` is only possible while the room is in `lobby`.
- Changing the game **resets all current seat assignments** — everyone must
  re-claim a seat for the new game.
- `gameSettings` are reset/reinitialized against the new game's
  `settingsSchema` (defaults applied; nothing carried over from the
  previous game).

### 9. Ending a match and returning to lobby with seats preserved

As the host, I end the current match without changing the game, so the
group can immediately start a rematch with the same seating.

- Ending a match transitions the room from `in_game` back to `lobby` and
  clears `currentMatchID`.
- If `selectedGameID` is unchanged, current seat assignments are
  **preserved** — no one needs to re-claim their seat to start a rematch.
- Starting a new match creates a fresh boardgame.io `matchID` using the
  preserved seat assignments.

## Acceptance criteria

Each item is written to map directly onto one automated test. `[unit]`
denotes a headless-`Client` test against game-core (used only via the
conformance-suite fixture in this feature, since there is no real game
yet); `[integration]` denotes a server-side room/presence/permission test.

1. `[integration]` Creating a room produces a `Room` with a freshly
   generated, unique `inviteCode`, `status: 'lobby'`, `currentMatchID:
   null`, the creating user recorded as `hostUserID`, and as the sole entry
   in `members` with role `host`.
2. `[integration]` Joining with a valid `inviteCode` adds the joining user
   to `Room.members` with role `member`; joining with an invalid/unknown
   code is rejected without creating a room or a membership.
3. `[integration]` Claiming a seat when `allowMultiSeat` is `false` fails
   if the claiming user already holds a seat in this room.
4. `[integration]` Claiming a seat when `allowMultiSeat` is `true` succeeds
   for a user who already holds one or more other seats in this room.
5. `[integration]` Claiming an already-claimed seat fails, regardless of
   `allowMultiSeat`.
6. `[integration]` Claiming a seat while the room is `lobby` (no match yet)
   creates a room-level seat assignment only (no boardgame.io credentials);
   claiming an open seat while the room is `in_game` immediately issues a
   `{ matchID, playerID, credentials }` triple usable to authenticate as
   that seat. Starting a match (story 9) issues
   `{ matchID, playerID, credentials }` for every seat assigned at that
   moment, in one batch.
7. `[integration]` A user holding every seat in a room (solo play) can
   successfully start a match; the resulting match is indistinguishable, at
   the server/storage level, from a match started by distinct users (same
   validation, same persistence path).
8. `[unit]` For the conformance-suite fixture module, rendering the state
   for `playerID: undefined` (spectator) never includes a field the
   fixture's `playerView` marks as hidden for seated players.
9. `[integration]` A member with no claimed seat is able to observe live
   match state updates without being granted a `playerID`, and without any
   room/server code branching on "is this user a spectator."
10. `[integration]` On socket disconnect for a claimed seat, that seat's
    presence status transitions to `grace_period` and a status-change event
    is broadcast on the room-presence channel (and not on the game-state
    channel).
11. `[integration]` Reconnecting with that seat's stored credentials before
    the grace period elapses cancels the pending release timer and returns
    the seat's presence status to `connected`.
12. `[integration]` If the grace period elapses without reconnection, the
    seat's presence status becomes `released`-eligible, but the seat
    remains assigned to the original user (not auto-freed) until the host
    acts.
13. `[integration]` A `manageSeats` action from the host on a
    `released`-eligible seat frees it; the same action attempted by a
    non-host `member` is rejected by `canPerform`.
14. `[integration]` `changeGame` succeeds only while `Room.status ===
    'lobby'`; attempting it while `status === 'in_game'` is rejected.
15. `[integration]` A successful `changeGame` clears every entry in the
    room's current seat assignments and resets `gameSettings` to the new
    game's schema defaults.
16. `[integration]` `startMatch` transitions `Room.status` to `in_game`,
    sets `currentMatchID` to a newly created boardgame.io match ID, and is
    only permitted for users whose role has the `startMatch` permission.
17. `[integration]` `endMatch` transitions `Room.status` back to `lobby`
    and clears `currentMatchID`; if `selectedGameID` was not changed during
    the match, seat assignments present at match end are unchanged after
    the transition.
18. `[integration]` For every `(role, action)` pair not explicitly granted
    in `ROOM_PERMISSIONS`, `canPerform` returns `false`, and the
    corresponding server action handler rejects the request.
19. `[unit]` The conformance suite, run against the fixture `GameModule`,
    passes on the correct fixture and fails when the fixture's
    `playerView` is deliberately altered to leak hidden state — proving the
    suite actually detects the violation it claims to check.

## Non-goals

- OAuth or any real authentication mechanism (Phase 2, per tech-stack.md).
- Cross-device reconnection — a seat can only be resumed from the
  device/browser that claimed it.
- Spectator chat or any chat system.
- Any room role beyond `host` and `member`.
- Matchmaking, public room listings, or any way to discover a room other
  than a private invite code.
- Any specific playable game or its `BoardComponent` — those belong to
  feature 002 onward. This feature's own testing uses only a throwaway
  fixture module, never registered in the real `gamesCatalog`.
