# Feature 034 — Magaluf balance pass: tasks

- [x] 1. `spec.md` / `plan.md` — the four changes, what the playtests found,
      and the two deferrals (cross-seat choices, simulator parity).

- [x] 2. **Flat limit deck.** `LIMIT_DECKS` → `LIMIT_DECK = [16,19,22,25,28]`;
      `startDay`; `limitScale.ts` drops its `day` parameter; `IntoxMeter` and
      `PlayerPanel` drop the prop.
      **Verify:** AC1. `limitScale.test.ts` rewritten (7 tests) and the board's
      band assertion inverted.

- [x] 3. **`addResaca`.** New primitive floored at zero, four `+=` sites
      replaced, `MagalufPlayer.resaca` doc corrected. `ambulancia` 4 → 3.
      **Verify:** AC2, covered by the Resacón branch test.

- [x] 4. **Card data model.** `EventEffects` / `EventOption` / `EventOptionId` /
      `EventCard.options` / `eventOptions`. Three cards reworked in place, five
      added. Deck slots retuned with per-venue totals held constant.

- [x] 5. **`pendingChoice` machinery.** `PendingChoice` in state, the
      `chooseEventOption` move, `settleAfterEvent` extracted from `revealEvent`,
      `canAct` clause, `resolveEvent` guard.
      **Verify:** AC3–AC8, 10 tests.

- [x] 6. **Último en Pie at a round boundary.** `roundAnchor` +
      `lastStandingAwarded`; lap detection in `advanceTurn`;
      `awardLastStanding(G, seatID)`; dropped from `endPhase`.
      **Verify:** AC9, 6 tests including the two negative cases that were the
      whole point (mid-lap, and a table that closes together).

- [x] 7. **i18n.** 5 events, 16 options, 1 log key, 2 board keys × 2 locales;
      fixture keys; `i18nKeys.test.ts` sweeps options and its driver now
      reveals events and answers choices.
      **Verify:** AC10.

- [x] 8. **`EventChoicePanel`** + wiring into `BoardComponent`.
      **Verify:** 5 board tests, including the spectator and waiting states.

- [x] 9. **Balconing test re-tune.** `OptionPolicy` on the `play` harness,
      `duckResaca` for the jump runs, `JUMPABLE_LIMIT` replacing the pinned 0.
      See `plan.md` for why both were needed.

- [x] 10. **Docs.** `how-to-play.{en,es}.md` — the flat deck and why it stopped
      shrinking, Hangover no longer described as permanent, the new Último en
      Pie including the two cases that now pay nobody, and a "cards that ask
      you a question" section listing all eight.

- [x] 11. **Simulator parity.** Flat deck, retuned counts, the eight choice
      cards, the round-start Último en Pie, and a `chooseOption` bot policy that
      prices each branch off the same budget the drinking policy uses.
      **Verify:** 25 prototype tests pass; balance sweep re-run and written up
      as `design.md` §13a.

      Result: **12/15 targets**, down from 14/15. Saturday deaths 11.7% → 10.4%
      (below the band) and early exits 22.6% → 25.8% (above it). An isolating
      run attributes the first to the choice cards — every card that used to
      add intoxication unconditionally now has a branch that does not — and the
      second to the flat deck squeezing phase budgets. Neither is a defect; both
      are the balance question this feature hands back to the table.

- [ ] 12. **Decide whether the mid-weekend needs its teeth back.** If so, the
      lever is the drink caps or `earlyExitPenalty`, not the limit deck —
      16/19/22/25/28 came out of playtests and is the point of the feature.
      Needs a human playtest before any further tuning.
