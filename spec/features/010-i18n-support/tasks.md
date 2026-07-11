# Feature 010 — i18n Support: Tasks

Library/config first (nothing else compiles or renders translated text
without it), then the language-selection hook + switcher (independently
testable, mirrors `useTheme`/`ThemeToggle`), then the mechanical static-
string conversions, then `GameoverBanner`'s pluralization rewrite (the one
non-mechanical piece), then locale-parity guarding, then verification.

- [x] 1. `npm install react-i18next i18next --workspace=packages/client`.
      Added `packages/client/src/i18n/i18n.ts`,
      `packages/client/src/i18n/locales/en.json`,
      `packages/client/src/i18n/locales/es.json` per plan.md's key
      structure. Wired `import './i18n/i18n.js'` into `main.tsx` and
      (needed for tests, not originally called out in plan.md) into
      `vitest.setup.ts`, since test files import components directly
      without going through `main.tsx`.
      **Verify:** client builds and typechecks clean.
- [x] 2. `packages/client/src/i18n/useLanguage.ts` + `useLanguage.test.ts`,
      mirroring `theme/useTheme.ts`'s structure: `localStorage` detection,
      browser-language detection (`navigator.language` sliced to 2 letters)
      when nothing is stored, fallback to `en`, persistence +
      `document.documentElement.lang` write + `i18n.changeLanguage()` on
      `setLanguage`.
      **Verify:** `npx vitest run src/i18n/useLanguage.test.ts` — 6/6 pass.
