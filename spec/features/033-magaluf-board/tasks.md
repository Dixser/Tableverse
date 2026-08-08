# Feature 033 — Magaluf Board: Tasks

- [x] 1. `spec.md` / `plan.md` — the board spec, plus the three amendments to
      feature 032 it needs.

- [x] 2. **Amendment A — `G.lastDraw`.** Set in `takeDrink`, cleared at each
      phase start.
      **Verify:** 3 tests, including that a Ronda's knock-on drinks do not
      steal the reveal from the draw that caused them.

- [x] 3. `useJumpQueue.ts` + tests — the watermark that decides which jump the
      viewer is being shown, starting at `jumps.length` so a reconnecting
      player sees nothing retroactively.
      **Verify:** AC18–AC19, 7 tests, no jsdom.

- [x] 4. **Amendment B — round-confirm gates.** `RoundConfirmG` fields, a
      `pendingAdvance` discriminator, and two boardgame.io phases (`party`,
      `confirm`).
      **Verify:** AC24–AC30, 7 tests.

      **Deviation from feature 032:** its "there is deliberately no
      boardgame.io phase machinery" decision is reversed. Every seat must be
      able to confirm, but this game has a round-robin turn order in which
      only the current seat may move. The Mind avoids the problem by being
      turn-less; Love Letter, which has turn order too, uses a dedicated
      `ActivePlayers.ALL` phase. This follows Love Letter. The stale doc
      comments were corrected rather than left contradicting the code.

      **Second deviation:** `ActivePlayers` had to come from the local
      `vendor.ts` shim, not `boardgame.io/core`. The server is a real Node
      process that imports this file through `gamesCatalog`, and that subpath
      fails under Node ESM resolution. Caught immediately by the conformance
      suite failing to even collect.

- [x] 5. **Platform extension — gameover standings.** Optional `standings` on
      `GameoverResult`; `GameoverBanner` renders a final table when present.
      **Verify:** AC31–AC35, 8 new tests, including the unchanged-when-absent
      case that protects the other six games.

      **Deviation from spec.md's first draft:** the board was going to own a
      `FinalStandings` panel. It does not. Feature 029 set the precedent that
      win/loss presentation belongs to the platform, and doing it generically
      means every game gets it rather than only this one.

- [x] 6. `limitScale.ts` + tests — the meter's domain, derived from the day's
      public limit deck and the public `limitShift`, never from `G.limit`.
      **Verify:** AC12, 7 tests.

- [x] 7. The board: `BoardComponent`, `PhaseHeader`, `DrawnCards`,
      `PlayerPanel`, `IntoxMeter`, `ActionBar`, `BalconyOverlay`, `CardTile`,
      each with a `.module.css`.
      **Verify:** AC1–AC11, AC13–AC17, AC20–AC23; 25 tests.

- [x] 8. `magaluf.board.*` in both locales, `i18nFixture.ts`, and the two
      registration lines (`boards.ts`, `boardRegistry.ts`).
      **Verify:** `localeParity.test.ts` passes.

- [x] 9. **Rewrote a test that passed for the wrong reason.** The AC14 case
      "renders identically whichever limit the day drew" rendered the same
      hidden `G` four times — tautological, since `playerView` replaces every
      value with `HIDDEN_LIMIT` before the board sees it. It now asserts the
      band varies with the day and with nothing else.

- [x] 10. **Played a real match**, three seats claimed solo against the
      running dev servers.

## Verification record

Per package: **game-core 732**, shared 24, **client 249**, integration 75.

Live in the app, at 3 seats:

- The board mounts and the header reads `Viernes / Tardeo / Puntos x1 /
  **Límite: entre 26 y 29**` — the band, with `limit: -1` in `G`.
- A drink revealed `Vermut 2 int 2 PV` plus its `Chiringuito` event.
- A **Vomitona** fired: intoxication dropped 8 → 5 and `Resaca 3` appeared on
  the panel, persisting across the venue change.
- Closing the Tardeo opened the platform's own gate — `Ronda completada /
  0 de 3 confirmados` — and the board correctly went quiet behind it.
- The **After reveal** flipped the header to `Límite 19` and replaced the
  band with a marker.
- One more drink at 22 vs 19 produced `Balcón 46%`, matching
  `poolChance(3)` = 0.70 − 2(0.12).
- The night resolved into the **balcony overlay**: `Dani está 3 por encima
  del límite … 46% … Pierde 44 PV de la noche`, then on the second beat
  `Al cemento. Se acabó el fin de semana de Dani.`

Two things this playthrough found that no test had:

1. **Settings clamping works, visibly.** A `limitShift` of −30 was submitted
   through the real form and came back as a 16–19 band, i.e. clamped to the
   schema minimum of −10. This is the platform's missing range validation
   being caught exactly where `settings.ts` says it must be.
2. **A Spanish copy bug.** The overlay had two buttons reading `Saltar` and
   `Saltar el resto` — *saltar* means both "jump" and "skip", so the dialog
   offered two near-identical labels for opposite actions. The skip is now
   `Omitir el resto`. Only visible by looking at it.

## Not verified live

The gameover standings table. Reaching it needs a full three-day weekend, and
it is covered by 8 tests including the rendered rows. Worth a look during the
first real playtest.
