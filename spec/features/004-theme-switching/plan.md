# Feature 004 — Theme Switching: Implementation Plan

## Token/CSS structure — precedence between OS preference and manual override

`global.css`'s base `:root` block (from feature 003) already defines the
dark values as the unconditional default. This feature adds two more
layers, in increasing precedence:

```css
:root {
  /* feature 003's existing dark values stay here as the fallback default */
  --color-bg: #14171a;
  --color-surface: #1e2227;
  /* ...rest of feature 003's token list... */
}

/* 1. OS preference, only when the user has never made an explicit choice */
@media (prefers-color-scheme: light) {
  :root:not([data-theme]) {
    --color-bg: #f5f6f8;
    --color-surface: #ffffff;
    --color-border: #d7dbe0;
    --color-text: #1a1d21;
    --color-text-muted: #5f6368;
    /* accent/success/warning/danger kept close to the dark values' hues,
       adjusted for contrast against a light background */
  }
}

/* 2. Explicit override (set by the toggle), always wins regardless of OS */
:root[data-theme='light'] {
  --color-bg: #f5f6f8;
  --color-surface: #ffffff;
  --color-border: #d7dbe0;
  --color-text: #1a1d21;
  --color-text-muted: #5f6368;
}

:root[data-theme='dark'] {
  /* explicit re-statement of the base dark values, so an explicit "dark"
     choice is indistinguishable in specificity from an explicit "light"
     one -- neither depends on the fallback :root block "winning by
     default" */
  --color-bg: #14171a;
  --color-surface: #1e2227;
  --color-border: #2c3138;
  --color-text: #e8eaed;
  --color-text-muted: #9aa0a6;
}
```

No other stylesheet from feature 003 (`BoardComponent.module.css`,
`PresenceBadge.module.css`, etc.) changes at all — they reference
`var(--color-*)`, which the browser re-resolves live whenever the
`data-theme` attribute (or the OS preference, absent an override) changes.
This is spec.md's AC4, and the entire reason feature 003 was built
token-first.

## Avoiding a flash of the wrong theme on load

If the stored preference were applied inside a React `useEffect`, the
page would paint once with the CSS-default/OS-preference theme and then
flip a frame later once React mounts and the effect runs — a visible
flash on every reload for anyone with a stored override. The standard fix
(same pattern used by `next-themes` and similar libraries): apply the
stored preference **before** React ever renders, via a small inline
`<script>` in `index.html`'s `<head>`, which runs synchronously during
HTML parsing, before first paint:

```html
<script>
  (function () {
    try {
      var t = localStorage.getItem('tableverse:theme');
      if (t === 'light' || t === 'dark') {
        document.documentElement.dataset.theme = t;
      }
    } catch (e) {}
  })();
</script>
```

`useTheme.ts` (below) re-reads the same `localStorage` key on mount to
initialize its React state, so the hook and the inline script never
disagree — the script's only job is to beat first paint; the hook owns
all *subsequent* reads/writes.

## `useTheme` hook

```ts
// packages/client/src/theme/useTheme.ts
const STORAGE_KEY = 'tableverse:theme';
type Theme = 'light' | 'dark';

export interface ThemeState {
  /** The user's explicit override, or null if following the OS preference (per spec.md's non-goals, no UI is built to set this back to null -- exposed for completeness/testability, not wired to a control). */
  theme: Theme | null;
  setTheme: (theme: Theme) => void;
}

export function useTheme(): ThemeState {
  const [theme, setThemeState] = useState<Theme | null>(
    () => (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? null,
  );

  const setTheme = useCallback((next: Theme) => {
    localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.dataset.theme = next;
    setThemeState(next);
  }, []);

  return { theme, setTheme };
}
```

Deliberately does **not** call `matchMedia('(prefers-color-scheme: ...)')`
anywhere — the CSS media query in `global.css` already handles "no
explicit choice" entirely on its own; duplicating that logic in JS would
be redundant and a second place for it to drift out of sync with the CSS.

## `ThemeToggle` component and placement

```
packages/client/src/theme/ThemeToggle.tsx
```

A single button cycling `dark -> light -> dark`, reading/writing via
`useTheme()`. **Placement: rendered once in `App.tsx`, always visible**
regardless of which screen is showing (`IdentityGate`, `RoomEntry`, or
`ActiveRoom`/`RoomShell`) — not inside `RoomShell` specifically, since a
first-time visitor should be able to fix an uncomfortable theme before
they've even picked a nickname. This still satisfies spec.md's AC5 (never
inside a `BoardComponent`; App-level counts as platform chrome, same as
`IdentityGate`/`RoomEntry` already do — nothing here is game-specific).

## File layout

```
packages/client/
  index.html                # + inline no-flash theme script in <head>
  src/
    theme/
      useTheme.ts
      useTheme.test.ts        # jsdom unit test: localStorage + data-theme attribute mutation
      ThemeToggle.tsx
    styles/
      global.css               # + prefers-color-scheme block + [data-theme] override blocks
    App.tsx                    # + renders <ThemeToggle /> once, persistently
```

No changes to `packages/server`, `packages/game-core`, or any per-game
file — per spec.md's AC4, this is the whole point of the token layer.

## Testing / verification strategy

- `useTheme.test.ts` — unit-testable (unlike most of feature 003): mock
  `localStorage`, assert `setTheme('light')` writes the key and sets
  `document.documentElement.dataset.theme`; assert the hook's initial
  state reflects a pre-existing stored value.
- Everything else is `[manual]` per spec.md, verified via the browser
  preview tool: `preview_resize({ colorScheme: 'dark' | 'light' })` to
  emulate OS preference for AC1 (no stored override yet); click the
  toggle and `preview_inspect` computed colors before/after for AC2;
  reload with a stored preference set and confirm it beats an opposing
  emulated OS preference for AC3.

## Open risks

1. **Light-theme color values are a first design pass, not a final visual
   review.** The dark palette in feature 003's plan was chosen and will
   already be live in the app by the time this feature is implemented;
   the light values above are derived to have equivalent contrast/roles
   but haven't been eyeballed against the real rendered chrome yet.
   Task-level verification should include an actual screenshot review of
   the light theme, not just confirming the toggle mechanism works.
2. **`prefers-color-scheme: dark` is currently the implicit default**
   (base `:root`, unconditional) rather than being wrapped in its own
   `@media (prefers-color-scheme: dark)` block. This is intentional (dark
   is the fallback for browsers with no media-query support at all, per
   progressive enhancement), but means light-preferring users with no
   stored override get light correctly, while a hypothetical future third
   theme would need this default-fallback question re-decided.
