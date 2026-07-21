# Feature 026 — Generic "Next Level" Rematch Implementation Plan

## Server

`packages/server/src/rooms/roomService.ts`:

- New private `validateAndPersistGameSettings(roomID, gameSettings)`,
  extracted verbatim from `setGameSettings`'s existing validation/persist
  body (no behavior change to `setGameSettings` itself, which now just
  adds its `status !== 'lobby'` guard in front of the shared helper).
- `rematch(roomID, gameSettings?)` — after the existing `endMatch` call
  (if `in_game`), and before `startMatch`, calls
  `validateAndPersistGameSettings` when `gameSettings !== undefined`.

`packages/server/src/rooms/roomRoutes.ts`: `POST /:roomID/rematch` reads
an optional `{ gameSettings }` from the body (koa-bodyparser defaults a
bodyless POST to `{}`, so destructuring is safe) and forwards it to
`roomService.rematch`.

## Client

- `packages/client/src/api/roomApi.ts`: `rematch(sessionToken, roomID,
  gameSettings?)` — always sends a JSON body (`{}` when no override, `{
  gameSettings }` otherwise) so the route's destructure is uniform.
- `packages/game-core/src/nextLevelGameSettings.ts` (new, exported from
  `index.ts` alongside `getEffectiveMaxPlayers`): pure function, no React/
  server dependency — same "generic settingsSchema-driven helper" pattern
  as `getEffectiveMaxPlayers`.
- `packages/client/src/room/RoomShell.tsx`: a new exported
  `isWinGameover(gameover: unknown): boolean` (mirrors
  `GameoverBanner.tsx`'s own `resolveGameoverMessage` read of the same
  `{ winner?, draw? }` shape); `rematch` callback gains an optional
  `gameSettings` param; a `nextLevelGameSettings` value computed via
  `isWinGameover(gameover) && getNextLevelGameSettings(selectedModule
  ?.settingsSchema, room.gameSettings)`; a second button rendered next to
  the existing Rematch button whenever that value is non-null and
  `canRematch` (reusing the same permission check).
- `packages/client/src/room/SettingsForm.tsx`: the enum `<select>`'s
  `onChange` now coerces via `propSchema.type === 'number' ? Number(...) :
  ...` before calling `setField`.

## i18n

`room.nextLevel` added to both `en.json` (`"Next level"`) and `es.json`
(`"Siguiente nivel"`), alongside the existing `room.rematch` key.

## Files touched

```
packages/server/src/rooms/roomService.ts
packages/server/src/rooms/roomRoutes.ts
packages/client/src/api/roomApi.ts
packages/client/src/room/RoomShell.tsx
packages/client/src/room/SettingsForm.tsx
packages/game-core/src/nextLevelGameSettings.ts   (new)
packages/game-core/src/index.ts
packages/client/src/i18n/locales/{en,es}.json
```

Plus test coverage: `roomService.test.ts`/`roomRoutes.test.ts`
(integration), `roomApi.test.ts`, `RoomShell.test.tsx`,
`SettingsForm.test.tsx`, `nextLevelGameSettings.test.ts` (unit).

## Non-goals (implementation-level)

- No changes to `validateGameSettings` itself (feature 013) — `enum`
  already suffices for this feature's need; see spec.md's Non-goals.
