# Feature 013 — Generic Game Settings Form: Tasks

The shared validator first (both server and client depend on it), then
the server-side persistence path, then the client-side form, then chrome
wiring, then verification.

- [ ] 1. `packages/game-core/src/settingsValidation.ts` +
      `settingsValidation.test.ts` — `validateGameSettings` and
      `SettingsValidationError`, per plan.md. Export both from
      `packages/game-core/src/index.ts`.
      **Verify:** spec.md AC1-4 covered by table-driven unit tests,
      including the "no schema at all" (`{ type: 'object' }`)
      any-key-rejected case `setGameSettings` will rely on.
- [ ] 2. `packages/server/src/rooms/roomService.ts` — add
      `setGameSettings(roomID, gameSettings)`, per plan.md (lobby-only
      guard, schema lookup via `getGameModule`, validation, persist).
      **Verify:** integration tests — happy path, `in_game` rejection,
      invalid-input rejection leaving stored `gameSettings` unchanged
      (spec.md AC5).
- [ ] 3. `packages/server/src/rooms/roomRoutes.ts` — extend
      `POST /:roomID/settings` to accept an optional `gameSettings` field
      alongside the existing `allowMultiSeat`, per plan.md's handler.
      **Verify:** route integration tests — valid `gameSettings` (200 +
      updated room), invalid `gameSettings` (400, unchanged stored
      state), non-host caller rejected, and the legacy
      `allowMultiSeat`-only body shape still working unchanged (spec.md
      AC6/AC7).
- [ ] 4. `packages/client/src/api/roomApi.ts` — add a `gameSettings`
      parameter to the existing settings-update call.
      **Verify:** client typechecks.
- [ ] 5. `packages/client/src/room/SettingsForm.tsx` (+
      `.module.css`) + `SettingsForm.test.tsx` — renders one control per
      schema property (`enum` → select, `boolean` → checkbox, `number`/
      `string` → input), initial value from current settings or schema
      `default`, local validation before calling `onSubmit`, per
      plan.md.
      **Verify:** spec.md AC8/AC9/AC10 covered by component tests.
- [ ] 6. `packages/client/src/room/RoomShell.tsx` — render
      `<SettingsForm>` conditionally (`canEditSettings && status ===
      'lobby' && selectedModule?.settingsSchema`), new
      `updateGameSettings` callback wired to the extended `roomApi` call,
      per plan.md.
      **Verify:** `RoomShell.test.tsx` — new cases for "no settingsSchema
      renders nothing" and "submit calls the API with the schema-declared
      fields."
- [ ] 7. Run `test:unit`/`typecheck` across every workspace. Full
      end-to-end verification (spec.md AC11 — a real `enum`-typed
      setting reflected in a match's `setupData`) is deferred to feature
      014's own manual verification step, since this feature has no
      real settings-bearing game to test against on its own — note this
      explicitly when this feature is reviewed for merge, not treated as
      a gap.
