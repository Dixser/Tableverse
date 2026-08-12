# Feature 038 — How long the cell holds you: tasks

- [x] 1. `spec.md` / `plan.md` — why this is a dial rather than a rule change,
      and the hedge that the shorter sentence creates.

- [x] 2. **Setting.** `ArrestScope` / `ARREST_SCOPE_OPTIONS`, the field, the
      default `'day'`, the clamp branch, the schema property.
      **Verify:** AC1, AC2 — 1 clamp test, plus the running app.

- [x] 3. **Release at the venue boundary.** `startPhase` branch and the
      `released` log line; `log.arrested` reworded to stop claiming "day over".
      **Verify:** AC3–AC5 — 3 tests, AC5's confirmed to fail when flipped.

- [x] 4. **How-to-play, both languages.** §9 gains the host option and the
      note that a released player does face the limit check.

- [x] 5. **Checked in the running app.** Form renders the new `<select>`
      `[phase|day]` defaulting to `day`; save POSTs 200; the shared validator
      rejects an out-of-enum value and the clamp falls it back.

- [x] 6. **Full suite.** `npm run test:unit` 1099 passed, `npm run typecheck`
      clean, `npm run lint` unchanged from `main`.
