# Feature 043 — El Duelo: tasks

- [x] 1. `spec.md` / `plan.md` — the card, the pot, why the exchange needs its
      own phase, and the ten decisions settled with the author.

- [x] 2. **The card.** `dueloTardeo` / `dueloNoche` / `dueloAfter` with `vp` as
      the rate; `retar` and the `duels` flag; `dejarlo` reused from the Camello.
      `duelPot` in `events.ts` so engine and board price the pot the same way.
      **Verify:** AC2, AC6.

- [x] 3. **Deck trades.** Duelo 1 / 2 / 2, paid for out of Chupito de la casa,
      the Noche's Garrafón and the After's Ronda. Totals unchanged.
      **Verify:** AC12.

- [x] 4. **State.** `PendingDuel` and `G.pendingDuel`, cleared at every venue
      open.

- [x] 5. **Engine.** The fewer-than-two check at reveal; `canAct` gate;
      `chooseEventOption` parks the duel; `chooseDuelTarget` in `party`; the
      `duel` phase with `duelDrink` / `duelFold`; `settleDuel`; the cap sweep
      out of `finishTurn` into `sendHomeAtCap`, ordered by `overCap`.
      **Verify:** AC1, AC3–AC11 — 17 tests.

- [x] 6. **Board.** `DuelPanel` for both steps, outranking the choice panel and
      the action bar; buttons only for the seat owed them.
      **Verify:** 5 tests.

- [x] 7. **Content.** Three cards, one option, four log lines, eight board
      strings in `es` and `en`, inserted by a one-shot script that refused to
      write a file that did not round-trip byte-for-byte. Fixture keys; the art
      README's highest-count line.
      **Verify:** AC13 — `i18nKeys.test.ts`.

- [x] 8. **Drivers.** `play`, `playToGate` and the i18n sweep answer an open
      duel, for the reason each already answers a choice card.

- [x] 9. **Mutation testing.** Fifteen mutations, fifteen caught. Writing the
      list exposed a missing test — a duelist already at the cap when the duel
      opens — which was added first.

- [x] 10. **Checked in the running app.** Two players, a Duelo al amanecer in
      Friday's After: pick, drink and fold by real clicks; the pot read 3 → 6 →
      paid 6, and the result stayed pinned under the card.

- [x] 11. **Full suite.** `npm run test:unit` 885 in `game-core` (863 before),
      259 client, 24 shared; `typecheck` clean; `lint` one warning, pre-existing
      on `main` in a file this feature does not touch.
