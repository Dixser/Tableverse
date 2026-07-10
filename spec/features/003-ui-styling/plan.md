# Feature 003 — UI Styling: Implementation Plan

## Decision: CSS Modules for every component/game stylesheet, plain CSS for the global sheet

**Global stylesheet** (`packages/client/src/styles/global.css`): plain CSS,
imported once in `main.tsx`. Intentionally *not* scoped — its entire job is
to define shared design tokens and base element defaults that everything
else in the app draws on, so it must apply globally.

**Every component's and every game's own stylesheet**: a colocated
`*.module.css` file (Vite's built-in CSS Modules support — zero additional
dependency, already active for any `.module.css` file with no config
needed). Each class name gets compiler-generated scoping (e.g.
`.board` becomes `._board_a8f3c2` in the compiled output), so two
different games can both use a class named `.board` with zero risk of
collision — no naming-convention discipline required, which plain CSS with
a hand-maintained prefix (the alternative) would have needed and would
only get riskier as more games are added per the roadmap. This is a
low-stakes, easily-reversible choice (renaming/restructuring class names
later doesn't touch the `GameModule` contract, the server, or any test
infrastructure), so it wasn't escalated as a stop-and-ask decision — unlike
feature 002's BoardComponent-placement question, nothing outside styling
itself depends on this choice.

**One tooling gap to close:** `packages/client`'s `tsconfig.json` already
includes `vite/client` in its `types` array, which ships the ambient
`declare module '*.module.css'` type declaration TypeScript needs to
accept `import styles from './x.module.css'`. `packages/game-core`'s
`tsconfig.json` does not currently include `vite/client` (it explicitly
lists `types: ["@testing-library/jest-dom"]`) — needs `vite/client` added
so `BoardComponent.module.css`'s import typechecks. This only affects
type-checking; Vite/Vitest's actual CSS Modules transform requires no
config either way.

## Design tokens (`global.css`)

A minimal set of CSS custom properties on `:root`, chosen to cover
everything the current chrome and Tic-Tac-Toe's board need without
over-designing a token system for a one-game platform:

```css
:root {
  /* Color */
  --color-bg: #14171a;
  --color-surface: #1e2227;
  --color-border: #2c3138;
  --color-text: #e8eaed;
  --color-text-muted: #9aa0a6;
  --color-accent: #4f8cff;
  --color-accent-text: #ffffff;
  --color-success: #3ddc84;
  --color-warning: #e0a63a;
  --color-danger: #e0543a;

  /* Spacing scale */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 1rem;
  --space-4: 1.5rem;
  --space-5: 2rem;

  /* Shape */
  --radius: 6px;

  /* Type */
  --font-sans: system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-size-base: 1rem;
  --font-size-lg: 1.25rem;
  --font-size-xl: 1.75rem;
}
```

`global.css` also carries a minimal reset (`box-sizing: border-box`
inherited, margin/padding zeroed on `body`, base `font-family`/`color`/
`background` applied to `body` from the tokens above) so every component
starts from the same baseline.

## File layout

```
packages/client/
  src/
    styles/
      global.css                  # tokens + reset + base typography, imported once
    main.tsx                      # + `import './styles/global.css';`
    App.tsx                       # + `import styles from './App.module.css';`
    App.module.css                # IdentityGate, RoomEntry layout/forms
    room/
      RoomShell.tsx                # + module.css import
      RoomShell.module.css
      SeatSwitcher.tsx             # + module.css import
      SeatSwitcher.module.css
      PresenceBadge.tsx            # + module.css import
      PresenceBadge.module.css     # connected/grace_period/released color states, driven by --color-success/warning/danger

packages/game-core/
  tsconfig.json                    # types: [..., "vite/client"]
  src/games/tictactoe/
    BoardComponent.tsx             # + module.css import, className -> styles.board / styles.cell
    BoardComponent.module.css      # the 3x3 grid fix
```

No changes to `packages/server`, `gamesCatalog.ts`, or any file outside
the lists above — per spec.md's AC6, styling one game must never require
touching shared files.

## `BoardComponent.module.css` (the concrete grid fix)

```css
.board {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: var(--space-2);
  width: 12rem;
  height: 12rem;
}

.cell {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-size-xl);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  color: var(--color-text);
  cursor: pointer;
}

.cell:disabled {
  cursor: default;
  opacity: 0.6;
}
```

`BoardComponent.tsx` changes `className="tictactoe-board"` →
`className={styles.board}`, and each cell `<button>` gets
`className={styles.cell}`. No change to the component's structure, props,
or the `role="grid"`/`role="gridcell"` attributes — spec.md's AC4 requires
the existing tests to keep passing exactly as written.

## `PresenceBadge.module.css` (chrome example using state-driven tokens)

```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 0 var(--space-2);
  border-radius: var(--radius);
  font-size: 0.85rem;
}
.connected { background: color-mix(in srgb, var(--color-success) 20%, transparent); color: var(--color-success); }
.grace_period { background: color-mix(in srgb, var(--color-warning) 20%, transparent); color: var(--color-warning); }
.released { background: color-mix(in srgb, var(--color-danger) 20%, transparent); color: var(--color-danger); }
```

`PresenceBadge.tsx` maps its `status` prop to the matching module class
(`styles[status]`) alongside the shared `styles.badge` class — the same
pattern every other chrome/game component follows: shared tokens, scoped
class names.

## Testing / verification strategy

- No new automated tests are added for pure visual output (per spec.md's
  non-goals — CSS correctness isn't meaningfully unit-testable, and visual
  regression tooling is out of scope).
- `BoardComponent.test.tsx`'s 5 existing tests must pass unmodified after
  the restyle (spec.md AC4) — they assert on ARIA roles and text content,
  never on class names, so this should require no test edits; running them
  is the verification step, not a prediction to trust blindly.
- Live verification (spec.md AC1–3, AC5–6) via the browser preview tool:
  screenshot the identity screen, room chrome, and the Tic-Tac-Toe board;
  `preview_inspect` the board container's computed `display`/
  `grid-template-columns` to confirm the grid fix isn't just visually
  close but structurally correct; inspect a cell's compiled class name to
  confirm it's a generated/scoped name (CSS Modules working), not the old
  literal `"tictactoe-board"`-style string.

## Open risks

1. **Vitest's CSS Modules handling inside `packages/game-core`.**
   `game-core`'s own Vitest config (`@vitejs/plugin-react`, jsdom for
   `BoardComponent.test.tsx`) should process `.module.css` imports the
   same way `packages/client`'s does, since both go through Vite's
   transform pipeline — but this has only been confirmed for `client` so
   far (feature 002 never imported CSS anywhere). Task-level verification:
   run `BoardComponent.test.tsx` after adding the CSS Module import and
   confirm it still passes, rather than assuming.
2. **`color-mix()` browser support.** Used in `PresenceBadge.module.css`
   above for tinted status backgrounds; well-supported in current
   Chromium/Firefox/Safari, but if the live-verification screenshot shows
   it not rendering as expected, fall back to hardcoded
   pre-mixed color values per state instead of `color-mix()`.
