# Feature 044 — Magaluf: turning off closing time

## Description

One new room setting on `magaluf-v1`: `maxDrinksOverride`, a number that
replaces the tuned "closing time" cap (4 / 5 / 4 across Tardeo / Noche /
After) with a single value applied to every phase.

This is a playtesting dial, not a rule change. The tuned caps stay the
default for every existing and new room; a host opts in per match to widen
or remove them while the table is trying to see the rest of the deck.

- `0` — **unlimited**. Nobody is ever auto-withdrawn for reaching a drink
  count; the venue only ends when everyone still partying has left by their
  own choice (or died). Requested explicitly, in these words: "there should
  be an option in the room menu to configure the limit (0 for limitless)".
- A positive integer `N` — every phase's cap becomes `N`, replacing 4 / 5 / 4
  uniformly.
- The default, `-1`, means "no override" — the tuned per-phase caps apply
  exactly as shipped. `-1` rather than `0` because `0` was spoken for: the
  request was explicit that `0` means limitless, so "off" needed a value of
  its own rather than overloading `0` with two meanings.

## What does not change

`minDrinks`, the party pooper penalty, and the Cierrabares bonus stay at
their tuned per-phase values regardless of the override — only the maximum
that triggers closing time moves. Withdrawing under the minimum still costs
the penalty even in an unlimited match; a host wanting a real do-anything
sandbox can still choose to withdraw anyone under it.

At `0`, Cierrabares still resolves on whoever drank strictly the most when
the venue finally empties by choice — it never had a dependency on the cap
being finite, only on the phase ending.

## The change

`MagalufSettings` gains `maxDrinksOverride: number`. `phaseRules(G)`
(`state.ts`) is the single seam every cap check already goes through
(`sendHomeAtCap`, `settleAfterEvent`, `chooseDuelTarget`, `duelDrink`,
`settleDuel` in `gameDef.ts`); it now returns the tuned `PhaseRules` with
`maxDrinks` replaced when the setting is active. `0` maps to `Infinity`,
which every existing `drinksThisPhase >= maxDrinks` comparison already
handles correctly (always false) with no other call site touching the
value.

No client work beyond the phase header. `SettingsForm` already renders any
schema property with no `enum` as a plain number input, which is how
`limitMin` / `limitMax` reach the host. The phase header currently reads
`PHASE_RULES` directly rather than going through `phaseRules(G)` — the one
place in the client that was not already routed through the settings-aware
helper — so it is switched over, and shows `∞` in place of the number when
the effective cap is not finite.

## Non-goals

- **Per-phase overrides.** One dial for all three phases, matching how the
  request was phrased ("configure the limit", singular) and simplest for a
  table hunting for a workable value during testing. Not the finer-grained
  three-dial version considered and set aside.
- **Changing the default.** The tuned caps ship unchanged; this is opt-in
  per match.
- **Touching `minDrinks` or the Cierrabares/penalty numbers.** Only the
  upper cap moves.
- **Translating the settings form.** Same non-goal as every prior settings
  feature (035, 038): titles are raw English, `SettingsForm` is not
  localised for any game yet.

## Acceptance criteria

- AC1 — `maxDrinksOverride` appears in the room settings form as a number
  input, defaulting to `-1`.
- AC2 — A non-numeric or out-of-range value clamps into `[-1, 20]` in
  `clampSettings`, same as every other numeric dial in this file.
- AC3 — At the default (`-1`), phase caps behave exactly as before: 4 / 5 /
  4, unchanged from every existing test.
- AC4 — At `0`, a player can keep drinking past every tuned cap without
  being auto-withdrawn; the phase only ends when everyone still partying
  leaves by choice.
- AC5 — At a positive `N`, all three phases enforce `N` as the cap instead
  of 4 / 5 / 4.
- AC6 — The phase header shows `∞` instead of a number when the effective
  cap for the current phase is not finite.

## Verification

AC2–AC5 are unit tests in `gameDef.test.ts`. AC4 in particular needs a test
that plays well past the old cap (4+ drinks in the Tardeo) and asserts the
seat is still `partying` — proving the absence of a cap, not just agreeing
with the engine.

AC1 and AC6 were checked in the running app: the settings form renders the
new number field defaulting to `-1`; setting it to `0` and starting a match
shows `∞` in the phase chip instead of a number, and drinking well past 4 in
the Tardeo never ends the phase for that seat.
