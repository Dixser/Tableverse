# Feature 038 — How long the cell holds you: plan

## Shape of the change

A settings enum plus one branch at the venue boundary. No client work: the
platform's `SettingsForm` renders any `enum` property as a `<select>`, which is
already how `limitRevealAt` and `balconyDie` reach the host.

## Files

| File | Change |
|---|---|
| `settings.ts` | `ArrestScope`, `ARREST_SCOPE_OPTIONS`, the field on `MagalufSettings`, the `RANGES` omit list, the default (`'day'`), the clamp branch, the schema property. |
| `gameDef.ts` | `startPhase` releases `'arrested'` seats when the setting says `'phase'`, and logs `released`. |
| locales | `log.released` added; `log.arrested` reworded to stop asserting "day over", which is now only true under one setting. |
| `docs/magaluf/how-to-play.{en,es}.md` | §9 gains the host option and the consequence for the limit check. |

The clamp follows `limitRevealAt` exactly: an unrecognised value is not the
nearest valid one, it is no answer, so it falls back to the default rather than
being coerced.

`'dead'` is untouched by the branch. The concrete is not a setting.

## Tests

`gameDef.test.ts` → *the police* → a new nested block, driven by a helper that
raids the drawer in the Tardeo and then plays on to the Noche:

| Test | Covers |
|---|---|
| keeps them in until morning by default | AC3 |
| lets them out at the next venue when the host asks for it | AC4 |
| puts a released player back under the night's limit check | AC5 |

Plus one in *settings clamping* for AC2.

AC5's test earns its keep only if it can fail, so it was run with the setting
flipped to `'day'` and confirmed to fail there before being restored.

## Verification

This is the one change in the 035–038 run with real UI surface, so it was
checked in the running app (both dev servers were already up) rather than only
in tests. What was confirmed there: the form renders the new field as a
`<select>` of `[phase|day]` defaulting to `day`; saving POSTs and returns 200;
`validateGameSettings` accepts `'phase'` and rejects `'forever'`; `clampSettings`
falls an unrecognised value back to `day`.

Not confirmed in the app: that the saved value survives a reload. The room is
held in app state rather than in the URL, so a reload returns to the lobby and
the room could not be re-entered without its invite code. The persistence path
is the platform's own, shared by every existing setting, and unchanged here.
