# Feature 036 — The crown goes to the drunkest: tasks

- [x] 1. `spec.md` / `plan.md` — why the drink count was a seat-order lottery,
      the change, and what is deliberately left alone (the Ambulancia's
      tiebreak, `barraLibre`, the +3).

- [x] 2. **`rankSeats` narrows.** Optional `seats` argument defaulting to
      `G.activeSeatIDs`, so a card can rank the venue rather than the match.

- [x] 3. **`reyGuiri` ranks intoxication over the partying seats.** Ties still
      pay everyone at the top; the `most > 0` guard stays.
      **Verify:** AC1–AC4 — 5 tests in *worked-out event results*, two of them
      rewrites of tests that asserted the old positional payout.

- [x] 4. **Strings.** Card text, `reyGuiriResult`, `reyGuiriRanking` and
      `reyGuiriNobody` in `en` and `es`.

- [x] 5. **How-to-play, both languages.** §10 gains the card, called out as
      the one place intoxication pays.

- [x] 6. **Full suite.** `npm run test:unit` 1090 passed, `npm run typecheck`
      clean, `npm run lint` unchanged from `main`.

- [x] 7. **Addendum, separate commit: Karaoke's tie.** Doubles on equal-highest
      intoxication among partying seats instead of asking `drunkestSeat` for
      one name, plus the `most > 0` guard. `drunkestSeat` stays for the
      Ambulancia.
      **Verify:** AC5 — 2 tests. Suite 1092 passed.
