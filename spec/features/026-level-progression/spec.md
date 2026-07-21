# Feature 026 — Generic "Next Level" Rematch

## Description

A small, cross-cutting platform feature enabling "win → start the next
level, same seats" generically, for any current or future game whose
`settingsSchema` exposes a numbered progression (a bounded numeric
`level` field) — motivated directly by Crew (feature 024/025), but
deliberately not built as Crew-specific code anywhere in
`packages/server` or `packages/client`, per tech-stack.md's "no
game-specific branching in platform code" rule.

Builds on the observation that "retry the same level after a loss" needs
**zero new code**: `RoomService.rematch` already ends the current match
and starts a fresh one with the room's unchanged `selectedGameID`/
`gameSettings`/seats. "Next level" is the same operation with one field of
`gameSettings` advanced first.

## Resolved design decisions

- **`RoomService.rematch(roomID, gameSettings?)`** — the optional second
  parameter, when present, is validated exactly like `setGameSettings`
  (extracted into a shared private `validateAndPersistGameSettings`
  helper) and persisted after `endMatch` but before `startMatch`. Absent,
  behavior is unchanged. No new `RoomAction`/permission — reuses the
  existing host-gated `'rematch'` action.
- **`getNextLevelGameSettings(schema, gameSettings)`** (new
  `@tableverse/game-core` export) — pure function: given a
  `settingsSchema` and the room's current `gameSettings`, returns the
  settings object to submit (current `level` advanced to the next higher
  value present in the schema's `level` enum, preserving every other
  field), or `null` when there's no numeric `level` enum field, the
  current value isn't recognized, or it's already at the schema's
  maximum. Handles a non-contiguous enum (advances to the next higher
  value present, not necessarily +1).
- **`RoomShell`'s "Next Level" button** — host-only, shown alongside the
  existing Rematch button exactly when: the match ended in a win
  (`gameover.winner` present — reuses the same read `GameoverBanner`'s own
  `resolveGameoverMessage` does, factored out here as `isWinGameover`) and
  `getNextLevelGameSettings` returns non-null for the selected game's
  schema and the room's current settings. Clicking it calls
  `rematch(nextLevelGameSettings)`.
- **`level` is modeled as an `enum` of 1-50, not `minimum`/`maximum`
  bounds**, because `validateGameSettings` (feature 013) only ever
  enforced `type` and `enum`, never numeric bounds. `enum` is also what
  `SettingsForm.tsx` already renders as a `<select>` dropdown — the right
  control for picking one of 50 missions.
- **Platform bug fixed as part of this feature**: `SettingsForm.tsx`'s
  enum control called `setField(key, e.target.value)` unconditionally — a
  `<select>`'s value is always a string — while `validateGameSettings`
  requires `typeof v === 'number'` whenever the property's `type` is
  `'number'`. A numeric enum (exactly what `level` needs) failed
  validation on every submit before this fix. Now coerces via
  `Number(e.target.value)` when `propSchema.type === 'number'`.

## User stories

### 1. Retrying the same level after a loss

As the host, after a mission attempt ends in a loss, I press the existing
Rematch button and a fresh attempt starts at the same level with the same
seats — no new UI, no new endpoint.

### 2. Advancing to the next level after a win

As the host, after a mission attempt ends in a win, I see a "Next Level"
button alongside Rematch; pressing it starts a fresh match at the next
level, with the same seats, without re-claiming anyone.

### 3. A game with no level concept sees no Next Level button

As the host of a room playing a game with no numbered-progression
setting (e.g. Regicide, or Love Letter's plain edition enum), I never see
a Next Level button, on either a win or a loss — only the existing
Rematch button, unchanged.

## Acceptance criteria

`[unit]` denotes a Vitest test against a specific function.
`[integration]` denotes a test against `RoomService`/`roomRoutes` with a
real (in-memory) database. `[component]` denotes a `RoomShell` test with
a fixture `GameModule`.

1. `[unit]` `getNextLevelGameSettings` returns the current settings with
   `level` advanced to the next higher enum value (preserving other
   fields), returns `null` at the schema's maximum, returns `null` for a
   schema with no `level` field or a non-numeric/non-enum `level`, and
   returns `null` when the current `gameSettings.level` isn't itself one
   of the schema's recognized values.
2. `[integration]` `RoomService.rematch(roomID, gameSettings)` persists
   the given settings (validated against the selected game's
   `settingsSchema`, same errors as `setGameSettings`) before starting
   the new match, preserving the room's existing seats; an invalid
   override throws and leaves the room in `lobby` with no new match
   started; omitting the parameter behaves exactly as before this
   feature (same-settings retry).
3. `[integration]` `POST /:roomID/rematch` accepts an optional
   `{ gameSettings }` body and returns the room with those settings
   persisted; a bodyless call (the existing retry path) is unaffected.
4. `[component]` `RoomShell` shows "Next Level" for the host exactly when
   `gameover` is a win AND the selected game's schema yields a non-null
   `getNextLevelGameSettings` result; never on a loss, never for a
   schema with no `level` field, never once already at the max level,
   and never for a non-host member even on a win. Clicking it calls
   `roomApi.rematch` with the advanced settings.
5. `[unit]` `SettingsForm`'s enum control submits a `number` (not a
   string) whenever the property's `type` is `'number'`, fixing the
   validation failure a numeric enum previously always hit.

## Non-goals

- Any per-game branching in `RoomShell`, `RoomService`, or the route
  layer keyed on a specific `selectedGameID` — the whole point of this
  feature is that it is NOT Crew-specific.
- A `minimum`/`maximum` numeric-bounds addition to `validateGameSettings`
  itself — `enum` already covers this feature's need.
- Any in-room "current level" display beyond what the existing settings
  form/gameSettings already show.
- An attempt counter (how many tries a level took) — not requested here;
  would be a Room-level concern if ever added.
