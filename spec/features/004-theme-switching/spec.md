# Feature 004 — Theme Switching

## Description

Feature 003 establishes a set of CSS custom properties (`--color-bg`,
`--color-surface`, `--color-text`, etc.) on `:root` in `global.css`, and
every chrome component and every game's `BoardComponent` consumes color
via those tokens rather than hardcoding values. This feature adds a
light/dark theme toggle on top of that layer: a second set of token
values, a way to switch between them at runtime, and persistence of the
user's choice — without touching a single per-component or per-game
stylesheet, which is the entire point of having built the token layer in
003 in the first place.

## User stories

### 1. The app matches my system's light/dark preference by default

As a first-time visitor with no stored preference, the app renders in
whichever of light or dark mode matches my OS/browser setting
(`prefers-color-scheme`), without me having to do anything.

### 2. I can manually override the theme

As a player, I can toggle between light and dark regardless of my system
setting, via a control in the platform chrome. The switch applies
immediately, with no page reload.

### 3. My choice persists

As a returning player, the theme I last picked is restored on reload,
taking precedence over my OS preference — until I explicitly change it
again. (No account system exists yet per tech-stack.md's Phase 1 identity,
so this is stored client-side only, the same documented-limitation pattern
as seat-credential reconnection: device-local, not synced across devices.)

### 4. Every game and every chrome component re-themes for free

As the developer, I don't edit `BoardComponent.module.css` or any chrome
component's stylesheet to make it support the new theme — switching
themes only changes the *values* CSS custom properties resolve to; every
consumer of `var(--color-...)` re-paints automatically. This is the
concrete proof that feature 003's token-based design was worth building,
not just a nice idea.

## Acceptance criteria

`[manual]` denotes verification via the browser preview tool
(`preview_resize`'s `colorScheme` emulation for OS-preference testing,
`preview_inspect` for computed color values, screenshots for the visible
result) — theme correctness isn't meaningfully unit-testable the way
behavior is.

1. `[manual]` With no stored preference and the OS/browser emulated as
   dark, the app renders using the dark token values; emulated as light,
   it renders using the light token values — no toggle interaction
   required.
2. `[manual]` Clicking the theme toggle switches every themed color on
   screen immediately (no reload), verified by `preview_inspect`ing a
   chrome element's and a Tic-Tac-Toe board cell's computed
   `background-color`/`color` before and after the click.
3. `[manual]` The chosen theme is written to `localStorage` and, on
   reload, the app renders in that stored theme even if it differs from
   the OS/browser's emulated `prefers-color-scheme` — proving the manual
   override wins over the system default.
4. `[manual]` Toggling the theme requires zero edits to
   `BoardComponent.module.css`, `PresenceBadge.module.css`, or any other
   per-component/per-game stylesheet added by feature 003 — only
   `global.css`'s token *values* and the toggle mechanism itself are new
   files/edits.
5. `[manual]` The toggle control lives in the platform chrome (e.g.
   `RoomShell` or a persistent app-level header), never inside a
   `BoardComponent` — consistent with tech-stack.md's chrome/board split.

## Non-goals

- More than two presets (light, dark) — no custom theme builder, no
  per-user color picker.
- Server-persisted, cross-device theme preference — no real accounts
  exist yet (tech-stack.md Phase 1 identity); this is `localStorage`-only,
  same documented limitation as seat-credential reconnection.
- Live-updating the theme if the OS preference changes *while the app is
  open* after a manual override has been set — once a user picks a theme,
  it wins until they explicitly change it again; no `matchMedia` change
  listener is wired up to override an explicit user choice.
- Theming boardgame.io's own built-in debug panel — third-party UI outside
  this platform's control.
- Per-game custom theme overrides (a game opting out of the platform's
  theme) — every game shares the same two presets via the same tokens.
