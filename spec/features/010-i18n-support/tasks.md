# Feature 010 — i18n Support: Tasks

Library/config first (nothing else compiles or renders translated text
without it), then the language-selection hook + switcher (independently
testable, mirrors `useTheme`/`ThemeToggle`), then the mechanical static-
string conversions, then `GameoverBanner`'s pluralization rewrite (the one
non-mechanical piece), then locale-parity guarding, then verification.

- [ ] 1. `npm install react-i18next i18next --workspace=packages/client`.
      Add `packages/client/src/i18n/i18n.ts`,
      `packages/client/src/i18n/locales/en.json`,
      `packages/client/src/i18n/locales/es.json` per plan.md's key
      structure (English content first, mirrored into Spanish). Wire
      `import './i18n/i18n'` into `main.tsx`.
      **Verify:** client builds and typechecks; no behavior change yet
      (nothing consumes `useTranslation()` until task 3+).
- [ ] 2. `packages/client/src/i18n/useLanguage.ts` +
      `useLanguage.test.ts`, mirroring `theme/useTheme.ts`'s existing
      structure and test coverage: `localStorage` detection, browser-
      language detection (`navigator.language` sliced to a 2-letter code)
      when nothing is stored, fallback to `en` when neither matches
      `SUPPORTED_LANGUAGES`, persistence + `document.documentElement.lang`
      write on `setLanguage`.
      **Verify:** `npx vitest run src/i18n/useLanguage.test.ts` — all
      cases pass.
- [ ] 3. `packages/client/src/i18n/LanguageToggle.tsx` +
      `LanguageToggle.test.tsx`, per plan.md. Mount `<LanguageToggle />` in
      `App.tsx` next to the existing `<ThemeToggle />`, same always-visible
      placement (spec.md AC7).
      **Verify:** renders all `SUPPORTED_LANGUAGES` options, selecting one
      calls `setLanguage`; manual check that it's visible on the identity
      screen before a nickname is entered.
- [ ] 4. `packages/client/index.html` — add the language pre-paint
      `<script>` alongside the existing theme one, per plan.md (reads
      `tableverse:language`, sets `document.documentElement.lang` before
      first render).
      **Verify:** with a `tableverse:language` value pre-seeded in
      `localStorage`, a hard page reload shows no flash of the wrong `lang`
      attribute (checked via browser dev tools' Elements panel on load).
- [ ] 5. Convert `App.tsx` (`IdentityGate`, `RoomEntry`, `renderScreen`)
      to `useTranslation()` + `t('...')` per the inventory table in
      plan.md. Update `App.test.tsx`'s (or equivalent) existing assertions
      to match `en.json` strings rather than duplicated literals.
      **Verify:** existing App-level tests pass unmodified in behavior
      (same rendered text, sourced from `en.json` now instead of a
      literal).
- [ ] 6. Convert `room/RoomShell.tsx` (all static labels + `Room
      {inviteCode}` + `Seat {playerID}: {occupant}` + `SeatPicker`'s `Seat
      {playerID}` + the role lookup via `t(`room.role.${m.role}`)`) and
      `room/SeatSwitcher.tsx` (`aria-label` + seat tab labels) to
      `useTranslation()`, per plan.md. Update their existing test files
      accordingly.
      **Verify:** `RoomShell.test.tsx`/`SeatSwitcher.test.tsx` pass;
      manual check that room/seat labels render translated in both
      languages via the switcher.
- [ ] 7. Convert `room/PresenceBadge.tsx`'s `LABEL` map and
      `gameMount/GameMount.tsx`'s three strings (including the
      `Unknown game: {gameID}` interpolation) to `useTranslation()`, per
      plan.md. Update their test files.
      **Verify:** `PresenceBadge.test.tsx`/`GameMount.test.tsx` pass.
- [ ] 8. Rewrite `gameMount/GameoverBanner.tsx`'s `resolveGameoverMessage`
      to accept a `t: TFunction` parameter and route every branch (draw,
      sole winner, co-winner, non-winner naming winners with
      count-based pluralization, unrecognized-shape fallback) through
      `t()`, per plan.md's exact function body. Update
      `GameoverBanner.tsx`'s own render to call `useTranslation()` and
      pass `t` through.
      **Verify:** every existing English test case in
      `GameoverBanner.test.tsx` still passes with `t` sourced from a real
      i18next test instance (not a hardcoded string comparison).
- [ ] 9. `GameoverBanner.test.tsx` — add a parallel set of cases asserting
      every message-table row (spec.md AC4) in **Spanish**, using the same
      real i18next instance switched to `es`. Confirms the pluralization
      keys (`othersWin_one`/`othersWin_other`) resolve correctly, not just
      that English still works.
      **Verify:** new Spanish-locale cases pass; running both language
      suites confirms no shared mutable i18next state leaks between test
      cases (each test sets its own language explicitly rather than
      relying on ambient state from a previous test).
- [ ] 10. `packages/client/src/i18n/localeParity.test.ts` — recursive key-
      set diff between `en.json` and `es.json`, failing if either has a
      key the other lacks.
      **Verify:** passes against the real locale files as authored in
      tasks 1-9; deliberately break parity locally to confirm the test
      actually fails before leaving it passing.
- [ ] 11. Confirm zero changes needed to
      `packages/game-core/src/games/tictactoe/BoardComponent.tsx`,
      `packages/server/**`, and `packages/shared/**` — spec.md AC13 and
      the server-error non-goal.
      **Verify:** `git status --porcelain` scoped to those paths shows no
      modifications from this feature's work.
- [ ] 12. `test:unit` for `packages/client` full suite green;
      `npm run typecheck` clean for `client` workspace.
- [ ] 13. Manual/browser verification (spec.md stories 1-5): fresh load
      with browser language set to Spanish (no stored preference) —
      confirm Spanish renders by default; switch to English via the
      toggle — confirm immediate re-render, no reload; reload the page —
      confirm English persists (not re-detected back to Spanish); play a
      Tic-Tac-Toe match to a win and to a draw in each language, confirming
      `GameoverBanner`'s message (including a two-seat solo-play co-winner
      or non-winner case, per feature 009's own manual verification setup)
      reads correctly and grammatically in both languages.
