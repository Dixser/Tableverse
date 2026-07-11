# Feature 010 — i18n Support: Implementation Plan

## Inventory this plan is grounded against

Every file below was read directly (not guessed) to confirm its exact
current string literals before planning the translation-key extraction.

| File | Static strings | Dynamic/interpolated strings |
|---|---|---|
| `App.tsx` (`IdentityGate`) | `"Tableverse"`, `"Nickname"`, `"Continue"` | `{error}` (server-sourced, out of scope) |
| `App.tsx` (`RoomEntry`) | `"Create a room"`, `"Invite code"`, `"Join"` | `` `Welcome, ${user.displayName}.` ``, `` `Couldn't join room ${inviteCode}: ${message}` `` (latter is server-sourced, out of scope) |
| `App.tsx` (`renderScreen`) | `"Loading…"`, `"Joining room…"` | — |
| `theme/ThemeToggle.tsx` | `"Switch to light"` / `"Switch to dark"` | — (pattern to mirror, not translate) |
| `room/RoomShell.tsx` | `"Players"`, `"You"`, `"Leave room"`, `"Kick"`, `"Seats"`, `"Leave seat"`, `"Release"`, `"Allow multiple seats per player"`, `"Game"`, `"Select a game…"`, `"No games available yet."`, `"Start match"`, `"End match"` | `` `Room {inviteCode}` ``, `` `{m.role}` `` (raw enum), `` `Seat {playerID}: {occupant}` ``, `SeatPicker`'s `` `Seat {playerID}` `` |
| `room/SeatSwitcher.tsx` | `aria-label="Your seats"` | `` `Seat {playerID}` `` tab labels |
| `room/PresenceBadge.tsx` | `LABEL` map: `'Connected'`, `'Disconnected — reconnecting…'`, `'Disconnected — releasable'` | — |
| `gameMount/GameMount.tsx` | `"No game selected yet."`, `"Waiting for the match to start…"` | `` `Unknown game: {selectedGameID}` `` |
| `gameMount/GameoverBanner.tsx` | `"It's a draw."`, `'Game over.'` | `'You win!'`, `` `You and ${names} win!` ``, `` `${names} ${verb}!` `` (verb pluralized on winner count) |
| `game-core/.../tictactoe/BoardComponent.tsx` | none (`X`/`O` marks only) | — |

Out of scope per spec.md AC12: `useSession.ts`'s
`` `Identity request failed (${res.status})` `` and any `(err as
Error).message` surfaced into `error`/`actionError` state — these are
server/exception-sourced, not client literals, and stay untranslated.

## Library choice: `react-i18next` + `i18next`

