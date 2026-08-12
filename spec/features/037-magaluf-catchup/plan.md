# Feature 037 — A way back in: plan

## Shape of the change

Two new primitives, two new event cases, one card deleted. No new machinery:
both cards are ordinary retargeting events resolved inside `resolveEvent`, the
same shape Ambulancia and the police already have.

## Files

| File | Change |
|---|---|
| `state.ts` | `alive(G)` — everyone whose weekend is not over; `confirmableSeats` now delegates to it, having been the same filter with a narrower name. `bankVP(player, n)` — VP straight to the bank, no limit check, no multiplier. |
| `cards.ts` | `reyGuiri` removed from `EventId` and `EVENTS`. `colecta` (flat, carries its `vp`) and `remontada` (a rule, carries no number — like `redada` and `barraLibre`). |
| `constants.ts` | `COMEBACK = { gapDivisor, maxVP }`. Deck slots moved in `PHASE_RULES`. |
| `events.ts` | `reyGuiri` case removed; `colecta` and `remontada` cases added, plus the two file-local helpers below. |
| `gameDef.ts` | The balcony's leyenda bonus routed through `bankVP` — it was the existing `bankedVP +=` this primitive generalises. |
| locales, how-to-play | Rey del guiri out, the two cards in, both languages. |
| `i18nFixture.ts` | `reyGuiriResult` → `remontadaResult`, for the board's winner-list test. |

Two helpers stay file-local in `events.ts` rather than joining `state.ts`,
because nothing outside event resolution has any business ranking the match:

- `standings(G)` — `rankSeats` by `bankedVP + roundVP` over `alive(G)`.
- `lastPlace(ranked)` — everyone tied at the bottom. Separate from
  `ranked[ranked.length - 1]` on purpose: `rankSeats` settles ties by seat
  number, so taking the last entry would decide a payout by seating.

## Tests

`gameDef.test.ts` → *worked-out event results*. The five Rey del guiri tests
are deleted; eight replace them.

| Test | Covers |
|---|---|
| hands the whip-round to the seat with the fewest points, into the bank | AC3 |
| ranks on banked plus what is still on the table | AC6 |
| reaches a player sitting the phase out in a cell | AC5 |
| passes over a player whose weekend is already over | AC5 |
| pays every seat tied at the bottom | AC3 |
| hands back half the gap on a Remontada, and shows its working | AC4 |
| caps the Remontada rather than handing the weekend back | AC4 |
| says so rather than paying nothing when the table is level | AC7 |

AC1 needs no test of its own: `EventId` is a closed union, so a surviving
reference is a compile error, and `i18nKeys.test.ts` derives its expectations
from the card data.

AC2 was checked by summing `PHASE_RULES[*].events` on this branch and on `main`
and comparing: 36 / 45 / 55 both sides.

## Balance probe

A throwaway `catchupSim.test.ts` drove 200 full 4-player matches through the
real engine at three drinking strategies, counted what the two cards paid, and
was deleted once read. It is what set the tuning, and it caught the first
attempt being worth a median of 6 points against a 47-point gap — a number no
unit test would ever have complained about. Figures are in `spec.md`.

## Verification note

Not driven through the browser preview. Both cards' entire visible surface is
the outcome string pinned to `G.lastDraw` plus a feed entry;
`BoardComponent.test.tsx` already asserts `remontadaResult` rendering a
multi-winner list into names, and the feed's ranking zip has its own test in
`ChatPanel.test.tsx`.
