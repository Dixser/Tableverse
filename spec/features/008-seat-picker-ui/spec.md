# Feature 008 — Seat Picker UI

## Description

Replaces `RoomShell`'s free-text "seat number" input (`ClaimSeatForm`)
with one button per seat the selected game actually has — `0` through
`gameModule.maxPlayers - 1` — so a member sees exactly how many seats
exist and which are open at a glance, instead of guessing a valid number
to type. Clicking an open seat's button claims it directly, reusing the
existing `claimSeat` action unchanged. Purely a client-side rendering
change: no new server behavior, no new permission, no new endpoint.

## User stories

### 1. Seeing every seat a game has, at a glance

As a room member in the lobby with a game selected, I see one button per
seat the game supports (e.g. 2 buttons for Tic-Tac-Toe), so that I know
exactly how many players the match needs without checking anything else.

- Every seat from `0` to `gameModule.maxPlayers - 1` gets its own button,
  labeled with its seat number.
- A seat already claimed by someone shows as taken (disabled, labeled with
  its occupant) rather than disappearing — the total seat count stays
  visible even once some seats are filled.

### 2. Claiming a seat with one click

As a room member who can claim a seat, I click an open seat's button to
claim it immediately, so that I don't need to type a number and submit a
form.

- Clicking an open seat's button calls the existing `claimSeat` action for
  that exact `playerID` — no text entry, no submit step.
- This is a pure UI change to how `claimSeat` is triggered; every existing
  behavior of `claimSeat` itself (two-phase lobby/in_game credential
  timing, `allowMultiSeat` enforcement, error surfacing via `actionError`)
  is unchanged.

## Acceptance criteria

`[component]` denotes a client-side `RoomShell` test.

1. `[component]` With a game selected whose `maxPlayers` is N, exactly N
   seat buttons render, labeled `0` through `N-1`.
2. `[component]` A seat already present in the room's claimed-seats list
   renders as a disabled button labeled with its occupant (`You` for the
   current user, the userID otherwise); an open seat renders as an
   enabled, clickable button.
3. `[component]` Clicking an open seat's button calls `roomApi.claimSeat`
   with that exact `playerID`, mirroring the existing `claimSeat` callback
   wiring (credential handling, `onSeatClaimed`, `actionError` on
   failure) — unchanged from before this feature.
4. `[component]` No picker renders when the room has no `selectedGameID`,
   or `room.status !== 'lobby'`, or the current user's role lacks
   `claimSeat` — the same gating conditions `ClaimSeatForm` already had.

## Non-goals

- Any change to `claimSeat`'s server-side behavior, permission, or the
  two-phase lobby/in_game credential model — all unchanged, per feature
  001.
- A picker for the host's `manageSeats`/`Release` action, or for
  `leaveSeat`/`leaveRoom`/`kickPlayer` — those already have their own
  per-row controls (features 001, 006, 007) and are out of scope here.
- Any visual/CSS redesign beyond what's needed to render N buttons instead
  of the previous form — reuses feature 003's existing button/token
  styles.
