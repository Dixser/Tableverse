# Feature 013 — Generic Game Settings Form: Implementation Plan

## Validator lives in `game-core`, used by both server and client

`packages/game-core/src/settingsValidation.ts` (exported from `index.ts`
alongside `JSONSchema` itself) — a small hand-written validator scoped
exactly to the subset of JSON Schema `JSONSchema` (in `types.ts`) already
declares (`type`, `properties`, `required`, `enum`, `default`), not a
dependency on a general-purpose library like `ajv`. Two reasons this is
the right call, not just the cheaper one:

- The schema type itself is already a deliberately narrow subset (no
  `oneOf`, no nested `$ref`, no numeric ranges) — validating against a
  narrow schema doesn't need a general validator.
- Both `packages/server` (validate before persisting) and
  `packages/client` (validate before submitting, for immediate inline
  feedback per spec.md AC10) need the *exact same* pass/fail logic against
  the *exact same* schema shape. Sharing one function from `game-core` (a
  dependency of both already) guarantees they can never drift out of sync
  the way two independently-written validators could.

```ts
export interface SettingsValidationError {
  field: string;
  message: string;
}

export function validateGameSettings(
  schema: JSONSchema,
  value: Record<string, unknown>,
): SettingsValidationError[] {
  const errors: SettingsValidationError[] = [];
  const properties = schema.properties ?? {};
  for (const key of Object.keys(value)) {
    if (!(key in properties)) {
      errors.push({ field: key, message: `Unknown field "${key}"` });
    }
  }
  for (const requiredField of schema.required ?? []) {
    if (!(requiredField in value)) {
      errors.push({ field: requiredField, message: `"${requiredField}" is required` });
    }
  }
  for (const [key, propSchema] of Object.entries(properties)) {
    if (!(key in value)) continue;
    const v = value[key];
    if (propSchema.type === 'boolean' && typeof v !== 'boolean') {
      errors.push({ field: key, message: `"${key}" must be a boolean` });
    } else if (propSchema.type === 'number' && typeof v !== 'number') {
      errors.push({ field: key, message: `"${key}" must be a number` });
    } else if (propSchema.type === 'string' && typeof v !== 'string') {
      errors.push({ field: key, message: `"${key}" must be a string` });
    } else if (propSchema.enum && !propSchema.enum.includes(v)) {
      errors.push({ field: key, message: `"${key}" must be one of ${JSON.stringify(propSchema.enum)}` });
    }
  }
  return errors;
}
```

Covers spec.md AC1-4 directly: unknown-key rejection, required-field
check, per-type check, enum check.

## Server: `RoomService.setGameSettings` + route wiring

`RoomService` gains one method, structurally identical to `changeGame`'s
lobby-only guard:

```ts
async setGameSettings(
  roomID: string,
  gameSettings: Record<string, unknown>,
): Promise<Room> {
  const room = await this.mustGetRoom(roomID);
  if (room.status !== 'lobby') {
    throw new RoomServiceError(`Cannot edit game settings while room ${roomID} is ${room.status}`);
  }
  if (!room.selectedGameID) {
    throw new RoomServiceError(`Room ${roomID} has no selected game`);
  }
  const gameModule = this.getGameModule(room.selectedGameID);
  if (!gameModule) {
    throw new RoomServiceError(`Unknown game ${room.selectedGameID} for room ${roomID}`);
  }
  const errors = validateGameSettings(gameModule.settingsSchema ?? { type: 'object' }, gameSettings);
  if (errors.length > 0) {
    throw new RoomServiceError(
      `Invalid game settings: ${errors.map((e) => e.message).join('; ')}`,
    );
  }
  await this.rooms.update(roomID, { gameSettings });
  return { ...room, gameSettings };
}
```

A `GameModule` with no `settingsSchema` validates against `{ type:
'object' }` (no declared `properties`/`required`) — any submitted key is
"unknown" and rejected, which is correct: a game with no schema accepts no
settings at all.

`roomRoutes.ts`'s existing `POST /:roomID/settings` handler gains a second
optional body field, applied independently of `allowMultiSeat` (spec.md
AC7 — the existing shape keeps working unchanged):

```ts
router.post('/:roomID/settings', async (ctx) => {
  const room = await authorize(ctx, deps, param(ctx, 'roomID'), 'editRoomSettings');
  if (!room) return;
  const { allowMultiSeat, gameSettings } = getBody<{
    allowMultiSeat?: boolean;
    gameSettings?: Record<string, unknown>;
  }>(ctx);
  let updated = room;
  if (typeof allowMultiSeat === 'boolean') {
    updated = await deps.roomService.setAllowMultiSeat(room.roomID, allowMultiSeat);
  }
  if (gameSettings !== undefined) {
    try {
      updated = await deps.roomService.setGameSettings(room.roomID, gameSettings);
    } catch (err) {
      ctx.status = 400;
      ctx.body = { error: (err as RoomServiceError).message };
      return;
    }
  }
  ctx.body = { room: updated };
});
```

`roomApi.ts` (client) gains a `gameSettings` parameter on its existing
settings-update call, mirroring `allowMultiSeat`'s existing shape.

## Client: `SettingsForm` component

`packages/client/src/room/SettingsForm.tsx` — pure function of
`(schema, value, onChange)`, no fetch/API call inside it (`RoomShell` owns
the actual `roomApi` call, same division of responsibility every other
`RoomShell` control already follows):

