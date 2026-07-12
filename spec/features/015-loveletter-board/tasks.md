# Feature 015 — Love Letter: Board UI, Round Tracking & Private Reveals: Tasks

i18n card data and the pure helper functions first (both are dependencies
of the components below, independently testable without React), then the
leaf display components, then the interactive move-composition components,
then the composed `BoardComponent`, then registration, then verification.

- [ ] 1. `packages/client/public/locales/{en,es}/translation.json` — add
      `loveLetter.cards.0` through `.9` (`name`/`text`, in this project's
      own words per feature 014's spec.md copyright note),
      `loveLetter.countessForced`, and any `loveLetter.reveal.*` keys
      feature 014's `privateReveals` entries reference.
      **Verify:** both locale files stay valid JSON and structurally
      parallel (same key set in `en` and `es`), matching feature 010's
      existing convention.
- [ ] 2. `packages/game-core/src/games/loveletter/eligibleTargets.ts` +
      `.test.ts` and `countessBlocksOtherCard.ts` + `.test.ts` — pure
      functions per plan.md.
      **Verify:** spec.md AC2/AC5/AC6 covered directly by unit tests, no
      DOM.
- [ ] 3. `CardTile.tsx` + `.test.tsx` — renders one card's rank/translated
      name/translated text, no image.
      **Verify:** spec.md AC1.
- [ ] 4. `HandView.tsx` + `.test.tsx` — renders both held cards via
      `CardTile`, applies `countessBlocksOtherCard` to disable the
      appropriate card with an explanatory label, initiates the
      move-composition flow on click (immediate `playCard` for
      Spy/Countess, else begins target selection), per plan.md's state
      machine.
      **Verify:** spec.md AC3, AC5.
- [ ] 5. `TargetPicker.tsx` + `.test.tsx` — lists `eligibleTargets`'
      output; for Guard, transitions to `GuardGuessPicker` on selection
      instead of calling `playCard` directly. `GuardGuessPicker.tsx` +
      `.test.tsx` — every rank except Guard, calls `playCard` with both
      target and guess.
      **Verify:** spec.md AC2, AC4, AC6 (including the "all opponents
      protected" immediate-play fallback for Guard/Priest/Baron/King, and
      the Prince-still-prompts-self-only case).
- [ ] 6. `PlayArea.tsx` + `.test.tsx` — per-player `playedCards` +
      `eliminated`/`handmaidProtected` badges, always visible to every
      viewer. `RoundWinsTracker.tsx` + `.test.tsx` — every seat's
      `roundWins`, rendered unconditionally (not gated behind round/match
      end).
      **Verify:** spec.md AC8.
- [ ] 7. `PrivateRevealToast.tsx` + `.test.tsx` — renders unread
      `privateReveals` entries for the active viewer only, with
      already-shown-entry de-duplication by array index, per plan.md.
      **Verify:** spec.md AC7.
- [ ] 8. `BoardComponent.tsx` (+ `.module.css`) + `BoardComponent.test.tsx`
      — composes `HandView`/`TargetPicker`/`GuardGuessPicker`/
      `PlayArea`/`RoundWinsTracker`/`PrivateRevealToast` against a
      `LoveLetterView`-shaped `BoardProps`; a spectator
      (`playerID: null`) fixture case; a "no chrome" assertion (no player
      list, seat controls, presence, or chat rendered), mirroring
      `TicTacToeBoard.test.tsx`.
      **Verify:** spec.md AC9, AC10.
- [ ] 9. `packages/game-core/src/boards.ts` — export `LoveLetterBoard`.
      `packages/client/src/boardRegistry.ts` — map `'loveletter-v1'` to
      it. (Feature 011's registration points 2 and 3 of 3; point 1 —
      `gamesCatalog.ts` — was completed in feature 014.)
      **Verify:** Love Letter is selectable from the room's game
      dropdown and its board actually renders once selected, closing the
      loop on all three of feature 011's checklist items.
- [ ] 10. Run `npm run test:unit`/`typecheck` for `game-core` and
      `client`. Manual/browser verification (spec.md AC11): a full match
      played across two real browser sessions (or solo-claiming both
      seats) through at least two rounds — hand display, targeting, the
      Countess forced-play block, a private Baron/Priest reveal, and the
      round-wins counter incrementing are all observed directly;
      cross-check feature 012's `ChatPanel` shows the corresponding
      public `G.log` status messages alongside manually-typed chat in the
      same feed.
