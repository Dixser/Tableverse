# Feature 044 — Turning off closing time: tasks

- [x] 1. `spec.md` / `plan.md` — why `-1` is the "off" sentinel rather than
      `0`, and what the override deliberately leaves untouched (min drinks,
      penalty, Cierrabares bonus).

- [x] 2. **Setting.** `maxDrinksOverride` field, `RANGES` entry, the default
      (`-1`), the schema property. **Verify:** AC1, AC2 — clamp tests, plus
      the running app.

- [x] 3. **The seam.** `phaseRules(G)` in `state.ts` applies the override.
      **Verify:** AC3–AC5 — 3 tests, AC4's confirmed to fail against the
      unmodified engine first.

- [x] 4. **Phase header.** `PhaseHeader.tsx` takes `rules` as a prop instead
      of reading `PHASE_RULES` itself; renders `∞` for a non-finite cap.
      `BoardComponent.tsx` passes `phaseRules(G)`. **Verify:** AC6 in the
      running app.

- [x] 5. **How-to-play, both languages.** §5 gains the host option.

- [x] 6. **Checked in the running app.** Form renders the new number field
      defaulting to `-1`, with the full title including the -1/0/N
      explanation. Set to `0` and saved without error; starting a match
      showed `Tardeo (2–∞ copas)` in the phase chip — confirming both the
      persisted setting and the header's non-finite display. The "drinking
      past 4 never ends the phase" behavior itself is covered by the AC4
      unit test rather than re-driven by hand here, since the debug harness
      in this single browser tab can only dispatch moves as one seat at a
      time and re-proving the identical engine path adds no information
      the test doesn't already give.

- [x] 7. **Full suite.** `npm run test:unit` (game-core magaluf: 5 files,
      240 tests, all passing), `npm run typecheck` clean across all
      workspaces, `npm run lint` — identical 14 pre-existing problems as
      unmodified `main`, none new.
