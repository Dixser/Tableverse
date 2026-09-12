# Feature 043 — El Duelo: plan

## Shape of the change

Four layers, in order, because each one is only testable once the one below
exists:

1. **The card.** Three printings in `cards.ts`, one new option (`retar`) and
   one new structural flag (`duels`), the deck trades in `constants.ts`, and
   `duelPot` in `events.ts` so the engine and the board price the pot from the
   same function.
2. **The state.** `PendingDuel` in `state.ts` and `G.pendingDuel`, cleared at
   every venue open like the other two pending fields.
3. **The engine.** The opponent pick as a `party` move, the exchange as a new
   `duel` phase, and one settle path out of it. The cap sweep comes out of
   `finishTurn` into `sendHomeAtCap` so the duel can run it in its own order.
4. **The board.** One `DuelPanel` for both steps, taking the move surface the
   way `EventChoicePanel` does.

## Files

| File | Change |
|---|---|
| `cards.ts` | `dueloTardeo` / `dueloNoche` / `dueloAfter` with `vp` as the rate; `retar`; `duels?: boolean`; `DUEL_OPTIONS`; `isDuelCard()`. |
| `constants.ts` | Duelo 1 / 2 / 2; `chupitoCasa` 2→1, 2→1, 4→3; `garrafonEvent` (Noche) 2→1; `ronda` (After) 3→2. Totals unchanged. |
| `events.ts` | `duelPot(eventId, drinks) = rate × (drinks + 1)`. |
| `state.ts` | `PendingDuel`; `MagalufG.pendingDuel`. |
| `gameDef.ts` | `sendHomeAtCap`; the fewer-than-two check at reveal; `canAct` gate; `chooseEventOption` parks the duel; `chooseDuelTarget`, `duelDrink`, `duelFold`, `settleDuel`; the `duel` phase. |
| `DuelPanel.tsx` + `.module.css` | New. Opponent picker, then challenger vs target, the pot, what one more drink makes it, and the two buttons for whoever is owed them. |
| `BoardComponent.tsx` | An open duel outranks the choice panel and the action bar. |
| locales, `i18nFixture.ts` | Three cards, one option, four log lines, eight board strings. |
| `public/cards/magaluf/README.md` | The highest-count line: Chupito de la casa no longer runs to 4. |

## Decisions carried in from the spec

- **Pastis.** Armed before the duel, it doubles the first duel drink of the
  duelist who armed it. Falls out of reusing `pourDrink`; no code of its own.
- **No escape hatch.** A disconnected duelist is waited for. This is a
  friendly-play project, so there is no host abandon move.
- **Deck trades** as the spec's table.

## Why the pick stays in `party`

The challenger is the turn seat, so picking an opponent is shaped exactly like
answering any other choice card and needs nothing new. Only the exchange needs
a seat that is not up. Keeping the phase change for the one step that needs it
means the phase has two moves and every seat that can press them is gated by
`toActID` alone.

## Tests

| Block | Covers |
|---|---|
| `gameDef.test.ts` → *the duel* | AC1–AC12 against the real `Client`: the fewer-than-two rule, both branches, the pick's gating, turn order inside the duel, the pour, the pot at every rate, Pastis, the cap sweep's order, items, the reshuffle, all three hand-over paths, deck totals |
| `BoardComponent.test.tsx` → *the duel* | Picker candidates and the waiting line, the pot and next pot, buttons only for the seat owed them, the pinned result |
| `i18nKeys.test.ts` | AC13. Card keys come from `PHASE_RULES`; the played-weekend driver now fights duels, so the log and outcome keys are reached too |

Every test driver (`play`, `playToGate`, the i18n sweep) learns to answer an
open duel, for the same reason each already answers a choice card: while one is
open, nothing else can move.

## What this leaves for later

- Artwork for the five printings. `CardArt`'s placeholder names each file.
- A re-probe of the pot. The rate is Barra libre's by decision, not by
  simulation, and the simulator does not run these rules.
- A host setting for `maxDrinks`. The duel does not depend on the cap existing.