```ts
export interface SettingsFormProps {
  schema: JSONSchema;
  value: Record<string, unknown>;
  onSubmit: (next: Record<string, unknown>) => void;
  disabled?: boolean;
}
```

Renders one control per `Object.entries(schema.properties ?? {})`, in
declaration order (spec.md AC8):

- `enum` present → `<select>`, options = `enum` values, labeled by the
  value itself (no separate label-vs-value mapping — out of scope, same
  "flat, minimal" cap as the rest of this feature).
- `type: 'boolean'` → checkbox.
- `type: 'number'` → `<input type="number">`.
- anything else (`type: 'string'`, no `enum`) → `<input type="text">`.

Each field's own label: `propSchema.title` (a plain string a game author
may set directly on the schema's per-key index-signature escape hatch, see
`JSONSchema`'s `[key: string]: unknown`) if present, else the property key
itself, verbatim, **not** run through `t()` (spec.md's explicit non-goal —
flagged again in Open risks below).

Initial per-field value: `value[key] ?? propSchema.default ?? ''`
(spec.md AC8's "pre-selected to current value, or schema default").

On submit: runs `validateGameSettings(schema, draftValue)` locally first;
non-empty errors render inline next to the offending field and the submit
handler is never called (spec.md AC10); only a schema-valid draft reaches
`onSubmit`.

`RoomShell.tsx` renders it conditionally, mirroring the existing
`canEditSettings && room.status === 'lobby'` guard already used for the
`allowMultiSeat` checkbox, and **only when `selectedModule?.settingsSchema`
is present** (spec.md AC9 — absent schema renders nothing, not an empty
section):

```tsx
{canEditSettings && room.status === 'lobby' && selectedModule?.settingsSchema && (
  <SettingsForm
    schema={selectedModule.settingsSchema}
    value={room.gameSettings}
    onSubmit={(next) => void updateGameSettings(next)}
  />
)}
```

`updateGameSettings`, a new `useCallback` in `RoomShell` alongside its
existing `setAllowMultiSeat`/`changeGame`/etc. callbacks, calling the
extended `roomApi` settings endpoint and surfacing `actionError` on
failure — same pattern as every other action in that file already
follows, no new pattern introduced.

## File layout

```
packages/game-core/src/
  settingsValidation.ts        # + settingsValidation.test.ts
  index.ts                     # + export { validateGameSettings }, export type { SettingsValidationError }

packages/server/src/rooms/
  roomService.ts        # + setGameSettings
  roomService.test.ts    # (or wherever roomService integration tests live) + new cases
  roomRoutes.ts          # + gameSettings handling in POST /:roomID/settings
  roomRoutes.test.ts      # + new integration cases

packages/client/src/
  api/roomApi.ts         # + gameSettings param on the settings-update call
  room/SettingsForm.tsx  # + SettingsForm.module.css + SettingsForm.test.tsx
  room/RoomShell.tsx     # + renders <SettingsForm>, + updateGameSettings callback
  room/RoomShell.test.tsx # + new cases (rendered iff settingsSchema present, submit wiring)
```

## Testing / verification strategy

- `settingsValidation.test.ts` — table-driven, one case per spec.md
  AC1-4 plus a fully-valid pass-through case and the "no schema at all"
  (`{ type: 'object' }`) rejects-any-key case used by `setGameSettings`
  for schema-less games.
- `roomService` integration tests — `setGameSettings` happy path (AC5),
  `in_game` rejection (AC5), invalid-against-schema rejection leaving
  `gameSettings` unchanged (AC6's persistence half).
- `roomRoutes` integration tests — full HTTP round-trip: valid body (200 +
  updated room), invalid body (400, unchanged stored state), non-host
  caller (403/401 per however `authorize` already signals that — matching
  existing route test conventions), and the `allowMultiSeat`-only legacy
  shape still working (AC7).
- `SettingsForm.test.tsx` — renders correct control per property type,
  correct initial value (current vs. default), inline validation-error
  display without calling `onSubmit` (AC10), and a `null`/absent-schema
  render producing empty output (AC9, tested at this component's own
  level in addition to `RoomShell.test.tsx`'s integration-level check of
  the same thing).
- Manual/browser verification (AC11) is deferred to feature 014's own
  manual verification step, once a real `enum`-typed setting
  (`edition`) exists to exercise end-to-end — noted here rather than
  duplicated, since this feature has no real settings-bearing game to
  test against on its own.

## Open risks

1. **Field labels are unlocalized** (`title` used verbatim, not an
   i18next key) — accepted for this feature's scope (spec.md non-goal).
   If a second settings-bearing game ships needing translated labels, the
   fix is additive (e.g. accept either a plain string or an i18next key
   convention like `t:some.key` in `title`) rather than a breaking change
   to this plan's `SettingsForm` contract, but is not built speculatively
   now.
2. **The `minPlayers`/`maxPlayers`-vs-settings mismatch** (a schema value
   like Love Letter's `edition` changing the *effective* player-count
   range without the static `GameModule.maxPlayers` field changing) is
   explicitly not solved here (spec.md non-goal) — feature 014 copes with
   it structurally (validation at match-start time), not through any hook
   this feature adds. Flagged again here since it's the most likely
   reason a future contributor might come looking for a "why doesn't the
   seat picker shrink" answer in this feature's docs.
