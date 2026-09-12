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
| `settings.ts` | `maxDrinksOverride` field on `MagalufSettings`, a `RANGES` entry `{ min: -1, max: 20, fallback: -1 }`, the default (`-1`), the clamp line (reuses `clampNumber` as-is — no special-casing needed since `-1` is just the low end of the range), the schema property. |
| `state.ts` | `phaseRules(G)` returns `{ ...rules, maxDrinks: override === 0 ? Infinity : override }` when `override >= 0`, else the tuned rules unchanged. |
| `PhaseHeader.tsx` | Takes a `rules: PhaseRules` prop instead of importing `PHASE_RULES` and indexing it directly; renders `∞` when `rules.maxDrinks` is not finite. |
| `BoardComponent.tsx` | Passes `rules={phaseRules(G)}` to `PhaseHeader` (import `phaseRules` from `./state.js`). |
| `docs/magaluf/how-to-play.{en,es}.md` | §5 gains a host-override paragraph, same placement as §9's `arrestLasts` note. |

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

## Tests

`gameDef.test.ts` → *the drink cap override (host setting)*, a new block
near the existing *how long the cell holds you (host setting)* block for
`arrestLasts`:

| Test | Covers |
|---|---|
| behaves exactly like the shipped caps at the default | AC3 |
| never auto-withdraws for reaching a drink count when set to unlimited | AC4 |
| enforces the override as every phase's cap when set to a positive number | AC5 |

Plus one in *settings clamping* for AC2 (out-of-range and non-numeric
input both clamp/fall back correctly, `-1` round-trips as itself rather
than being treated as an invalid value).

AC4's test plays a seat well past the old Tardeo cap of 4 and asserts it is
still `partying` — the only way that test can fail is if the cap is still
being enforced, so it is confirmed to fail against the current `main`
before the fix, not just agreeing with the engine by construction.

## Verification

Checked in the running app: the settings form shows the new number field
defaulting to `-1`; setting it to `0` and starting a match shows `∞` in the
phase chip; drinking well past 4 in the Tardeo with that setting never ends
the phase. Setting it to a positive number (e.g. `2`) shows `2` as the cap
and triggers closing time at 2 drinks in every phase, including phases
whose tuned cap is 5.
