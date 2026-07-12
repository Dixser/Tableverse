# Feature 013 — Generic Game Settings Form

## Description

Platform-chrome feature, not a game. Closes a gap surfaced while planning
Love Letter (feature 014): `GameModule.settingsSchema` has existed since
feature 001 and tech-stack.md documents its contract in detail ("the
platform's only job is to render a generic form from the schema and
persist submitted values under `Room.gameSettings` — there is no per-game
branching anywhere in platform code to support this"), but **no code
implements either half of that promise today.** Confirmed by reading the
current implementation, not assumed:

- `POST /:roomID/settings` (`roomRoutes.ts`) only ever reads and applies
  `allowMultiSeat` from the request body — there is no code path that
  writes anything into `Room.gameSettings` at all, ever, for any game.
  `RoomService` has no `setGameSettings` method.
- `packages/client` has no component that reads a `GameModule`'s
  `settingsSchema` and renders anything from it — grepping the client
  source for `settingsSchema`/`gameSettings` finds only a default value in
  a test fixture (`RoomShell.test.tsx`), never a real render path.

No shipped game has ever needed this (Tic-Tac-Toe deliberately has no
`settingsSchema`, per feature 002's own non-goals), so the gap has been
invisible until now. Love Letter is the first game whose two rules
editions (Normal/Classic, per tech-stack.md's versioning heuristic — see
feature 014's spec.md) are modeled as one settings value (`edition`), which
requires a host to actually be able to set it before a match starts. This
feature builds the generic mechanism; feature 014 is its first real
consumer, exercising exactly one field (`edition`, a string enum) — nothing
more elaborate is validated end-to-end yet, and this feature's scope is
capped accordingly (see Non-goals).

## User stories

### 1. A host configures a game's settings before starting

As a room's host, once I've selected a game that declares a
`settingsSchema`, I see a form generated from that schema (one control per
declared field) inline in the lobby, change a value, and it's saved to
`Room.gameSettings` — so the next match created for this room uses it,
without either me or the game's author having built any settings UI by
hand.

### 2. A game with no settings shows no form

As a host who selects a game with no `settingsSchema` (e.g. Tic-Tac-Toe),
I see no settings section at all — confirming the generic form never
renders empty chrome for a game that doesn't need it.

### 3. Settings are locked once a match starts

As a host, once the room transitions to `in_game`, the settings form
becomes read-only/hidden the same way the game selector already is
(tech-stack.md's "game selector is locked... no `changeGame` while a
match is live") — settings that shaped the current match can't be changed
out from under it mid-match.

### 4. Invalid input is rejected before it reaches a match

As a host, if I submit a value that doesn't satisfy the selected game's
schema (e.g. a value outside a declared `enum`), the submission is
rejected with a clear error and `Room.gameSettings` is left unchanged — a
game's `setup` can trust that any `gameSettings` it receives already
satisfies its own declared schema.

## Acceptance criteria

`[unit]` denotes a test of the schema-validation function in isolation.
`[integration]` denotes a server-side test of the new route/service method
against a real (throwaway) DB, mirroring existing `roomService` integration
coverage. `[component]` denotes a client-side test of the form renderer in
isolation. `[manual]` denotes verification via the real dev server.

1. `[unit]` Validating a value against a schema with a `string` + `enum`
   property: a value inside the enum passes; a value outside it fails with
   an error identifying the offending field.
2. `[unit]` Validating a value against a schema with a `boolean` property
   rejects a non-boolean value for that field.
3. `[unit]` A property listed in the schema's `required` array missing
   from the submitted value fails validation.
4. `[unit]` A submitted value containing a key not declared in the
   schema's `properties` is rejected (no silent pass-through of unknown
   fields into `Room.gameSettings`).
5. `[integration]` `RoomService.setGameSettings` persists a valid settings
   object and returns the updated `Room`; a room in `in_game` status is
   rejected (mirrors `changeGame`'s existing lobby-only guard).
6. `[integration]` `POST /:roomID/settings` with a `gameSettings` body
   validated against the room's currently `selectedGameID`'s schema:
   valid input persists and returns 200 with the updated room; invalid
   input returns 400 with no change to stored `Room.gameSettings`; a
   non-host caller is rejected the same way every other `editRoomSettings`-
   gated action already is.
7. `[integration]` The existing `allowMultiSeat`-only request shape (no
   `gameSettings` key present in the body at all) continues to work
   unchanged — this feature is additive to the existing route, not a
   breaking change to it.
8. `[component]` Given a schema with one `string`+`enum` property, the
   form renders a single select control with the enum's options in schema
   declaration order, pre-selected to the current `Room.gameSettings`
   value if present, or the schema's `default` if not.
9. `[component]` Given a `GameModule` with no `settingsSchema`, the form
   component renders nothing (story 2) — not an empty `<section>`, no
   heading, nothing in the DOM.
10. `[component]` Submitting the form calls the settings-update API with
    exactly the schema-declared fields' current values; a client-side
    validation error (same validator as the server's, reused from
    `game-core`) is shown inline without an API call when the local value
    doesn't satisfy the schema, so a host gets immediate feedback instead
    of a round-trip failure for an obviously invalid entry.
11. `[manual]` Selecting a game with a real `enum`-typed setting (once
    feature 014 ships one), changing it, confirming the value is
    reflected on the next `startMatch`'s `setupData` — the actual
    end-to-end proof this feature was built for.

## Non-goals

- Nested/object-typed or array-typed schema properties — only flat
  `string` (with or without `enum`), `boolean`, and `number` properties at
  the schema's top level are supported. No shipped or currently-planned
  game needs more than this (Love Letter's `edition` is a flat string
  enum); revisit only when a real game does.
- Translated (i18next) field labels — a property's own `title` (a plain
  string the game author writes directly into its `settingsSchema`, not an
  i18next key) is used verbatim as its label. Flagged as a known gap, not
  solved here — see plan.md's Open risks.
- Any change to `GameModule.minPlayers`/`maxPlayers` becoming dynamic based
  on a settings value (e.g. Love Letter's Classic edition capping players
  at 4 while Normal allows 6). This feature only renders/persists
  settings values; it does not attempt to make the seat picker or any
  other chrome component reactive to a *specific* settings value's
  meaning — that would require the chrome to understand what a field
  means, which breaks the "no per-game branching in platform code"
  contract this feature exists to uphold. Feature 014's spec.md documents
  how Love Letter copes with this gap instead (server-side validation at
  match start, not a smaller seat picker).
- A settings form that live-validates against boardgame.io's actual
  `setup` function (e.g. catching a `setupDataError` boardgame.io itself
  might raise) — only schema-shape validation is covered; a schema-valid
  but semantically-nonsensical combination of settings is still caught
  only at `startMatch` time, same as today.
