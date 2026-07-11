# Feature 010 — i18n Support

## Description

Every user-visible string in the client is currently a hardcoded English
literal — static JSX text (`"Leave room"`, `"Start match"`), lookup tables
(`PresenceBadge`'s `LABEL` map), and dynamically constructed messages
(`RoomShell`'s `` `Seat {playerID}: {...}` ``, `GameoverBanner`'s winner
messages with name-list interpolation and win/wins pluralization). There is
no translation layer, no language switcher, and `index.html` hardcodes
`lang="en"`.

This feature adds `react-i18next` to `packages/client`, extracts every
platform-chrome string into translation keys for two languages (English,
Spanish), and adds a manual language switcher that mirrors feature 004's
theme-toggle pattern exactly: a plain hook (no React Context), a
`localStorage` key, and a pre-paint script in `index.html` to avoid a flash
of the wrong language, the same shape as `useTheme`/`ThemeToggle`.

Scope is platform chrome plus Tic-Tac-Toe's `GameModule`. In practice this
adds no translation work for Tic-Tac-Toe itself — its `BoardComponent`
renders only `X`/`O` marks (game symbols, not language-dependent copy) and no
other text — but it does mean this feature is the first to draw the
boundary of what a `GameModule` is expected to do for its own translatable
content, for whenever a future game (e.g. the Love Letter roadmap
candidate) actually has board text to translate.

Dynamic, interpolated, and pluralized strings are the hard part of this
feature, not the static labels: `GameoverBanner`'s winner messages combine a
formatted name list with a pluralized verb (`win` vs `wins`) depending on
winner count, and cannot be handled by flat key lookup — this requires
i18next's own interpolation and `count`-based pluralization features, not
string concatenation glued around translated fragments (concatenation
breaks for any language whose word order differs from English).

## User stories

### 1. A first-time visitor sees their browser's language automatically

As a new visitor with no stored language preference, the platform's initial
render uses my browser's language (`navigator.language`) if it's one of the
supported languages (English, Spanish), falling back to English otherwise —
the same "detect once, then respect an explicit override forever"
relationship feature 004 established between OS-level theme and the
in-app toggle.

### 2. A player manually switches languages

As a player, I can click a language switcher (mirroring the existing theme
toggle's placement and interaction pattern) to change the platform's
language at any time. My choice is persisted in `localStorage` and takes
effect immediately across every currently-rendered string, without a page
reload.

### 3. A returning visitor keeps their chosen language

As a returning visitor who previously picked a language (or had one
detected), the platform loads directly in that language on every future
visit — read from `localStorage`, applied before React's first render, the
same pre-paint approach `index.html`'s inline script already uses for
theme.

### 4. Dynamic, pluralized text translates correctly, not just static labels

As a player who just won or lost a Tic-Tac-Toe match, the gameover banner's
message — including the formatted list of winner names and the
singular/plural verb form ("Alice wins!" vs. "Alice and Bob win!") — renders
correctly in my selected language. This must not be built as English
sentence fragments concatenated around translated words, since that breaks
for languages with different word order or pluralization rules; it uses
i18next's interpolation/`count` features so the whole sentence is authored
per-language.

### 5. Every screen and state a player can reach is translated, not just the happy path

As a player, every string I can encounter — identity/nickname entry, room
creation/joining, error messages surfaced from validation (not
server-sourced runtime errors, see Non-goals), seat management, presence
status badges, the game selector, and the gameover banner — appears in my
selected language. No screen is "missed" and silently stuck in English.

## Acceptance criteria

1. `packages/client` depends on `react-i18next` and `i18next`; a single
   `i18n.ts` module configures both supported languages (`en`, `es`) with
   English as the fallback language for any missing key.
2. Every static string currently hardcoded in `App.tsx` (`IdentityGate`,
   `RoomEntry`, loading/joining states), `RoomShell.tsx`, `SeatSwitcher.tsx`,
   `PresenceBadge.tsx`, and `GameMount.tsx` (per the file-by-file inventory
   in plan.md) is replaced with a translation-key lookup (`t('...')`) — no
   bare English string literals remain in JSX in these files except values
   that are inherently not translatable content (see AC7/AC8, Non-goals).
3. Dynamic/interpolated strings — `RoomShell`'s `` `Room {inviteCode}` ``,
   `` `Seat {playerID}` ``/`` `Seat {playerID}: {occupant}` ``,
   `SeatSwitcher`'s `` `Seat {playerID}` `` tab labels — use i18next
   interpolation (`t('key', { value })`), not template-literal string
   concatenation around a translated fragment.
4. `GameoverBanner`'s `resolveGameoverMessage` is rewritten to route every
   branch (draw, sole winner, co-winner, non-winner naming one or more
   winners, unrecognized-shape fallback) through `t()` with i18next's
   `count`-based pluralization for the win/wins verb form and interpolation
   for the formatted name list — verified by a dedicated test per branch,
   in both languages, per plan.md's table (this is the acceptance bar that
   distinguishes this feature from a mechanical find-and-replace of static
   labels).
5. `PresenceBadge`'s `LABEL` lookup table (`connected` / `grace_period` /
   `released`) is converted to translation keys, one per `SeatPresenceStatus`
   value, in both languages.
