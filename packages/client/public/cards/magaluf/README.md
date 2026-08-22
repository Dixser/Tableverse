# Magaluf card art

One file per **printed card**, not per card kind. Two copies of the same card
in a deck are two different pictures — see `CardInstance` in
`packages/game-core/src/games/magaluf/cards.ts`.

## Naming

```
<cardId><NN>.png
```

- `cardId` is the id from `cards.ts` (`ligueTardeo`, `cubata`, `chupitoCasa`).
  Not the title: the title is translated and the picture is not.
- `NN` is the printing, **1-based and zero-padded** — `01`, `02`, … The data
  is 0-based, so `variant: 0` is `…01.png`.

Examples: `ligueTardeo01.png`, `ligueTardeo02.png`, `cubata07.png`.

## How many of each

As many as the largest number of copies any single phase deck holds — that is
how many of one card a table can meet in a single venue. `i18nKeys.test.ts`
enforces the same count for flavour text, so the flavour catalogue is the
quickest place to read the answer: `magaluf.<kind>.<id>.flavor` in
`packages/client/src/i18n/locales/es.json` has exactly one entry per printing.

Highest counts today: `cubata` 7, `cana` 6, `tinto`/`gintonic` 5,
`chupitoCasa` 4.

## What is still missing

```
npm run check:card-art
```

Lists every picture the game asks for and does not have, grouped by card, plus
any file here that no card asks for -- which is almost always a typo in the id
or the number. Exits non-zero while anything is missing, so it can gate a build
later.

The expected filenames come from calling the same `cardArt()` the board calls
over the same deck counts the game is built from, so the script cannot drift
from what the app actually requests.

## Missing files

Nothing here is required. `CardArt` falls back to a labelled placeholder that
names the file it was looking for, so art can land one card at a time and each
one appears on the next reload with no code change.