- [x] 3. `packages/client/src/i18n/LanguageToggle.tsx` +
      `LanguageToggle.test.tsx`. Mounted `<LanguageToggle />` in `App.tsx`
      next to `<ThemeToggle />`, same always-visible placement (spec.md
      AC7). Positioned top-left (vs. `ThemeToggle`'s top-right) to avoid
      overlap without needing to touch `ThemeToggle`'s own CSS — a layout
      detail plan.md didn't pin down.
      **Verify:** 3/3 tests pass; confirmed visible on the identity screen
      before a nickname is entered (manual browser check, see task 13).
- [x] 4. `packages/client/index.html` — added the language pre-paint
      `<script>` alongside the existing theme one.
      **Verify:** manual browser check (task 13) confirmed the stored
      Spanish preference rendered correctly on initial load with no
      visible flash.
- [x] 5. Converted `App.tsx` (`IdentityGate`, `RoomEntry`, `renderScreen`)
      to `useTranslation()` + `t('...')`, including the
      `autoJoinError`/`roomEntry.autoJoinError` interpolated string and
      `RoomShell`'s `Loading room…` status (found during implementation,
      not itemized in plan.md's inventory table, but the same pattern).
      No `App.test.tsx` exists in this codebase, so no test file needed
      updating.
      **Verify:** typecheck clean; manual browser check (task 13).
- [x] 6. Converted `room/RoomShell.tsx` (all static labels, `Room
      {inviteCode}`, `Seat {playerID}: {occupant}`, `SeatPicker`'s `Seat
      {playerID}`, and the role lookup via `t(`room.role.${m.role}`)`) and
      `room/SeatSwitcher.tsx` (`aria-label` + seat tab labels) to
      `useTranslation()`. Updated `RoomShell.test.tsx`'s two assertions
      that hardcoded the raw role enum (`/You — host/`, `/guest-1 —
      member/`) to match the translated `Host`/`Member` labels. No
      `SeatSwitcher.test.tsx` exists, so nothing else to update there.
      **Verify:** `RoomShell.test.tsx` — 20/20 pass. Manual check (task 13)
      confirmed room/seat labels render translated in both languages via
      the switcher, live, in a real Tic-Tac-Toe match.
- [x] 7. Converted `room/PresenceBadge.tsx`'s `LABEL` map (renamed to
      `LABEL_KEY`, values are now translation keys) and
      `gameMount/GameMount.tsx`'s three strings (including the `Unknown
      game: {{gameID}}` interpolation) to `useTranslation()`. No
      `PresenceBadge.test.tsx` exists; `GameMount.test.tsx` needed no
      changes since its assertions already used case-insensitive regexes
      matching the English translation text verbatim.
      **Verify:** `GameMount.test.tsx` — 7/7 pass unmodified.
- [x] 8. Rewrote `gameMount/GameoverBanner.tsx`'s `resolveGameoverMessage`
      to accept a `t: TFunction` parameter (imported from `i18next`, not
      `react-i18next` — the latter doesn't re-export the type) and route
      every branch through `t()`, per plan.md. `GameoverBanner`'s own
      render calls `useTranslation()` and passes `t` through.
      **Verify:** existing English test cases updated to pass a real
      `t` (via `i18n.getFixedT('en')`, see task 9) instead of relying on
      hardcoded strings — all pass.
- [x] 9. `GameoverBanner.test.tsx` — added a parallel Spanish describe
      block covering the draw/sole-winner/co-winner/non-winner/fallback/
      name-fallback rows, plus a component-level render test asserting
      `¡Ganaste!` when `i18n.changeLanguage('es')` is active. **Deviated
      from plan.md's suggested approach:** used `i18n.getFixedT('en')` /
      `i18n.getFixedT('es')` for the pure-function table tests instead of
      mutating the shared i18next instance's active language per test —
      this avoids any risk of state leaking between test cases entirely,
      rather than relying on careful reset discipline.
      **Verify:** 23/23 tests in this file pass (12 English + 8 Spanish +
      3 component-level).
- [x] 10. `packages/client/src/i18n/localeParity.test.ts` — recursive
      key-set diff between `en.json` and `es.json`.
      **Verify:** passes against the authored locale files. Deliberately
      deleted `gameover.fallback` from `es.json` and re-ran the test —
      confirmed it fails with a clear diff (`missingFromEs:
      ["gameover.fallback"]`) — then restored the key and confirmed the
      test passes again.
- [x] 11. Confirmed zero changes to
      `packages/game-core/src/games/tictactoe/BoardComponent.tsx`,
      `packages/server/**`, and `packages/shared/**`.
      **Verify:** `git status --porcelain` scoped to those paths shows no
      output.
- [x] 12. `test:unit` — full monorepo run (`shared` 22/22, `game-core`
      25/25 including `BoardComponent.test.tsx` unmodified, `client`
      89/89) all green. `npm run typecheck` clean across all four
      workspaces.
- [x] 13. Manual/browser verification, run against the real dev server
      (proxying to an already-running backend on port 8000): loaded the
      app fresh in the embedded browser — it carried the actual user's
      persisted session and a previously-stored `es` language preference,
      rendering correctly in Spanish on load (identity/room-entry chrome
      fully translated: "Bienvenido, Dixser.", "Crear una sala", etc.).
      Switched to English via the toggle — every visible string updated
      instantly with no page reload. Created a room, enabled multi-seat,
      claimed both Tic-Tac-Toe seats (solo play), started a match — room/
      seat/presence chrome ("Room ABC123", "Seat 0: You", "Connected",
      "Leave seat", etc.) rendered correctly in English. Played to a win
      for Seat 0: Seat 0's own view read **"You win!"**; switching to Seat
      1's perspective read **"Dixser wins!"** (real display name, correct
      singular verb form). Switched language to Spanish mid-gameover —
      the banner updated live to **"¡Dixser gana!"**, and switching back
      to Seat 0's own perspective read **"¡Ganaste!"** — confirming AC4's
      pluralized/interpolated translation end-to-end, live, without a
      reload. Ended the match, confirmed the lobby chrome (`Iniciar
      partida`, `Esperando a que comience la partida…`,
      `Desconectado — reconectando…` from the post-match presence
      transition) all rendered in Spanish. Draw-message and 3+-winner
      cases were not separately screenshotted in-browser (no game
      produces those outcomes without more setup); both are covered by
      the unit tests added in task 9, consistent with feature 009's own
      precedent for untested-in-browser multi-winner cases.
