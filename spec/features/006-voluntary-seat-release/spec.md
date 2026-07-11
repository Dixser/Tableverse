# Feature 006 — Voluntary Seat Release

## Description

Closes the second gap found during the same feature-001 spec audit that
produced feature 005. `leaveSeat` is a fully wired `RoomAction`: it's
granted to both `host` and `member` in `ROOM_PERMISSIONS`
(`packages/shared/src/permissions.ts`), it has a working server route
(`POST /api/rooms/:roomID/seats/:playerID/leave`, gated by
`canPerform(role, 'leaveSeat')`), and it has a typed client API wrapper
(`roomApi.leaveSeat`) with its own passing unit test. What's missing is the
only thing that makes it reachable by an actual user: no component in
`packages/client` ever calls it. A member who claims a seat today has no
way to give it up themselves — the only path back to an open seat is the
host's `manageSeats`-gated `release`, which per feature 001's story 7 is
meant for *disconnected* seats the host is clearing, not a voluntary
change-of-mind by the seat's own occupant.

This is a small, purely additive UI feature: one button, wired to an
endpoint and permission that already exist and are already tested at the
server layer.

## User stories

### 1. Giving up a seat I claimed

As a room member holding a seat I no longer want (claimed the wrong seat,
want to spectate instead, want to let someone else play), I release it
myself, so that I don't have to ask the host to do it for me.

- I see a "Leave seat" control next to any seat I currently occupy.
- Clicking it releases my claim; the seat becomes open for anyone (subject
  to `allowMultiSeat`, unchanged from feature 001) to claim, including
  myself again later.
- This works identically whether the room is `lobby` (releases the
  room-level reservation) or `in_game` (releases my claim on a seat whose
  match is already running) — `leaveSeat`'s existing server-side behavior
  is unchanged by this feature; it only adds a UI entry point to it.

### 2. Distinguishing "leave" from "release"

As a room member, I only ever see a "Leave seat" control on seats I myself
occupy — never on another player's seat, which remains exclusively the
host's `manageSeats`-gated "Release" control from feature 001, unchanged.

- This preserves feature 001's existing permission boundary: a member can
  only ever act on their own seat (`leaveSeat`); only the host can act on
  someone else's (`manageSeats`).

## Acceptance criteria

`[component]` denotes a client-side `RoomShell` test. `[integration]`
denotes reuse/confirmation of feature 001's existing server-side
`leaveSeat` route and permission tests — this feature adds no new server
behavior, so no new integration test is expected unless the audit turns one
up during implementation.

1. `[component]` A seat occupied by the current user renders a "Leave seat"
   control; a seat occupied by another user never renders it for the
   current user, regardless of role (host or member).
2. `[component]` Clicking "Leave seat" calls `roomApi.leaveSeat` with the
   current user's own `playerID` and refreshes room state on success,
   mirroring the existing `releaseSeat`/`claimSeat` callback pattern in
   `RoomShell.tsx`.
3. `[component]` A failed `leaveSeat` call (e.g. a network/server error)
   surfaces via the `actionError` banner introduced in feature 001's
   multi-seat bug fix, without discarding the rest of the room chrome —
   reusing that existing error-handling path rather than introducing a new
   one.
4. `[component]` The existing host-only "Release" control (feature 001) is
   unchanged: still shown only to a user with `manageSeats`, still able to
   target any seat including the host's own.

## Non-goals

- Any change to `leaveSeat`'s server-side behavior, route, or permission —
  all of that already exists and is already tested by feature 001; this
  feature is client-UI-only.
- A confirmation dialog ("are you sure?") before leaving — out of scope;
  claiming a seat is already cheap to redo, and feature 001 sets no
  precedent for confirmation dialogs on any other room action.
