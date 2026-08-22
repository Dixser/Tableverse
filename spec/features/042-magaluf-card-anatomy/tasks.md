# Feature 042 — Cards become printed objects: tasks

- [x] 1. `spec.md` / `plan.md` — the four parts of a card, which two are shared
      by every copy, and why the deck has to hold the copy rather than roll for
      it at draw time.

- [x] 2. **`CardInstance`.** `{ id, variant }` in `cards.ts`, plus `cardArt()`
      naming one file per printing from the id.
      **Verify:** AC2 — 1 test.

- [x] 3. **The decks hold printed cards.** `buildDeck` numbers copies from
      zero; both decks, both discards, `lastDraw`, `pours`, `drawAlcohol` and
      `drawEvent` carry instances; `alcoholCard()` does the lookup.
      **Verify:** AC1 — 3 tests.

- [x] 4. **`GameCard` and `CardArt`.** Title, image, effect, flavour. Effect
      numbers interpolated from `cards.ts` and coloured by what they do to the
      player; `<intox>` picks its colour from the value, because Agua goes the
      good way. Art falls back to a placeholder naming the file.
      **Verify:** AC3, AC5, AC6 — 4 tests.

- [x] 5. **Variants reach the board.** `DrawnCards` renders the drawn pair as
      full cards and leaves the pours as tiles; `CardTile` reads `.title`.
      **Verify:** AC4, AC7 — 3 tests.

- [x] 6. **The catalogue.** i18n cards become `{ title, effect, flavor[] }`;
      the 42 fused strings split into their three parts so nothing already
      written was lost; 161 flavour lines per language written on top.
      Bulk-generated in one pass, checked against the deck counts on the way
      in, and the generator deleted afterwards so the locale files are the only
      place the copy lives.

- [x] 7. **The coverage test earns its keep.** `i18nKeys.test.ts` derives the
      required flavour count per card from `PHASE_RULES`, so adding a copy to a
      deck fails until its line exists.
      **Verify:** AC8 — the existing 2 tests, now checking 3 keys per card
      plus one per printing.

- [x] 8. **Art folder and its README** — the naming rule, how many of each, and
      what happens when a file is missing.

- [x] 9. **Mutation testing.** Seven mutations, seven caught: variants
      collapsed, art numbering made 0-based, flavour and art pinned to the
      first printing, effect numbers frozen, intox colour frozen, and one
      card's flavour list truncated below its deck count.

- [x] 10. **Checked in the running app.** A full Tardeo: 42 distinct printings
      reached the table, each with its own file and its own line. Title at
      weight 700, effect values in `vp` / `intoxUp` spans, flavour italic. The
      placeholder was trimmed to the filename after seeing it print the title
      twice on every card on the board.

- [x] 11. **Full suite.** `npm run test:unit` 862 in `game-core` (851 before),
      259 client, 24 shared; `typecheck` clean; `lint` 14 problems against a
      13 baseline — the extra is pre-existing on `main` in a file this feature
      does not touch.
