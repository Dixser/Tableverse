# Feature 034 — Magaluf balance pass: plan

## Shape of the change

Four independent rule changes plus one shared piece of machinery. The
machinery — `G.pendingChoice` and the `chooseEventOption` move — is the only
part that touches more than one file for one reason, and it is a copy of the
`pendingEvent` pattern that already exists two functions above it.

Everything stays inside `packages/game-core/src/games/magaluf/` except the two
locale files and the how-to-play docs.

## Engine

| File | Change |
|---|---|
| `constants.ts` | `LIMIT_DECKS` → `LIMIT_DECK`. `ambulancia`-adjacent tuning lives on the card, not here. Deck-slot retune in `PHASE_RULES[*].events`, totals held constant. |
| `cards.ts` | `EventEffects` split out of `EventCard`; `EventOption`, `EventOptionId`, `EventCard.options`, `eventOptions(id)`. Five new `EventId`s, three cards reworked in place. |
| `state.ts` | `addResaca`; `PendingChoice`; `G.pendingChoice`, `G.roundAnchor`, `G.lastStandingAwarded`. |
| `events.ts` | `applyCardEffects` takes `EventEffects` + `Rng` and handles the structural flags; `resolveEventOption`; `resolveEvent` guards against ever seeing a choice card. |
| `gameDef.ts` | `startDay` uses `LIMIT_DECK`; `startPhase` sets the anchor and clears the new per-phase state; `advanceTurn` detects the lap boundary; `awardLastStanding(G, seatID)` rewritten and dropped from `endPhase`; `revealPendingEvent` parks a choice; `settleAfterEvent` extracted; `chooseEventOption` move; `canAct` gains a clause. |
| `limitScale.ts` | Drops the `day` parameter throughout. |

Two decisions worth recording:

- **`leaves` reuses `LeaveReason: 'bouncer'`** rather than adding a reason. The
  existing one already means "left the phase, nobody's fault", which is exactly
  what a chosen exit needs so the Aguafiestas penalty does not apply. No new
  log key either.
- **`chooseEventOption` is not `client: false`.** It draws from a shuffled deck
  on one branch, but so do `drink` and `revealEvent`, which are registered as
  plain functions. Following the file's existing convention rather than
  introducing a second one for the same situation.

## UI

New `EventChoicePanel.tsx` + `.module.css`, modelled on
`crew/CommanderChoicePanel.tsx`: props-only, one button per branch, and a
waiting line for everyone who is not choosing.

`BoardComponent.tsx` renders it *instead of* `ActionBar` whenever
`G.pendingChoice` is set — including for spectators, who can already read the
card in `DrawnCards` above it. Both branches are styled identically on purpose:
styling one as primary would be the board telling the player how to answer.

`IntoxMeter`/`PlayerPanel` lose their `day` prop as a consequence of the
`limitScale` signature change.

## i18n

`magaluf.event.*` ×5 new, `magaluf.eventOption.*` ×16, `magaluf.log.choseOption`,
`magaluf.board.chooseOption` / `waitingChoice` — all in both locales, the last
two also in `i18nFixture.ts`.

`i18nKeys.test.ts` gains a sweep over `EVENTS[*].options[*].id`. Its
`keysFromAPlayedMatch` driver also had to learn to reveal events and answer
choices: it only ever called `drink`/`withdraw`, so its `drink` half was
spinning on the first pending event and proving nothing about the event key
surface.

## Tests

Rewritten because the rule changed under them, not patched around:

- `limitScale.test.ts` — "widens across the weekend" inverts to "the same band
  every day".
- `BoardComponent.test.tsx` — the band assertion, same inversion.
- `gameDef.test.ts` — the two day-specific limit assertions.
- The balconing block — see below.

New: an `ultimo en pie (round-start rule)` block and an
`event cards with options` block, both driving stacked decks through
`stack(g, alcohol, events)`.

### The balconing tests needed re-tuning, and why

They pin a limit at setup, play seat 0 through a day, and need **both** jump
outcomes to occur across ten seeds. Two things moved that:

1. The `play` harness now has to answer choice cards. It grew an `OptionPolicy`
   parameter; the balconing runs pass `duckResaca` so their resaca assertions
   measure the jump alone rather than a Vomitona taken on the way there.
2. Declining that relief pushes the overshoot from ~15 to 15–27, past what even
   a d20 can beat. The limit those runs pin is now `JUMPABLE_LIMIT = 14` rather
   than 0, putting `d` back in a band where both outcomes actually occur.

An Ambulancia can still hand seat 0 a hangover no policy can duck, so the one
test that asserts an exact resaca filters those runs out.

## Order of work

1. Flat limit deck (isolated; `limitScale` + two components + its test).
2. `addResaca` (isolated).
3. Card data model and the cards themselves.
4. `pendingChoice` machinery and the `chooseEventOption` move.
5. Último en Pie (independent of 3–4).
6. i18n, then the panel.
7. Tests, docs, spec.

Steps 1, 2 and 5 are independent of the choice cards and could ship on their
own if the card set needs more playtesting.
