# Feature 044 — Turning off closing time: plan

## Shape of the change

A settings number plus one seam. Every cap check in `gameDef.ts` already
reads `phaseRules(G).maxDrinks` rather than `PHASE_RULES` directly, so
teaching `phaseRules` about the override is the whole of the engine change.
No client work beyond routing the phase header through that same helper
instead of its own direct `PHASE_RULES` lookup.

## Files

| File | Change |
|---|---|
| `settings.ts` | `maxDrinksOverride` field on `MagalufSettings`, a `RANGES` entry `{ min: -1, max: 20, fallback: 0 }` (`fallback` doubles as the default, per the revision), the clamp line (reuses `clampNumber` as-is — no special-casing needed since `-1` is just the low end of the range), the schema property. |
| `state.ts` | `phaseRules(G)` returns `{ ...rules, maxDrinks: override === 0 ? Infinity : override }` when `override >= 0`, else the tuned rules unchanged. |
| `PhaseHeader.tsx` | Takes a `rules: PhaseRules` prop instead of importing `PHASE_RULES` and indexing it directly; renders `∞` when `rules.maxDrinks` is not finite. |
| `BoardComponent.tsx` | Passes `rules={phaseRules(G)}` to `PhaseHeader` (import `phaseRules` from `./state.js`). |
| `docs/magaluf/how-to-play.{en,es}.md` | §5 gains a host-override paragraph, same placement as §9's `arrestLasts` note. |
| `gameDef.test.ts` | `makeClient`'s own `setup` pins `G.settings.maxDrinksOverride = -1` before running the caller's `overrides` — see "The revision's ripple" below. |

No locale file changes: the phase chip's existing i18n key
(`magaluf.board.phaseDrinks`, `"{{min}}–{{max}} drinks"`) already
interpolates whatever is passed for `max` — passing the string `'∞'` there
needs no new key, in either language.

## Why `-1` and not `undefined`/`null` for "no override"

Every other field in `MagalufSettings` is required and always has a
concrete value (`DEFAULT_SETTINGS` has no optional fields), and
`clampSettings` always returns a complete object. Introducing an optional
field here would be the only one in the file and would need its own
special-cased branch in the clamp function; a plain number with a reserved
out-of-band value re-uses `clampNumber` exactly as the four existing
numeric fields do — no special-casing at all.

## The revision's ripple

Flipping the shipped default from `-1` to `0` meant every pre-existing test
that assumed the tuned 4/5/4 cap was reachable would otherwise break —
not just fail an assertion, but hang: several drive the table with
`alwaysDrink` for every seat and rely on somebody eventually hitting
closing time to end a phase at all, so with no cap in effect `play()`'s
6000-iteration guard would trip instead of the phase ever advancing (the
duel's whole "over cap" bookkeeping is in the same boat).

Rather than hunting down and patching each affected test individually —
easy to miss one — `makeClient` itself now pins `maxDrinksOverride: -1`
before running the caller's own `overrides`, so every test written before
the revision keeps exercising the shipped rule it always meant to, without
being touched. A test that cares about this setting specifically — the new
block below — sets its own value in `overrides`, which runs after the
pin and wins.

One consequence: a test asserting the *real* production default has to
bypass `makeClient` and call `magalufGameDef.setup()` directly (the same
pattern the existing `settings clamping` block already uses for
`setupData`), since `makeClient`'s convenience pin would otherwise mask it.

## Tests

`gameDef.test.ts` → *the max drinks override (host setting)*, a new block
near the existing *how long the cell holds you (host setting)* block for
`arrestLasts`:

| Test | Covers |
|---|---|
| ships with the override at 0 (unlimited), for the ongoing playtest | the real default, via `setup()` directly |
| never triggers closing time at the default of 0 | AC4 |
| brings the shipped 4/5/4 caps back when set to -1 | AC3 |
| enforces the override as every phase's cap when set to a positive number | AC5 |

Plus one in *settings clamping* for AC2 (out-of-range and non-numeric input
both clamp/fall back correctly — the fallback is now `0`, and `-1` still
round-trips as itself rather than being treated as an invalid value).

The "never triggers closing time" test plays a seat well past the old
Tardeo cap of 4 and asserts it is still `partying` — the only way that
test can fail is if the cap is still being enforced, so it is confirmed to
fail against the pre-override engine, not just agreeing with it by
construction.

## Verification

Checked in the running app: the settings form shows the new number field
defaulting to `0`; starting a match at that default shows `∞` in the phase
chip and drinking well past 4 in the Tardeo never ends the phase. Setting
it to `-1` and starting a match shows the tuned 4/5/4 numbers again.
Setting it to a positive number (e.g. `2`) shows `2` as the cap and
triggers closing time at 2 drinks in every phase, including phases whose
tuned cap is 5.