6. `RoomShell`'s room-role display (currently the raw `m.role` enum value
   rendered unstyled, e.g. "host") is translated via a lookup table, the
   same pattern as `PresenceBadge`, rather than left as a raw untranslated
   enum string.
7. A language switcher component (e.g. `LanguageToggle`), structurally
   mirroring `ThemeToggle`/`useTheme` (plain hook, no Context/Provider,
   `localStorage` key `tableverse:language`, direct
   `document.documentElement.lang` attribute write instead of
   `dataset.theme`), is mounted in `App.tsx` at the same always-visible
   level as `ThemeToggle` — visible on every screen, including before a
   nickname is chosen.
8. On first visit with no stored language preference, the initial language
   is derived from `navigator.language`, matched against the supported
   language list (`en`, `es`), defaulting to `en` if no match. Once a user
   has an explicit stored preference (from either detection or a manual
   switch), it is never overwritten by re-detection on a later visit.
9. `index.html` gains an inline pre-paint script (alongside the existing
   theme one) that reads the stored language from `localStorage` and sets
   `document.documentElement.lang` before React's first render, avoiding a
   flash of the wrong `lang` attribute — mirroring the existing theme
   flash-avoidance script structurally, not merged into it.
10. Switching languages via the toggle re-renders every currently-visible
    string immediately, with no page reload — verified by a test that
    renders a component tree with visible chrome strings, fires the
    language switch, and asserts the rendered text changes language without
    unmounting/remounting the tree.
11. Game catalog content (a `GameModule`'s `displayName`, e.g.
    "Tic-Tac-Toe") is explicitly out of scope for translation in this
    feature — game metadata strings are per-game content, not platform
    chrome, and remain as-authored regardless of selected language (see
    Non-goals).
12. Server-sourced error/message strings (anything rendered from
    `(err as Error).message` or a raw server response body, e.g.
    `useSession.ts`'s `` `Identity request failed (${res.status})` `` or
    `roomApi`-surfaced errors in `App.tsx`/`RoomShell.tsx`'s `error`/
    `actionError` state) are explicitly out of scope — translating them
    would require the server to adopt an error-code contract instead of
    freeform messages, which this feature does not build (see Non-goals).
13. Tic-Tac-Toe's `BoardComponent` requires zero code changes — confirmed by
    leaving `packages/game-core/src/games/tictactoe/BoardComponent.tsx`
    untouched, since it renders only `X`/`O` game marks and no translatable
    text.

## Non-goals

- **Translating server-sourced error/status messages.** These originate as
  freeform strings from `roomApi`/server responses, not client literals.
  Making them translatable would require the server to return stable error
  codes that the client maps to translated messages — a server-side
  contract change out of scope here. Accepted degradation: these remain
  English (or whatever the server returns) regardless of selected language.
- **Translating game-catalog content** (`GameModule.displayName`, and any
  future game's own in-board text beyond what this feature's scope covers).
  Per-game content is owned by that game's `GameModule`, not platform
  chrome; Tic-Tac-Toe happens to need none today (AC13).
- **Languages beyond English and Spanish.** The translation-key
  infrastructure this feature builds generalizes to more languages trivially
  (one more locale file), but authoring/reviewing additional translated
  content is separate follow-up work, not blocked on anything here.
- **Automatic/machine translation.** Both languages' translation files are
  hand-authored content, not generated via a translation API — accuracy of
  Spanish phrasing is a review responsibility for this feature's
  implementation, not delegated to tooling.
- **RTL layout support.** Neither supported language is right-to-left;
  RTL-aware CSS is not addressed by this feature and would need its own
  design pass if a RTL language is ever added.
- **URL-based locale routing** (e.g. `/en/room/...`, `/es/room/...`). The
  client has no router at all (`routing.ts` is a hand-rolled
  `pathname`-regex module for invite codes only, confirmed in plan.md) —
  language selection stays client-side state (`localStorage` +
  `document.documentElement.lang`), matching how theme selection already
  works, not a URL concern.
- **A React Context/Provider for language state.** Deliberately following
  `useTheme`'s existing precedent of a plain hook with a module-level
  `localStorage` key and direct DOM attribute writes — introducing Context
  here would be an unrequested architectural divergence from the one
  existing precedent this feature is explicitly modeled on.
- **Translating accessibility-only strings that aren't also visible copy**
  beyond what's already covered by AC2-AC6 (e.g. `SeatSwitcher`'s
  `aria-label="Your seats"` is in scope as it's screen-reader-visible copy,
  but no new ARIA strings are introduced by this feature beyond what
  already exists).
