# Feature 039 — Open the player range: tasks

- [x] 1. `spec.md` / `plan.md` — why the range widens for the playtest without
      the tuning moving, and what a reshuffled deck costs.

- [x] 2. **The range.** `minPlayers: 2` / `maxPlayers: 10` and the rewritten
      rationale; `validateMagalufSetupData`'s floor 3 → 2.
      **Verify:** AC1, AC2 — 1 setup test, plus the running app.

- [x] 3. **The empty-deck rule.** `refill<T>` shared by `drawAlcohol` and
      `drawEvent`, logging which deck and how many cards; the stale comment
      replaced.
      **Verify:** AC4–AC6 — the ten-seat test, including the deck+discard
      conservation invariant checked on every step.

- [x] 4. **Locales.** `log.reshuffledAlcohol` / `log.reshuffledEvent`, en + es.

- [x] 5. **The old AC21 test repointed to 6.** It asserted deck sizing against
      the tuned table, not against `maxPlayers`, and is still true there.

- [x] 6. **Two seats plays a weekend.** No rule in this engine needs a third
      player; this is the test that says so.

- [x] 7. **How-to-play, both languages.** The header line carries the tuned
      range, the playtest range, and what each end costs.

- [x] 8. **Checked in the running app.** Ten seat buttons; a two-seat match
      deals and renders; a ten-seat match lays out ten panels with no
      horizontal overflow at desktop or mobile width.

- [x] 9. **Full suite.** `npm run test:unit` 1101 passed, `npm run typecheck`
      clean, `npm run lint` unchanged from `main`.
