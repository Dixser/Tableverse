# Feature 042 — Cards become printed objects: plan

## Shape of the change

Three layers, in order, because each one is only testable once the one below
exists:

1. **The deck stops holding ids.** `CardInstance` in `cards.ts`, `buildDeck`
   numbering copies, and the type change threaded through both decks, both
   discards, `lastDraw`, `pours` and the two draw functions.
2. **The card gets an anatomy.** `GameCard` + `CardArt`, and the i18n tree for
   a card goes from one string to `{ title, effect, flavor[] }`.
3. **The catalogue gets written.** 161 flavour lines a language, bulk-generated
   into the locale files in one pass and validated on the way in.

   The generator was deleted once it had run. Two sources for the same strings
   is a trap: the locale files are what the app loads and what the tests check,
   and a script sitting next to them that rewrites both wholesale would sooner
   or later be re-run over somebody's edits. **The copy is edited in
   `es.json` / `en.json` and nowhere else.**

## Files

| File | Change |
|---|---|
| `cards.ts` | `CardInstance`, `cardArt()`. |
| `state.ts` | `AlcoholInstance` / `EventInstance`; deck and discard types; `buildDeck` numbers copies; `drawAlcohol` / `drawEvent` return instances; `alcoholCard()` looks the numbers up; `consumeAlcohol` / `pourDrink` take an instance; `refill` loses its `extends string`. |
| `gameDef.ts`, `events.ts` | Draw sites; `descriptionKey` moves to `magaluf.<kind>.<id>.title`. |
| `GameCard.tsx` + `.module.css` | New. Title / art / effect / flavour. |
| `CardArt.tsx` + `.module.css` | New. `<img>` with an `onError` placeholder. |
| `CardTile.tsx` | Reads `.title`; comment rewritten to say what it is *for* now that it is no longer the only card renderer. |
| `DrawnCards.tsx` | Full cards for the drawn pair, tiles for the pours. |
| locales, `i18nFixture.ts` | Cards become objects; the fixture gains colour tags and two flavour lines per card so a test can tell printings apart. |
| `public/cards/magaluf/README.md` | The naming rule and how many of each. |

## The i18n shape

```json
"ligueTardeo": {
  "title": "Ligue de piscina",
  "effect": "Ganas <vp>{{vp}} PV</vp>.",
  "flavor": ["Algo es algo.", "Te ha dicho su nombre y ya se te ha olvidado."]
}
```

`log.event` and `log.drank` name `…​.title`, so the feed prints the card's name
and the board prints the card. The feed already reports worked-out numbers on
its own line, so nothing is lost by not repeating the effect there.

## Tests

| Block | Covers |
|---|---|
| `gameDef.test.ts` → *the deck is printed cards* | AC1, AC2 — numbering, art filenames, distinct printings in a real deck, the instance reaching `lastDraw` |
| `BoardComponent.test.tsx` → *the printed card* | AC3–AC7 — the four parts, numbers from card data, the minus sign, two copies compared part by part, the missing-art placeholder, the flavour fallback |
| `i18nKeys.test.ts` | AC8 — `largestPrintRun()` derives the required flavour count per card straight from `PHASE_RULES`, so adding a copy to a deck fails the build until its line is written |

`stack()` still takes plain id arrays and wraps them, so the ~49 existing tests
that stack a deck did not have to change: a test says which card comes next,
not which printing.

## Verification

Mutation testing, same script shape as 041. Seven mutations, seven caught. The
one that matters most is the last: truncating one card's flavour list below its
deck count, which `i18nKeys.test.ts` catches. Without that check a missing line
reaches the table as a raw i18n key, and it is exactly the failure a catalogue
of 322 hand-written strings will eventually have.

Then a full Tardeo in the running app, collecting every printing that reached
the table — 42 distinct files, each with its own flavour line.

## What this leaves for later

- Artwork. The folder, the naming rule and the fallback are ready.
- Alcohol flavour was written rather than left blank, so the "empty string for
  now" the request allowed for is not needed — but the lines are the easiest
  thing here to disagree with, and they are all in one place.
