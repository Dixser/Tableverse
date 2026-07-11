# Feature 007 — Room Membership: Leave & Kick

## Description

Feature 001 built seat-level membership actions (`claimSeat`, and via
feature 006, `leaveSeat`) but nothing at the *room*-membership level: no
member has ever been able to leave `Room.members` entirely, and the host's
`kickPlayer` permission has existed in `ROOM_PERMISSIONS` since feature 001
without ever being wired to a route or any UI. This feature adds both,
bundled together because they're the same underlying mutation
(`RoomService` removes an entry from `Room.members` and cascades a release
of every seat that member held) triggered by two different actors: the
member themself (leave) or the host acting on someone else (kick).

Two data-model questions were resolved with the user up front rather than
guessed:

- **The host cannot leave the room.** No host-succession logic is needed —
  `leaveRoom` is granted to `member` only, never `host`. If the host wants
  to stop hosting, that's out of scope for this feature (no "close room" or
  "transfer host" action exists).
- **A kicked player is not banned.** No ban-list state is added; the
  invite code still works for them exactly as it does for anyone else —
  kicking only affects *current* membership, not future eligibility to
  rejoin.

## User stories

### 1. Leaving the room voluntarily

As a room member (not the host), I click "Leave room" to remove myself from
the room entirely, so that I can step away without needing to ask anyone
or manage my seats first.

- Every seat I currently hold (zero or more, per feature 001's multi-seat
  support) is released as part of the same action — I don't need to leave
  each seat individually first.
- I'm removed from `Room.members`. If I want back in later, I re-join with
  the invite code like any new member (no special-cased "rejoin" path;
  it's the same `joinRoom` feature 001 already has, which is already
  idempotent for existing members and works identically for a former one).
- The host never sees a "Leave room" control for themself — only for
  seeing other members leave, and the host's own "Leave room" affordance
  simply isn't rendered.

### 2. Host kicking a player

As the host, I remove another member from the room entirely (not just
release their seat), so that I can deal with a disruptive or unwanted
player without waiting for them to leave on their own.

- Exactly the same cascade as story 1: every seat the kicked member held is
  released, and they're removed from `Room.members`.
- Gated by the existing `kickPlayer` permission (host-only, already present
  in `ROOM_PERMISSIONS` since feature 001, never wired to a route until
  now).
- I cannot kick myself (the host) — kicking targets any *other* member.
- A kicked player is not banned: they can rejoin with the room's invite
  code at any time afterward, same as any new joiner.

## Acceptance criteria

`[integration]` denotes a server-side room/permission test, `[component]`
a client-side `RoomShell` test.

1. `[integration]` A member calling `leaveRoom` is removed from
   `Room.members`; every seat they held in the room is released in the
   same operation.
2. `[integration]` `leaveRoom` is not a permitted action for the host —
   `canPerform('host', 'leaveRoom')` is `false`, and a host attempting the
   route is rejected the same way any not-permitted action is (403), per
   feature 001's existing `authorize()` pattern.
3. `[integration]` The host calling `kickPlayer` against another member
   removes that member from `Room.members` and releases every seat they
   held, identical in effect to that member calling `leaveRoom`
   themselves.
4. `[integration]` A non-host member attempting `kickPlayer` (on anyone,
   including themself) is rejected with 403 and no state change, per
   `ROOM_PERMISSIONS`.
5. `[integration]` The host attempting to kick themself is rejected — kick
   only targets a different `userID` than the actor.
6. `[integration]` After being kicked, the former member can `joinRoom`
   again with the same invite code and is re-added to `Room.members` as a
   fresh `member` — no ban list, no special-cased rejection.
7. `[component]` A "Leave room" control renders for the current user only
   when their own role is `member`; never for the `host`.
8. `[component]` A "Kick" control renders next to each *other* member in
   the Players list only when the current user's role is `host`; never
   next to the host's own entry, and never at all for a non-host viewer.
9. `[component]` Both actions surface a failure via the `actionError`
   banner introduced in feature 001's multi-seat bug fix (same pattern
   feature 006 reuses), without discarding the rest of the room chrome.

## Non-goals

- Host succession or a "transfer host" action — the host cannot leave, per
  the resolved decision above; a future feature can revisit this if
  needed.
- A "close/destroy room" action for the host — out of scope; a room with
  no host-initiated close mechanism simply persists until... (no cleanup
  mechanism exists yet at all, an existing gap from feature 001, not
  introduced or worsened by this feature).
- A ban list / permanently barring a kicked player — explicitly resolved
  against; a kicked player can always rejoin with the invite code.
- Any notification to a kicked/left player beyond their own client's normal
  room-state refresh (e.g. no toast saying "you were kicked") — their next
  `GET /:roomID` (or a failed action against a room they're no longer in)
  is how their client discovers the change, same pull-based model feature
  001 already uses for credential delivery.
