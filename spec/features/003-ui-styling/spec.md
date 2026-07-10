# Feature 003 — UI Styling

## Description

The platform currently renders as entirely unstyled HTML — no colors,
layout, or typography beyond the browser's defaults, and `BoardComponent`s
have no visual treatment at all (Tic-Tac-Toe's 9 cells render as a plain
stacked/wrapped list of buttons, not a grid). This feature establishes two
things:

1. **A global stylesheet** for the platform chrome (identity screen, room
   entry, `RoomShell`, seat list, presence badges) — consistent colors,
   typography, spacing, and layout, driven by a small set of shared design
   tokens.
2. **A per-game CSS convention** — every game module owns its own scoped
   stylesheet, colocated with its `BoardComponent`, decoupled from every
   other game and from the platform chrome, while still able to draw on
   the same shared design tokens so a game visually fits the platform
   without hand-copying colors. Validated concretely by fixing Tic-Tac-Toe's
   board to render as a real 3x3 grid instead of a 9x1 stack.

This mirrors the chrome/board split already established in tech-stack.md
for *behavior* (platform renders chrome, `BoardComponent` renders only the
play area) — this feature applies the same split to *styling*.

## User stories

### 1. A consistent visual style across the platform

As a player, the identity screen, room entry, and room chrome (player
list, seat list, presence badges, game selector) share a consistent look —
readable typography, sensible spacing, and a coherent color palette —
instead of unstyled default HTML.

### 2. Tic-Tac-Toe renders as a real board

As a player, the Tic-Tac-Toe board displays as a 3x3 grid (three cells per
row, three rows), not a single stacked/wrapped list of 9 buttons.

### 3. Adding a game's styling never touches shared files

As the developer adding a future game (e.g. roadmap.md's Love Letter or
settings-game candidates), I add that game's own CSS file colocated with
its `BoardComponent` and it is automatically scoped — it cannot leak into
or be overridden by another game's styles, the platform chrome's styles,
or vice versa — without needing any naming-convention discipline to
enforce that by hand. I can still reference the platform's shared design
tokens (colors, spacing) from my game's stylesheet so it doesn't look out
of place.

## Acceptance criteria

`[manual]` denotes verification via the browser preview tool (screenshot
+ `preview_inspect` for computed styles), since CSS correctness isn't
unit-testable the way behavior is and automated visual regression testing
is explicitly out of scope (see Non-goals). `[unit]`/`[component]` denotes
existing automated tests that must keep passing unmodified in their
assertions (they query by ARIA role, not class name, so a styling change
must not require rewriting them).

1. `[manual]` A single global stylesheet is imported exactly once (in
   `main.tsx`) and defines: a `:root` set of CSS custom properties (color
   palette, spacing scale, font family/sizes) and base element resets
   (box-sizing, margin/padding, base typography).
2. `[manual]` `RoomShell`'s chrome (players, seats, game selector, buttons,
   the presence badge's connected/disconnected states) is visually
   distinguishable and legible — not unstyled default HTML — verified by
   screenshot.
3. `[manual]` The Tic-Tac-Toe board renders as a 3x3 CSS grid: three cells
   per row, three rows, verified via `preview_inspect`'s computed
   `display`/`grid-template-columns` on the board container, and visually
   via screenshot.
4. `[component]` `BoardComponent.test.tsx`'s existing 5 tests (querying by
   `role=grid`/`role=gridcell`) pass unmodified against the restyled
   component — proves the styling change is additive, not a rewrite of the
   component's structure/semantics.
5. `[manual]` Each game's stylesheet is colocated with its
   `BoardComponent` (same directory) and scoped such that its class names
   cannot collide with another game's or the chrome's — verified by
   inspecting the compiled class name on a Tic-Tac-Toe board cell (must be
   a generated/scoped name, not a plain literal string that any other file
   could also declare).
6. `[manual]` Removing/renaming Tic-Tac-Toe's stylesheet only requires
   touching files inside `games/tictactoe/` — no edits to the global
   stylesheet, `packages/server`, or any other game's files (mirrors
   feature 002's "one catalog line" isolation test, applied to styling).

## Non-goals

- A full design system or reusable component library.
- A light/dark theme toggle (the design tokens should be reasonable to
  re-theme later, but no toggle UI is built now).
- Responsive/mobile layout breakpoints.
- Animations/transitions beyond simple, incidental ones (e.g. a hover
  state), if any.
- An accessibility audit beyond what's already implicit in the existing
  semantic HTML/ARIA roles (`role=grid`, `role=gridcell`, `role=status`,
  etc.) — not regressing it, but not a dedicated pass either.
- Automated visual regression testing.
- Adopting a CSS framework (Tailwind, etc.) or CSS-in-JS — see plan.md for
  the chosen approach and why.
