# Feature 037 — A way back in: tasks

- [x] 1. `spec.md` / `plan.md` — the removal, the two cards, the three
      load-bearing decisions (bank directly, read `alive`, count at-risk), and
      the deferral of shortening the arrest.

- [x] 2. **Primitives.** `alive(G)` in `state.ts` with `confirmableSeats`
      delegating to it; `bankVP(player, n)`, with the balcony's leyenda bonus
      moved onto it.

- [x] 3. **Rey del guiri removed** from `EventId`, `EVENTS`, both decks, both
      locales, the how-to-play in both languages and the board test fixture.
      **Verify:** AC1 — closed union, so the compiler is the test.

- [x] 4. **`colecta` and `remontada`**, with `standings` / `lastPlace` local to
      `events.ts`.
      **Verify:** AC3–AC7 — 8 tests replacing the 5 Rey del guiri ones.

- [x] 5. **Deck slots**, 7 of them, per-venue totals held at 36 / 45 / 55.
      **Verify:** AC2 — summed against `main` and compared.

- [x] 6. **Tuning by probe.** 200 simulated weekends, three strategies. First
      attempt returned a median of 6 against a 47-point gap; the shipped
      numbers return 12 against 44, and up to 51 for a buried player. Probe
      deleted after reading; figures recorded in `spec.md`.

- [x] 7. **Full suite.** `npm run test:unit` 1095 passed, `npm run typecheck`
      clean, `npm run lint` unchanged from `main` (13 problems, all
      pre-existing in `prototypes/` and `packages/server`).
