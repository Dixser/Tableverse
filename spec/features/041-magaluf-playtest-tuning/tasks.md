# Feature 041 — The playtest tuning pass: tasks

- [x] 1. `spec.md` / `plan.md` — the five changes, why they are one pass, and
      the hole item 1 opens that item 4 is there to fill.

- [x] 2. **Flat weekend.** `DAY_VP_MULTIPLIER → [1,1,1]`; the settings dials
      and their ranges left alone so the old weekend stays reachable. The
      `LIMIT_DECK` rationale and the `COMEBACK` probe figures rewritten —
      both asserted an escalation that no longer exists.
      **Verify:** AC1, AC2 — 3 tests.

- [x] 3. **The natural max clears.** `survivesRoll` takes `faces`;
      `poolChance` floors at `1/faces`. Header comment and `BALCONY_DICE`
      lethality figures rewritten.
      **Verify:** AC3 — 2 tests.

- [x] 4. **The limit band.** `limitShift` removed; `limitMin`/`limitMax` in at
      5–40, defaulting to today's 16–28, with the file's first cross-field
      clamp. `buildLimitDeck` fills every integer; `limitScale` takes a band;
      the prop rethreaded through four components.
      **Verify:** AC4, AC5 — 3 tests plus `limitScale.test.ts` rewritten.

- [x] 5. **Cierrabares.** `awardCierrabares` at `endPhase`, before the branch
      so the After is covered. Lap detection, `roundAnchor` and
      `lastStandingAwarded` deleted. `Cierrabares` record added for the board.
      **Verify:** AC6 — 6 tests.

- [x] 6. **The drink-count reset bug.** Moved above the `continue` in
      `startPhase` so arrested and dead seats are zeroed too. Exposed by
      task 5, not caused by it.
      **Verify:** AC7 — 1 test.

- [x] 7. **The banner.** `CierrabaresBanner`, mounted off `G.cierrabares`,
      which is non-null only between closing time and the next venue opening —
      so it needs no lifetime logic and survives behind the After's balcony.
      **Verify:** AC8 — 2 tests in `BoardComponent.test.tsx`.

- [x] 8. **The Cacheo as a rate.** `countContraband`; counted before
      confiscation; the `searched` log line reports the count and the total,
      without which the change is invisible at the table.
      **Verify:** AC9 — 4 tests.

- [x] 9. **Three existing tests rewritten**, each because it asserted
      something now false: the all-dead test's one-faced die (which now
      *always* survives), the "unsurvivable at `d ≥ N`" test, and the opener
      test that read across midnight. Plus `drawEventCard` pinning its drawer,
      so the event tests stop depending on the shuffle leaving seat 0 to open.

- [x] 10. **How-to-play, both languages.** §3 the band and its host setting,
      §5 the Cierrabares rules and the new bonus column, §7 face-value banking
      and the natural max, §9 the per-item search, §10 queue-jump, and the
      comprehension question that asked about a rule that no longer exists.

- [x] 11. **Mutation testing.** Eight rules reverted one at a time; eight
      caught. Seven on the first run — the flat multiplier was unasserted
      because its test measured Friday, which was ×1 under the old rule too.
      Rewritten to measure Saturday against Friday.

- [x] 12. **Full suite.** `npm run test:unit` 851 passed in `game-core`
      (836 before), 259 in `client`, 24 in `shared`; `npm run typecheck`
      clean; `npm run lint` unchanged from `main` — 13 problems, all
      pre-existing in `prototypes/`.

- [x] 13. **The log stopped spoiling the balcony.** Reported from play against
      this branch. `jump()` no longer narrates; `logJump` writes from the
      `JumpRecord` and `leaveBalcony` calls it for everything it steps past —
      the one path the ordinary walk and the host's skip both take, so
      exactly-once needs no flag. Moves the death sting to the same beat.
      **Verify:** AC10, AC11 — 3 tests, all three confirmed to fail when the
      narration is put back at roll time.

- [x] 14. **The overlay's target line**, left behind by task 3. It read
      "you need more than 49" beside a 17% badge — the pre-041 rule printed
      next to the post-041 odds. `balconyTargetMax` states the top face once
      `d >= die`.
      **Verify:** AC12 — 3 tests, including the boundary at `d === die`.

- [x] 15. **Checked in the running app.** Settings form and the cross-field
      clamp end to end; the Cierrabares banner and its tie case; the 17% floor
      on the risk badge; and the balcony walked one jump at a time with the
      feed staying silent through reveal and catching up only on continue.
