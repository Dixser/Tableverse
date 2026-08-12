# Feature 036 — The crown goes to the drunkest: plan

## Shape of the change

Four lines of engine and four strings. The card already reported its own
worked-out result through `logOutcome` + `reyGuiriRanking`; only the number
being ranked and the field being ranked change.

## Files

| File | Change |
|---|---|
| `state.ts` | `rankSeats` gains an optional `seats` argument defaulting to `G.activeSeatIDs`. Its doc note records that the seat-order tiebreak is for display, and that a paying caller reads the top *value*. |
| `events.ts` | `reyGuiri` ranks `partying(G)` by `p.intox`. The `most > 0` guard stays and its comment now says "sober" rather than "has not drunk". |
| `client/src/i18n/locales/{en,es}.json` | The card text, `reyGuiriResult` (`{{n}} copas` → `{{n}} de Intoxicación`), `reyGuiriRanking` (drinks → intoxication) and `reyGuiriNobody`. |
| `docs/magaluf/how-to-play.{en,es}.md` | §10 gains a Rey del guiri bullet — the section is "worth knowing in advance", and a card that pays for intoxication inverts the game's basic tension. |

`n` keeps its name in `reyGuiriResult`; only what it counts changes, and the
string in front of it says which. No board change: `DrawnCards` renders
whatever outcome the engine pinned to `lastDraw`.

## Tests

`gameDef.test.ts` → *worked-out event results*, all under `drawEventCard`,
which stacks a cana and drinks it on the way in — so the drawing seat's setup
value is always one short of what it will hold when the card resolves.

| Test | Covers |
|---|---|
| names the Rey del guiri and ranks the whole table behind them (rewritten to intox) | AC1 |
| pays for what you drank, not for how many times you drank | AC2 |
| crowns nobody who has already gone home | AC3 |
| joins tied kings rather than picking one by seat order (rewritten to intox) | AC1 |
| crowns nobody when the whole venue is still sober | AC4 |

The last one stacks `agua` instead of the default cana: it is the only drink in
the game with negative intoxication, and the only way to have the drawer resolve
the card while still on zero.

Two old tests were rewritten rather than kept. One asserted the bug directly —
"Seat 0's own drink puts it one ahead of the other two" — which is the payout
this feature removes.

## Verification note

Not driven through the browser preview: reaching this card in a live match
needs three seated players and the right shuffle. The card's whole visible
surface is the outcome string pinned to `G.lastDraw`, which the engine tests
above assert directly, and `BoardComponent.test.tsx` already covers
`reyGuiriResult` rendering from a fixed `lastDraw`.
