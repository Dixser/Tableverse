# Feature 004 — Theme Switching: Tasks

Token/CSS layer first (nothing else works without it), then the no-flash
script, then the hook, then the toggle control wired into the always-visible
chrome, then live verification.

- [x] 1. `packages/client/src/styles/global.css` — add the
      `@media (prefers-color-scheme: light)` block (OS-preference default)
      and the `:root[data-theme='light']`/`:root[data-theme='dark']`
      explicit-override blocks, per plan.md. Base `:root` (dark) values
      unchanged.
      **Verify:** client typechecks/builds; no visual check yet (nothing
      sets `data-theme` until task 3-4).
- [x] 2. `packages/client/index.html` — inline no-flash `<script>` in
      `<head>`, per plan.md, reading `localStorage['tableverse:theme']`
      and setting `document.documentElement.dataset.theme` before first
      paint.
- [x] 3. `packages/client/src/theme/useTheme.ts` + `useTheme.test.ts` — per
      plan.md's hook (reads/writes the same `localStorage` key the inline
      script uses; `setTheme` also sets `data-theme` directly so the DOM
      updates even without a re-render-triggered effect).
      **Verify:** unit tests pass (mocked `localStorage` + asserting
      `document.documentElement.dataset.theme` mutation) — 5/5, including
      a garbage-stored-value case not originally listed in plan.md but
      added for robustness (real `localStorage` content isn't
      type-checked).
- [x] 4. `packages/client/src/theme/ThemeToggle.tsx` (+
      `ThemeToggle.module.css`, consistent with feature 003's CSS Modules
      convention) — single button cycling dark → light → dark via
      `useTheme()`. An unset (OS-following) theme is treated as the "dark"
      side of the cycle, since the platform's unconditional `:root`
      default is dark.
- [x] 5. Wire `<ThemeToggle />` into `App.tsx`, rendered once, always
      visible regardless of `IdentityGate`/`RoomEntry`/`ActiveRoom` — per
      plan.md's placement decision (chrome-level, not `RoomShell`-level).
      Required refactoring `App()`'s multiple early-return screens into an
      inner `renderScreen()` so `<ThemeToggle />` could be rendered
      alongside every one of them from a single wrapping fragment, instead
      of duplicating the toggle at each return site.
      **Verify:** client typechecks; existing App/RoomShell tests
      unaffected (`ThemeToggle` is additive, not a layout change to
      existing components) — 28/28 client unit tests pass.
- [x] 6. Live verification (spec.md AC1, 2, 3, 5). **Partial — browser
      preview tooling was unavailable for this entire feature** (same
      outage as feature 003: both `mcp__Claude_Browser__preview_*` and the
      `mcp__claude-in-chrome__*` fallback report no connected browser,
      confirmed via `list_connected_browsers` returning `[]` and
      `tabs_context_mcp` timing out / reporting "Claude in Chrome is not
      connected"). Verified instead via `curl` against Vite's raw/compiled
      output and `grep`:
      - AC1 (OS-preference default): confirmed structurally — the
        compiled `global.css` served by Vite contains
        `@media (prefers-color-scheme: light) { :root:not([data-theme])
        { ... } }` verbatim, with the light token values; the base
        `:root` block (unconditional dark) is the fallback for every
        other case, matching plan.md's design. Not confirmed with an
        actual emulated-OS screenshot.
      - AC3 (stored override beats OS preference, survives reload):
        confirmed structurally — `curl`ing the raw `index.html` (not
        Vite-transformed, since it's static) shows the no-flash script
        correctly placed in `<head>`, reading `tableverse:theme` and
        setting `data-theme` before first paint; `:root[data-theme]`
        rules have no `@media` qualifier so they apply regardless of OS
        preference once set. Not confirmed by actually toggling OS
        emulation against a stored value in a live browser.
      - AC5 (toggle lives in platform chrome, never a `BoardComponent`):
        confirmed via `grep` — `ThemeToggle` is referenced only in its
        own file and in `App.tsx`; no `BoardComponent` or `game-core` file
        references it.
      - AC2 (click switches every themed color immediately, no reload):
        **NOT verified end-to-end** — this requires an actual click +
        computed-style read in a live browser. Partially covered by
        `useTheme.test.ts` (`setTheme` synchronously sets
        `document.documentElement.dataset.theme`, which is the mechanism
        AC2 depends on), but the resulting visual repaint was not
        observed.
      - Plan.md's open risk #1 (light-theme legibility/contrast review):
        **NOT done** — needs an actual screenshot, blocked by the same
        tooling outage.
      Flagged to the user; pending either browser-tool availability or
      the user's own visual check, same as feature 003's unresolved gap.
- [x] 7. Run `test:unit` (shared + game-core + client) and confirm nothing
      broke; run `npm run typecheck --workspaces` clean across all four
      packages. **Confirmed:** shared 19/19, game-core 25/25, client
      28/28 (up from 23 — 5 new `useTheme` tests) unit tests pass;
      `typecheck --workspaces` clean across all four packages. AC4 (no
      edits to `BoardComponent.module.css`, `PresenceBadge.module.css`, or
      any other feature-003 stylesheet) confirmed via
      `git status --porcelain` — only `global.css`, `index.html`,
      `App.tsx`, and the new `theme/` directory changed, matching tasks
      1-5 exactly.
