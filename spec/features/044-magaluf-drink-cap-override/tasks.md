# Feature 044 — Turning off closing time: tasks

- [x] 1. `spec.md` / `plan.md` — why `-1` is a real, reserved value rather
      than `0`, and what the override deliberately leaves untouched (min
      drinks, penalty, Cierrabares bonus).

- [x] 2. **Setting.** `maxDrinksOverride` field, `RANGES` entry, the default
      (`-1` at first), the schema property. **Verify:** AC1, AC2 — clamp
      tests, plus the running app.

- [x] 3. **The seam.** `phaseRules(G)` in `state.ts` applies the override.
      **Verify:** AC3–AC5 — 3 tests, AC4's confirmed to fail against the
      unmodified engine first.

- [x] 4. **Phase header.** `PhaseHeader.tsx` takes `rules` as a prop instead
      of reading `PHASE_RULES` itself; renders `∞` for a non-finite cap.
      `BoardComponent.tsx` passes `phaseRules(G)`. **Verify:** AC6 in the
      running app.

- [x] 5. **How-to-play, both languages.** §5 gains the host option.

- [x] 6. **Checked in the running app.** Form renders the new number field.
      Set to `0` and saved without error; starting a match showed
      `Tardeo (2–∞ copas)` in the phase chip — confirming both the
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

- [x] 8. **Revision: flip the default to `0`.** Asked immediately after
      shipping task 7: every new room should start unlimited during the
      ongoing playtest, not tuned. `RANGES.maxDrinksOverride.fallback`
      (which doubles as the default) changed from `-1` to `0`; `-1` now
      means "opt back into the shipped 4/5/4" instead of "the default."
      **Ripple:** every pre-existing test that assumed the tuned cap was
      reachable needed it pinned back on — done centrally in
      `makeClient` (`gameDef.test.ts`) and in the `Client({...})` call in
      `i18nKeys.test.ts`, rather than scattered per test. One test
      (`BoardComponent.test.tsx`'s phase-header test) pins it locally
      since it doesn't go through either helper; a new sibling test there
      covers the `∞` rendering at the new default. **Verify:** re-ran the
      full suite (242 tests, was 240 — the two new ones are the real-default
      check and the component-level `∞` test) — one failure surfaced
      first (`BoardComponent.test.tsx`'s tuned-numbers test, now fixed by
      pinning `-1`) and one severe slowdown surfaced (`i18nKeys.test.ts`'s
      full-weekend sweep went from instant to 265s because `alwaysDrink`
      had nothing to stop it — fixed the same way, by pinning `-1` in that
      file's own `Client({...})` setup). Re-ran clean at 3.12s. Typecheck
      and lint re-checked, unchanged. Re-checked in the running app: a
      fresh room now shows `0` as the field's value.
