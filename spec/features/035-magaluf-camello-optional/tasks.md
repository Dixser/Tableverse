# Feature 035 — The Camello asks first: tasks

- [x] 1. `spec.md` / `plan.md` — the playtest sequence that prompted it, the
      change, and the two things deliberately left alone (the police numbers,
      choosing which item).

- [x] 2. **Card data.** `pillarPorro` / `pillarPastis` / `pillarFarlopa` /
      `dejarlo` on `EventOptionId`; the three `camello*` cards gain their two
      branches. Deck counts untouched.
      **Verify:** AC1, AC2 — 2 tests in *event cards with options*.

- [x] 3. **The playtest sequence as a test.** Deal a Porro, answer, let the
      next seat draw the Redada; arrested when accepted, partying when
      declined.
      **Verify:** AC3.

- [x] 4. **Strings.** Four `eventOption` keys in `en` and `es`; the three
      Camello card descriptions reworded into an offer. Fixture keys for the
      board assertion.
      **Verify:** AC4 — `i18nKeys.test.ts` (derived from the card data) plus
      1 board test.

- [x] 5. **How-to-play, both languages.** Camello listed among the cards that
      ask a question; §9 states that contraband is only ever chosen.

- [x] 6. **Full suite.** `npm run test:unit` 1087 passed, `npm run typecheck`
      clean, `npm run lint` unchanged from `main` (3 pre-existing errors, all
      in `prototypes/` and `packages/server`).