Chosen (per the constitution's requirement to justify tradeoffs) over
alternatives:

- **`react-i18next`** is the most widely used React i18n binding, has
  first-class interpolation and `count`-based pluralization (needed for
  `GameoverBanner`, spec.md AC4) without hand-rolled plural logic, and
  integrates as a plain hook (`useTranslation()`) — consistent with this
  codebase's existing hook-first style (`useTheme`, `useSeatClients`), no
  Context/Provider boilerplate beyond the one-time `I18nextProvider` mount.
- Rejected: hand-rolling a flat `Record<string, string>` lookup. Would work
  for static labels but has no built-in pluralization/interpolation
  primitives, meaning `GameoverBanner`'s win/wins branching would need
  bespoke logic per language — exactly the kind of thing i18next already
  solves correctly.
- Rejected: `react-intl` (FormatJS). Comparable feature set, but heavier
  ICU-message-syntax learning curve for a two-language, chrome-only scope;
  `react-i18next`'s simpler `{{variable}}` interpolation and `_one`/`_other`
  plural key suffixes are a better fit for this codebase's size.

## File layout

```
packages/client/src/i18n/
  i18n.ts                  # i18next + react-i18next configuration/init
  locales/
    en.json                # English translation keys (source of truth for key names)
    es.json                # Spanish translations, mirrors en.json's key structure
  useLanguage.ts            # language-selection hook, mirrors theme/useTheme.ts
  useLanguage.test.ts
  LanguageToggle.tsx         # mirrors theme/ThemeToggle.tsx
  LanguageToggle.test.tsx

packages/client/index.html   # + pre-paint <script> for lang, alongside the existing theme one

packages/client/src/main.tsx # + import './i18n/i18n' before rendering <App />
```

## `i18n.ts` — configuration

```ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import es from './locales/es.json';

export const SUPPORTED_LANGUAGES = ['en', 'es'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, es: { translation: es } },
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React already escapes
});

export default i18n;
```

## `useLanguage.ts` — mirrors `useTheme.ts` exactly

Per spec.md AC7/Non-goals: plain hook, no Context, same `localStorage` +
direct-DOM-attribute shape `useTheme` already established.

```ts
import { useState, useCallback } from 'react';
import i18n, { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../i18n/i18n';

const STORAGE_KEY = 'tableverse:language';

function detectInitialLanguage(): SupportedLanguage {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && (SUPPORTED_LANGUAGES as readonly string[]).includes(stored)) {
    return stored as SupportedLanguage;
  }
  const browserLang = navigator.language.slice(0, 2);
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(browserLang)
    ? (browserLang as SupportedLanguage)
    : 'en';
}

function applyLanguage(lang: SupportedLanguage) {
  document.documentElement.lang = lang;
  i18n.changeLanguage(lang);
}

export function useLanguage() {
  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    const initial = detectInitialLanguage();
    applyLanguage(initial); // idempotent with index.html's pre-paint script
    return initial;
  });

  const setLanguage = useCallback((lang: SupportedLanguage) => {
    localStorage.setItem(STORAGE_KEY, lang);
    applyLanguage(lang);
    setLanguageState(lang);
  }, []);

  return { language, setLanguage };
}
```

Note: unlike `useTheme` (binary `light`/`dark`, cycled by one toggle
button), language has more than two values, so `LanguageToggle` is a small
`<select>`/button-group choosing among `SUPPORTED_LANGUAGES`, not a cycling
toggle — a structural difference from `ThemeToggle` justified by the
different arity, while keeping the hook/storage/DOM-write shape identical.

## `LanguageToggle.tsx`

```tsx
import { useLanguage } from './useLanguage';
import { SUPPORTED_LANGUAGES } from '../i18n/i18n';

const LANGUAGE_LABELS: Record<string, string> = { en: 'English', es: 'Español' };

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();
  return (
    <select
      aria-label="Language"
      value={language}
      onChange={(e) => setLanguage(e.target.value as typeof language)}
    >
      {SUPPORTED_LANGUAGES.map((lang) => (
        <option key={lang} value={lang}>
          {LANGUAGE_LABELS[lang]}
        </option>
      ))}
    </select>
  );
}
```

Language names in the switcher itself (`"English"` / `"Español"`) are
deliberately **not** translated — a language's own name is conventionally
shown in that language regardless of the currently active locale (so a
Spanish-reading user still sees `"English"` as an option, not a translated
gloss of it), matching how virtually every mainstream app's language picker
behaves.

Mounted in `App.tsx` next to the existing `<ThemeToggle />`, same
always-visible placement (spec.md AC7).

## `index.html` — pre-paint script addition

The existing theme flash-avoidance script stays untouched; a second,
independent inline script is added for language, reading the same
`tableverse:language` key `useLanguage.ts` uses:

```html
<script>
  (function () {
    var lang = localStorage.getItem('tableverse:language');
    if (lang) document.documentElement.lang = lang;
  })();
</script>
```

Left as `lang="en"` in the static HTML attribute when no stored preference
exists yet (matches `detectInitialLanguage`'s own `'en'` default) — this
script only needs to *override* the default when a preference is already
stored; first-visit browser-language detection happens in
`useLanguage`'s initial `useState` (client JS, not blocking paint), which is
an acceptable one-frame gap since a language flash is far less visually
jarring than a full-page color-scheme flash (unlike theme, no dedicated
pre-render detection logic is duplicated into the inline script).

## Translation key structure — `locales/en.json` / `es.json`

Flat, dot-namespaced by feature area, mirroring the component inventory
above:

```json
{
  "identity": {
    "title": "Tableverse",
    "nicknameLabel": "Nickname",
    "continue": "Continue"
  },
  "roomEntry": {
    "welcome": "Welcome, {{name}}.",
    "createRoom": "Create a room",
    "inviteCodeLabel": "Invite code",
    "join": "Join"
  },
  "app": {
    "loading": "Loading…",
    "joiningRoom": "Joining room…"
  },
  "room": {
    "title": "Room {{inviteCode}}",
    "players": "Players",
    "you": "You",
    "leaveRoom": "Leave room",
    "kick": "Kick",
    "seats": "Seats",
    "leaveSeat": "Leave seat",
    "release": "Release",
    "allowMultiSeat": "Allow multiple seats per player",
    "game": "Game",
    "selectGamePlaceholder": "Select a game…",
    "noGamesAvailable": "No games available yet.",
    "startMatch": "Start match",
    "endMatch": "End match",
    "seatLabel": "Seat {{playerID}}",
    "seatOccupied": "Seat {{playerID}}: {{occupant}}",
    "role": { "host": "Host", "member": "Member" }
  },
  "seatSwitcher": {
    "ariaLabel": "Your seats",
    "seatTab": "Seat {{playerID}}"
  },
  "presence": {
    "connected": "Connected",
    "gracePeriod": "Disconnected — reconnecting…",
    "released": "Disconnected — releasable"
  },
  "gameMount": {
    "noGameSelected": "No game selected yet.",
    "unknownGame": "Unknown game: {{gameID}}",
    "waitingForMatch": "Waiting for the match to start…"
  },
  "gameover": {
    "draw": "It's a draw.",
    "youWin": "You win!",
    "youAndOthersWin": "You and {{names}} win!",
    "othersWin_one": "{{names}} wins!",
    "othersWin_other": "{{names}} win!",
    "fallback": "Game over."
  }
}
```

`othersWin_one`/`othersWin_other` is i18next's plural-key-suffix
convention: `t('gameover.othersWin', { names, count: winnerIDs.length })`
picks the `_one` form when `count === 1`, `_other` otherwise — this is how
AC4's pluralization requirement is met without hand-written `verb`
branching. (Spanish also collapses to a two-form one/other plural system,
so no `_two`/`_few`/`_many` keys are needed for either supported language.)

`es.json` mirrors every key above with Spanish content (e.g.
`"title": "Sala {{inviteCode}}"`, `"othersWin_other": "{{names}} ganan!"`) —
full Spanish content is implementation work, not reproduced verbatim here;
translation accuracy is a review item during implementation (see
Non-goals: no machine translation).

## `GameoverBanner.tsx` rewrite

```tsx
import { useTranslation } from 'react-i18next';

function nameFor(id: string, playerNames: Record<string, string>, t: TFunction): string {
  return playerNames[id] ?? t('room.seatLabel', { playerID: id });
}

function formatNameList(names: string[]): string {
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
```

`formatNameList`'s own `', '`/`' and '` joiners stay as English-only glue
for now — no current AC requires localized list conjunctions (e.g. Spanish
"y" vs "and"), and `spec.md` scopes AC4 to the win/wins verb and the
sentence template, not list-joining grammar. Flagged as an open risk below
rather than silently over-scoped.

```ts
export function resolveGameoverMessage(
  gameover: unknown,
  playerID: string | null,
  playerNames: Record<string, string>,
  t: TFunction,
): string | null {
  if (!gameover || typeof gameover !== 'object') return null;
  const g = gameover as { winner?: string | string[]; draw?: boolean };
  if (g.draw === true) return t('gameover.draw');
  if (g.winner !== undefined) {
    const winnerIDs = Array.isArray(g.winner) ? g.winner : [g.winner];
    const iAmWinner = playerID !== null && winnerIDs.includes(playerID);
    const others = winnerIDs
      .filter((id) => id !== playerID)
      .map((id) => nameFor(id, playerNames, t));
    if (iAmWinner) {
      return others.length === 0
        ? t('gameover.youWin')
        : t('gameover.youAndOthersWin', { names: formatNameList(others) });
    }
    return t('gameover.othersWin', { names: formatNameList(others), count: winnerIDs.length });
  }
  return t('gameover.fallback');
}
```

`resolveGameoverMessage` gains a `t: TFunction` parameter (passed in from
`GameoverBanner`'s own `useTranslation()` call) rather than importing a
global `t` — keeps it a pure, independently unit-testable function (as it
already is today), just parameterized over translation instead of
hardcoded English, so existing tests can pass a fake `t` (e.g.
`i18next`'s own test instance, or a stub returning the key) without a real
i18next provider mounted.

## Other component conversions (mechanical, per the inventory table)

Each of `App.tsx`, `RoomShell.tsx`, `SeatSwitcher.tsx`, `PresenceBadge.tsx`,
`GameMount.tsx` gets `const { t } = useTranslation();` and every static/
interpolated string in the inventory table replaced with the corresponding
`t('key')` / `t('key', { ...values })` call. No component restructuring
beyond this substitution — this is intentionally the "mechanical" half of
the feature, contrasted with `GameoverBanner`'s pluralization logic.

`RoomShell`'s role display becomes
`t(`room.role.${m.role}`)` (dot-path built from the `RoomRole` enum value,
same lookup-table pattern `PresenceBadge` already uses structurally, just
expressed as nested translation keys instead of a local `LABEL` object).

## `main.tsx` wiring

```ts
import './i18n/i18n'; // side-effect: initializes i18next before first render
```

Added as the first import (before `App` renders), so `useTranslation()`
never runs before i18next is configured. No `<I18nextProvider>` wrapper is
strictly required (`react-i18next` falls back to the module-level `i18n`
singleton configured via `i18n.init()` if no provider is present), keeping
`App.tsx`'s existing render tree structurally unchanged — consistent with
this feature avoiding a Context/Provider pattern anywhere (Non-goals).

## Testing / verification strategy

- `useLanguage.test.ts` — mirrors `useTheme.test.ts`'s existing structure:
  detection from `localStorage`, detection from `navigator.language` when
  no stored value exists, fallback to `en` when neither matches a supported
  language, persistence on `setLanguage`, and confirmation
  `document.documentElement.lang` is written.
- `LanguageToggle.test.tsx` — renders the switcher, asserts the current
  language is selected, fires a change event, asserts `useLanguage`'s
  `setLanguage` was invoked with the new value.
- `GameoverBanner.test.tsx` — every existing row of the message table
  (spec.md AC4) re-verified in **both** `en` and `es`, using a real i18next
  instance initialized with both locale files in the test (not mocked),
  so a broken/missing Spanish key surfaces as a real test failure, not a
  silently-passing English fallback.
- New `i18n/localeParity.test.ts` — a small structural test asserting
  `en.json` and `es.json` have exactly the same set of keys (recursive key
  diff) — guards against a translator adding an English key without its
  Spanish counterpart (or vice versa) silently falling back to English at
  runtime unnoticed.
- Existing tests for `App.tsx`, `RoomShell.tsx`, `SeatSwitcher.tsx`,
  `PresenceBadge.tsx`, `GameMount.tsx` that currently assert on hardcoded
  English text are updated to assert on the `en.json` string (or import the
  key and assert via `t()`), not literal duplicated strings — avoids two
  sources of truth for English copy.
- Manual/browser verification: load the app fresh (no `localStorage`) with
  the browser set to Spanish, confirm the initial render is in Spanish;
  switch to English via the toggle, confirm every visible string updates
  without a reload; play a Tic-Tac-Toe match to a win and a draw in each
  language, confirming `GameoverBanner`'s pluralized/interpolated message
  reads correctly in both.

## File layout summary

```
packages/client/src/i18n/
  i18n.ts
  useLanguage.ts
  useLanguage.test.ts
  LanguageToggle.tsx
  LanguageToggle.test.tsx
  localeParity.test.ts
  locales/
    en.json
    es.json

packages/client/index.html      # + language pre-paint script
packages/client/src/main.tsx    # + import './i18n/i18n'
packages/client/src/App.tsx     # + useTranslation() throughout, + <LanguageToggle />
packages/client/src/room/RoomShell.tsx       # + useTranslation()
packages/client/src/room/SeatSwitcher.tsx    # + useTranslation()
packages/client/src/room/PresenceBadge.tsx   # + useTranslation(), LABEL -> t()
packages/client/src/gameMount/GameMount.tsx  # + useTranslation()
packages/client/src/gameMount/GameoverBanner.tsx        # + t param, per above
packages/client/src/gameMount/GameoverBanner.test.tsx   # + es-locale cases

# untouched:
packages/game-core/src/games/tictactoe/BoardComponent.tsx  # no translatable text (spec.md AC13)
packages/server/**                                          # no server changes
packages/shared/**                                           # no shared-type changes
```

## Open risks

1. **List-conjunction grammar (`formatNameList`'s `', '`/`' and '`) stays
   English-only.** No current acceptance criterion requires localizing "and"
   in a name list (e.g. Spanish "y"), and Spanish's list-conjunction rules
   are simple enough (no serial-comma ambiguity issue) that this is a minor
   authenticity gap, not a functional bug — a Spanish-reading user sees
   "Alice and Bob" with an English "and" mid-sentence. Flagged here rather
   than silently expanded into scope; a follow-up could move this into a
   `t('gameover.and')`-based join if it matters in review.
2. **`navigator.language` returning a region-qualified tag** (e.g. `es-MX`,
   `en-GB`) is handled by `.slice(0, 2)` before matching against
   `SUPPORTED_LANGUAGES` — confirmed sufficient for the two supported
   languages, but would need a more careful BCP-47 matching strategy if a
   future language needs region-specific variants (e.g. `pt-BR` vs `pt-PT`)
   — not needed for this feature's two-language scope.
3. **i18next's plural-suffix behavior for languages with more than two
   plural forms** (e.g. Arabic's six forms) is untested here since both
   supported languages use the simple one/other system — if a future
   language needs more plural categories, `gameover.othersWin`'s key
   structure already generalizes (i18next supports `_zero`/`_two`/`_few`/
   `_many` suffixes natively), so no redesign would be needed, just
   additional keys.
