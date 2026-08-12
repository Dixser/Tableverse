# Feature 035 — The Camello asks first: plan

## Shape of the change

Data, not machinery. Feature 034 built `EventCard.options`, `pendingChoice`,
the `chooseEventOption` move and `EventChoicePanel`; all three Camello cards
need is to declare branches, and the entire flow — parking the card face-up,
blocking other moves, rendering a button per branch, logging the pick — comes
for free.

The `givesItem` effect already works on a branch: `invitacion`'s `pillarKebab`
has been handing an item over from an option since 034. So `events.ts`,
`gameDef.ts`, `state.ts` and the board components are all untouched.

## Files

| File | Change |
|---|---|
| `cards.ts` | Four ids on `EventOptionId`; the three `camello*` cards gain `options`. The catalogue comment above the ids says "offer" rather than "hand over". |
| `client/src/i18n/locales/{en,es}.json` | Four `eventOption` strings; the three `event.camello*` descriptions reworded from a statement into an offer. |
| `docs/magaluf/how-to-play.{en,es}.md` | Camello moved into the "cards that ask you a question" list; §9 gains the sentence that contraband is never involuntary. |
| `i18nFixture.ts` | `pillarFarlopa` / `dejarlo`, for the board test's label assertion. |

## Tests

| Where | What |
|---|---|
| `gameDef.test.ts` → *event cards with options* | The item arrives only on the take branch, and the decline branch moves nothing (AC2). Each Camello offers its own item. |
| `gameDef.test.ts` → *the police* | The playtest sequence itself, run both ways: deal → answer → next seat draws the Redada. Accepted is arrested, declined is still partying (AC3). |
| `BoardComponent.test.tsx` → *the event choice step* | Both branches render with their labels for `camelloFarlopa` (AC4). |

AC1 needs no new test: it is feature 034's AC3/AC4, which are asserted
generically over `pendingChoice` and hold for any card with `options`.
`i18nKeys.test.ts` derives its expectations from the card data, so the new
option ids are covered the moment they exist — a missing string fails it
without anything being added.

## Verification note

Not driven through the browser preview. Reaching a Camello in a live match
needs three seated players and the card to come up in a shuffled deck; the
board path is a generic panel already covered by the component tests above,
which assert the same thing deterministically.
