# Feature 041 — The playtest tuning pass: plan

## Shape of the change

Four rules edits and one deletion, in one pass because they interact — and
because splitting them would mean re-writing the same comments in `constants.ts`
twice. The largest piece by line count is Cierrabares, and most of that is
removal: the mid-phase lap machinery it replaces was the subtlest code in
`gameDef.ts`.

One new component (`CierrabaresBanner`), two new settings fields replacing one,
and no new platform surface.

## Files

| File | Change |
|---|---|
| `constants.ts` | `DAY_VP_MULTIPLIER → [1,1,1]`; `LIMIT_DECK` replaced by `DEFAULT_LIMIT_MIN/MAX` + `LIMIT_BOUNDS`; `PhaseRules.lastStandingBonus → cierrabaresBonus` (3/6/9). Rewritten comments on the limit band, `BALCONY_DICE` and `COMEBACK`. |
| `balconing.ts` | `survivesRoll` takes `faces` and clears on the top one; `poolChance` floors at `1/faces`. Header comment rewritten — the `(N−d)/N` identity is deliberately broken. |
| `settings.ts` | `limitShift` out; `limitMin`/`limitMax` in, with the file's first cross-field clamp. Two schema properties replace one. |
| `limitScale.ts` | `limitRange` takes settings; `meterMax`/`meterPercent` take a band; new `buildLimitDeck`. The clamp-at-zero hack goes — the bounds start at 5. |
| `gameDef.ts` | The limit is drawn from the band. `awardLastStanding` → `awardCierrabares`, moved to `endPhase`. Lap detection, `roundAnchor` and `lastStandingAwarded` deleted. The drink-count reset moves above the `continue`. |
| `state.ts` | `Cierrabares` record replaces the two lap fields; new `countContraband`. |
| `events.ts` | The Cacheo counts before it confiscates and charges per item. |
| `CierrabaresBanner.tsx` + `.module.css` | New. |
| `BoardComponent` / `PhaseHeader` / `IntoxMeter` / `PlayerPanel` | `limitShift: number` prop → `band: LimitBand`; the banner is mounted. |
| locales, `i18nFixture.ts` | `ultimoEnPie` → `cierrabares` + `cierrabaresNobody`; `searched` gains the count and total; board strings for the banner. |
| `docs/magaluf/how-to-play.{en,es}.md` | §3, §5, §7, §9, §10 and one comprehension question. |

## Where Cierrabares is settled

`endPhase`, before its branch. This matters: the Tardeo and Noche fall into a
round-confirm wait, but the After goes straight to `resolveNight` and the
balcony. Awarding before the branch is the only point that covers all three.

The drink counts are intact there — they are cleared by the *next* `startPhase`,
never by the one that is ending. That same clearing is where the bug was: it sat
below a `continue` that skipped every seat which was not `partying`, so a seat
arrested in one venue carried its count into the next. Harmless while the bonus
was a lap rule; a free win once it became a drink count.

`G.cierrabares` is set at closing time and nulled when the next venue opens,
which is exactly the window the board wants to render in — including behind the
After's balcony, which is why the banner needs no lifetime logic of its own.

## Tests

`gameDef.test.ts`:

| Block | Tests |
|---|---|
| *the day multiplier* (new) | flat by default; Saturday banks at Friday's rate; the old weekend is still dialable — AC1, AC2 |
| *the balcony* | survival floors at `1/N`; the top face clears and nothing else in that band does — AC3 |
| *cierrabares* (replaces *ultimo en pie*) | unique top drinker; tie pays nobody; below the minimum pays nobody; at risk not banked; an early leaver still counts; 3/6/9; cleared at the next venue; no count carried out of a cell — AC6, AC7 |
| *the police → a stop-and-search* (new) | three a head not three a search; duplicates count; legal items untouched; the log reports count and total — AC9 |
| *settings clamping* | the band clamps each end then un-crosses them; a single-value band is legal — AC5 |
| *the limit* | drawn from the host band — AC4 |

`limitScale.test.ts` rewritten around the band; `BoardComponent.test.tsx` gains
*the cierrabares banner* (AC8).

### Three existing tests had to change for real reasons

Not fixture churn — each was asserting something that is no longer true:

- **"ends the weekend early when every seat is dead"** used a one-faced die as
  guaranteed death. Under the new rule a d1 is *all* natural max, so it now
  survives every time instead of dying every time. Death can no longer be
  arranged with certainty at all, so the test walks seeds — deterministic, just
  not certain within a single game.
- **"is unsurvivable once you are as far over as the die has faces"** was the
  old rule written down. Inverted.
- **"leaves the lead where it is…"** collected openers across midnight, where a
  different rule takes over, so it only passed because the opener lot happened
  to fall on seat 0. Now bounded to one day and compared against the seat that
  actually opened.

A fourth class was genuine drift: `drawEventCard` named the other seats by
number, which held only because the old five-card shuffle left seat 0 opening
under the default seed. The drawer is now pinned by construction, which makes
those tests seed-independent rather than lucky.

## Verification

Mutation testing, scripted: revert each rule to its old behaviour, run the
suite, restore. Eight mutations, eight caught — after a fix. The first pass
caught seven and reported the flat multiplier as **unasserted**, which was true:
the test written for it measured Friday's banking, and Friday was ×1 under the
old rule too. Rewritten to cross midnight and measure Saturday against Friday;
two tests now catch it.

Worth keeping the script — it is the only thing that distinguishes a test that
asserts a rule from a test that agrees with the engine.
