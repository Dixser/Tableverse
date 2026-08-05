# Feature 030 — Sound Cues: Implementation Plan

## Two layers, one observer

| | Platform cues | Per-game cues |
|---|---|---|
| Events | seat became active; round ended; match ended | whatever the game says is notable |
| Source | `isActive`, `G.roundConfirm`, `ctx.gameover` | `G.log[].sound` |
| Game code required | none | one optional field per entry |
| Who hears it | turn/outcome: only the viewer it concerns. round: everyone | everyone, including spectators |

Both are consumed by a single hook, `useGameSounds(boardProps)`, so there is
one place that owns "when does a sound happen" and one place to reason about
replay safety.

## The contract addition

`packages/game-core/src/types.ts`, beside `GameoverResult` and
`GameLogEntry` — same status as both: a documented convention over `G`, not
something `GameModule`'s type enforces.

```ts
/**
 * Semantic sound cues the platform knows how to play. A game names what an
 * event MEANS; the platform owns what that means acoustically -- no game
 * ever names an audio file, a frequency, or a duration. Same convention as
 * ChatPanel's PLAYER_ID_PARAM_KEYS/COLOR_VALUE_PARAM_KEYS: the platform
 * knows a value's semantic role without knowing which game sent it, which
 * is what keeps tech-stack.md's "no branching on game identity" rule intact
 * while still letting a game drive game-specific behavior.
 */
export type SoundCue =
  | 'turn'
  | 'round'
  | 'win'
  | 'lose'
  | 'draw'
  | 'play'
  | 'success'
  | 'failure'
  | 'special';
```

```ts
export interface GameLogEntry {
  key: string;
  params?: Record<string, string | number>;
  /**
   * Cue to play the first time this entry is observed. Optional -- an
   * entry without it is silent, so no existing game needs migrating.
   *
   * MUST NOT be set on an entry describing the match ending: ctx.gameover
   * already drives 'win'/'lose'/'draw' centrally for every game, and
   * setting both fires two sounds in the same state update (see
   * spec.md's Resolved design decisions, and regicide/gameDef.test.ts's
   * guard).
   *
   * 'turn'/'round'/'win'/'lose'/'draw' are platform-emitted and should
   * not appear here; the union is kept closed rather than split in two,
   * since a second near-identical union is more confusing than the
   * convention.
   */
  sound?: SoundCue;
}
```

`packages/game-core/src/index.ts` gains `export type { SoundCue }`. Nothing
else in `game-core` changes, and `packages/server` is untouched — the field
is plain JSON-serializable data on a type the server already loads.

## Extracting `extractGameLogEntries` so two consumers can share it

`extractGameLogEntries` currently lives in and is exported from
`packages/client/src/chat/ChatPanel.tsx`. `useGameSounds` needs exactly the
same defensive filter, but importing it from `ChatPanel.tsx` would drag
`ChatPanel.module.css`, `useChat`, and `socket.io-client` into `GameMount`'s
import graph for a four-line pure function.

Move it to `packages/game-core/src/gameLog.ts` (pure, no React — it belongs
next to the `GameLogEntry` type it validates), export it from `index.ts`,
and have `ChatPanel.tsx` import and **re-export** it unchanged so
`ChatPanel.test.tsx`'s existing import keeps working with no edit to that
test file.

## Client: `soundPlayer` (module singleton)

`packages/client/src/sound/soundPlayer.ts`. No React, no Context — the same
module-singleton shape as `seatCredentialStore` and the i18n singleton.

```ts
interface CueSpec {
  /** Frequencies played in sequence, Hz. One entry = a single blip. */
  steps: number[];
  /** Seconds per step. */
  stepDuration: number;
  type: OscillatorType;
  /** Peak gain before the user's volume multiplier. */
  peak: number;
}

const CUES: Record<SoundCue, CueSpec> = {
  turn:    { steps: [880],                    stepDuration: 0.12, type: 'sine',     peak: 0.25 },
  round:   { steps: [587.33, 880],            stepDuration: 0.13, type: 'sine',     peak: 0.24 },
  win:     { steps: [523.25, 659.25, 783.99], stepDuration: 0.14, type: 'triangle', peak: 0.30 },
  // Same buzz as `failure`, longer and one step lower -- a defeat should
  // sound like the setback it is, not like a separate motif.
  lose:    { steps: [196.00, 155.56, 130.81], stepDuration: 0.26, type: 'sawtooth', peak: 0.30 },
  draw:    { steps: [440, 440],               stepDuration: 0.16, type: 'sine',     peak: 0.25 },
  play:    { steps: [660],                    stepDuration: 0.06, type: 'sine',     peak: 0.15 },
  success: { steps: [659.25, 987.77],         stepDuration: 0.10, type: 'triangle', peak: 0.28 },
  failure: { steps: [196.00, 155.56],         stepDuration: 0.18, type: 'sawtooth', peak: 0.22 },
  special: { steps: [784, 1046.5, 784],       stepDuration: 0.09, type: 'square',   peak: 0.20 },
};
```

Public surface, deliberately tiny:

```ts
export function playCue(cue: SoundCue): void;
export function setSoundSettings(settings: SoundSettings): void;
export interface SoundSettings { enabled: boolean; volume: number } // volume 0..1
```

Behavior:

- **Lazy context.** No `AudioContext` is constructed at module load.
  `playCue` calls an internal `getContext()` that creates one on first use
  and returns `null` when neither `AudioContext` nor `webkitAudioContext`
  exists — which is the case in `jsdom`, so **no `vitest.setup.ts` polyfill
  is needed** (unlike feature 027's `PointerEvent` situation) and every
  existing client test stays silent without opting out.
- **Autoplay unlock.** Browsers refuse to start an audio context before a
  user gesture, so a cue fired by the first state update after page load
  would be dropped. A one-shot `pointerdown`/`keydown` listener (registered
  lazily, `{ once: true }`, removed after firing) calls `context.resume()`.
- **Envelope, not a raw square edge.** Each step ramps gain up over ~10ms
  and down to near-zero before `stop()`, so cues don't click. Gain is
  `spec.peak * settings.volume`; `enabled === false` returns before any
  node is created.
- Settings are seeded from `localStorage` at module load and thereafter
  written by `useSoundSettings`, the same write-through relationship
  `useTheme` has with `document.documentElement.dataset`.

## Client: settings hook + toggle

`packages/client/src/sound/useSoundSettings.ts` — mirrors
`theme/useTheme.ts` in shape (module-level `STORAGE_KEY`, a `readStored()`
that returns a safe default rather than throwing, `useState` seeded from it,
a `useCallback` setter that writes `localStorage` **and** the side-effect
target **and** state).

```ts
const STORAGE_KEY = 'tableverse:sound';
const DEFAULT: SoundSettings = { enabled: true, volume: 0.6 };
```

`readStored()` `JSON.parse`s in a `try`/`catch` and validates both fields
(`typeof enabled === 'boolean'`, `volume` a finite number clamped to
`0..1`), falling back to `DEFAULT` on anything unexpected — a corrupt value
must not break the app, and unlike theme's plain `'light' | 'dark'` string
this key holds structured data, so it needs real parsing.

No pre-paint script in `index.html`: sound has no flash-of-wrong-state, so
the theme/language precedent of a `<head>` script does not apply.

`packages/client/src/sound/SoundToggle.tsx` (+ `.module.css`) — a checkbox
and an `<input type="range">`, structured like `ThemeToggle`. Rendered by
`menu/SettingsSection.tsx` next to `<LanguageToggle />` and
`<ThemeToggle />`, which is the single settings location both `AppMenu`'s
drawer and `RoomShell`'s drawer already embed.

## Client: `useGameSounds` — the observer

`packages/client/src/sound/useGameSounds.ts`, plus a colocated pure
`resolveGameoverCue`:

```ts
/** Mirrors GameoverBanner's resolveGameoverMessage read of the same
 * { winner?, draw? } shape -- `unknown` in, so a non-conforming game
 * degrades to null instead of crashing GameMount. */
export function resolveGameoverCue(
  gameover: unknown,
  playerID: string | null,
): 'win' | 'lose' | 'draw' | null;
```

Spectators (`playerID === null`) get `null`: there is no observer framing
for a stinger the way `GameoverBanner` has one for text.

```ts
export function useGameSounds(boardProps: BoardProps | null): void
```

Four independent effects, each keyed on a **primitive** — `boardProps` is a
freshly built object on every render (see `useSeatClients`'s
`boardProps` construction), so depending on it referentially would re-run
every render:

1. **Turn** — effect on `[isActive, playerID]`. A ref holds
   `{ seatID, wasActive }`. It plays only on a `false → true` edge **for
   the same `seatID`**; a first observation, or an observation whose
   `playerID` differs from the ref's, re-baselines silently and plays
   nothing (AC3). The `playerID` half is load-bearing: `SeatSwitcher`
   swaps which seat feeds `boardProps` without nulling it, so without this
   every seat switch would fire a spurious ping.
2. **Round** — effect on `roundConfirm != null`, read the same way
   `GameMount` already reads `G.roundConfirm` for `RoundConfirmBanner`.
   Plays on `false → true` only; a ref suppresses the intermediate updates
   as individual seats confirm, and the return to `null` when the next
   round deals is silent (AC13). A game with no `roundConfirm` field never
   leaves `false`, so Tic-Tac-Toe and Cahoots are silent with no special
   case. Not gated on `playerID` — this one fires for spectators too.
3. **Outcome** — effect on `resolveGameoverCue(...)`'s result. Plays once
   when it goes `null → non-null`; a ref suppresses repeats.
4. **Log** — effect on `entries.length`, with the entries themselves read
   from a ref updated each render (the `ChatPanel.stampedLog` idiom).
   A `heardCount` ref starts at `null`; on the first run it is set to the
   current length **without playing anything** (AC4 — the deliberate
   difference from `ChatPanel`, which does stamp its initial batch).
   Afterwards, `entries.slice(heardCount)` each play their `sound` if set.

**Reset.** Two triggers, belt and braces:

- `boardProps === null` resets every ref. `useSeatClients` nulls
  `boardProps` while tearing down and remounting `Client()`s, which is what
  a rematch does, so this is the primary path.
- `entries.length < heardCount` re-baselines silently. This covers any
  same-match reset without needing a `matchID` prop threaded into
  `GameMount`, which does not receive one today (AC6).

Called from `packages/client/src/gameMount/GameMount.tsx` as the first
statement, **above** its existing early returns, since hooks must run
unconditionally. `GameMount` is the right owner: it already renders
`GameoverBanner` from the very same `boardProps.ctx.gameover`, so the banner
and the stinger — the visual and audible halves of one event — stay
together, and `RoomShell`/`App.tsx` need no new props at all.

## Regicide

`packages/game-core/src/games/regicide/gameDef.ts` — five existing
`G.log.push(...)` calls gain a `sound` field. No new log entries, no rules
change, no `G` shape change:

| existing entry | cue | why |
|---|---|---|
| `regicide.log.cardsPlayed` | `play` | the routine action |
| `regicide.log.yielded` | `play` | the other routine action |
| `regicide.log.jesterPlayed` | `special` | one-shot, changes turn order |
| `regicide.log.enemyDefeated` | `success` | the core milestone |

Untouched, deliberately: `regicide.log.suffered`,
`regicide.log.matchWon`, `regicide.log.matchLostStuck`,
`regicide.log.matchLostDefense`.

The three terminal entries are all pushed alongside setting the
`G.matchResult` that `endIf` reads, so a cue here would double-fire
against the platform's own outcome stinger. `suffered` is uncued for a
different reason: discarding to absorb an attack is an ordinary turn cost
in Regicide, not a defeat, so it does not warrant a sound of its own —
what marks a defeat is the `lose` stinger, which is itself the buzz (see
`CUES` below) and which both loss paths already produce via
`ctx.gameover`.

## The rest of the catalog

Added after Regicide proved the shape. Every change is a `sound` field on
an existing `G.log.push` — no new log entries, no rules changes, no `G`
shape changes, and no new files.

`games/themind/gameDef.ts`:

| entry | cue |
|---|---|
| `theMind.log.cardPlayed` | `play` |
| `theMind.log.mistake` | `failure` |
| `theMind.log.shurikenProposed`, `...shurikenUsed` | `special` |

`games/loveletter/gameDef.ts`: all 13 card-play entries (the four
`cardPlayedNoTarget` sites, `spyPlayed`, `guardGuess`, `priestUsed`,
`baronUsed`, `handmaidUsed`, `princeUsed`, `kingUsed`, `chancellorUsed`,
`countessPlayed`, `princessPlayed`, `cardDiscarded`) → `play`;
`eliminated` → `failure`. A turn produces exactly one play entry — the
switch in `playCard` takes a single branch — so there is no intra-game
doubling; `eliminated` may accompany one, which is intended.

`games/cahoots/gameDef.ts`: `cardPlayed` → `play`; `goalCompleted` →
`success` **conditionally**, since only the mission-completing goal
collides:

```ts
sound: completed >= G.targetGoalCount ? undefined : 'success',
```

`games/crew/gameDef.ts` and `games/tictactoe/gameDef.ts`: **unchanged.**
Crew's every entry sits on a platform moment; Tic-Tac-Toe emits no log at
all. Crew's test file gains a guard asserting its log contains zero cued
entries after a completed trick.

`failure` now has two consumers (The Mind's `mistake`, Love Letter's
`eliminated`) and `success` two (Regicide's `enemyDefeated`, Cahoots'
`goalCompleted`) — every cue in the palette is used by at least one game
except `draw`, which only Tic-Tac-Toe can currently produce.

## i18n

New keys under a `sound.*` namespace in **both**
`packages/client/src/i18n/locales/en.json` and `es.json` (label, on/off
control, volume control). `localeParity.test.ts` fails the build if the two
key sets diverge, so this is self-enforcing. No `regicide.*` translation
key changes — `sound` is not a rendered param and never reaches `t()`.

## Files

```
spec/features/030-sound-cues/{spec,plan,tasks}.md          (new)

packages/game-core/src/types.ts                # + SoundCue, GameLogEntry.sound
packages/game-core/src/gameLog.ts              (new) extractGameLogEntries, moved
packages/game-core/src/gameLog.test.ts         (new) its existing branch coverage
packages/game-core/src/index.ts                # + SoundCue, extractGameLogEntries
packages/game-core/src/games/regicide/gameDef.ts       # + sound on 5 entries
packages/game-core/src/games/regicide/gameDef.test.ts  # + AC7 assertions

packages/client/src/sound/soundPlayer.ts               (new) + .test.ts
packages/client/src/sound/useSoundSettings.ts          (new) + .test.ts
packages/client/src/sound/useGameSounds.ts             (new) + .test.ts
packages/client/src/sound/resolveGameoverCue.ts        (new) + .test.ts
packages/client/src/sound/SoundToggle.tsx              (new) + .module.css + .test.tsx

packages/client/src/gameMount/GameMount.tsx    # + useGameSounds(boardProps)
packages/client/src/menu/SettingsSection.tsx   # + <SoundToggle />
packages/client/src/chat/ChatPanel.tsx         # import + re-export the moved helper
packages/client/src/i18n/locales/{en,es}.json  # + sound.*
```

## Testing / verification strategy

```bash
npm run test:unit
npm run typecheck
```

- `resolveGameoverCue.test.ts` — spec.md AC2, table-driven over win/lose/
  draw/multi-winner-array/cooperative-`{}`/spectator/`undefined`/malformed.
- `useGameSounds.test.ts` — AC3–AC6 and AC13, via `renderHook` +
  `rerender` with `vi.mock('./soundPlayer.js')` so assertions are on
  `playCue` calls, not audio. Covers: silent initial batch, append plays
  once, re-render with unchanged length plays nothing, multiple appends in
  one update, shrink re-baselines, `boardProps: null` resets, the
  `isActive` edge cases **including a `playerID` change carrying a
  `false → true` shape** (the seat-switch defect), and the `roundConfirm`
  `null → non-null → null` cycle plus the no-`roundConfirm`-field case.
- `soundPlayer.test.ts` — AC8/AC9 against a stubbed `AudioContext`
  (`vi.stubGlobal`) recording `createOscillator`/`createGain`/`start`/
  `stop`/`resume`; plus the `AudioContext`-undefined no-op path, which is
  the real jsdom default and must not throw.
- `useSoundSettings.test.ts` — AC10, modelled directly on the existing
  `useTheme.test.ts` (`localStorage.clear()` in `afterEach`), including the
  corrupt-JSON fallback.
- `SoundToggle.test.tsx` — AC11.
- `regicide/gameDef.test.ts` — AC7, the double-fire guard.
- Existing `GameMount`/`GameoverBanner`/`BoardComponent`/`ChatPanel` tests
  must pass **unmodified** (AC12) — proof the observer is side-effect only
  and the `extractGameLogEntries` move is transparent.

Then manual, via `.claude/launch.json`'s `server-dev` (8000) and
`client-dev` (5173), which is the only way to verify audio at all
(spec.md AC14–AC17): a two-session Regicide match for the cue set, the
round cue and the single-sound-at-match-end check; a mid-match reload for
the no-replay rule; the toggle/volume for immediacy and persistence; and a
solo multi-seat match cycling the seat switcher to confirm it stays silent.

**Baseline is green.** Feature 027's `tasks.md` records ~42 pre-existing
failures in `room/RoomShell.test.tsx` (feature-026-era "Next Level"
cases), but that note is now stale — those have since been fixed.
Measured on this branch before any change:
`npm run test:unit --workspace=packages/client` → **17 files, 171 tests,
all passing**, `RoomShell.test.tsx` included (43/43). So any failure this
feature introduces is a real regression, not inherited noise.

## Open risks

1. **Synthesized cues may simply sound bad in practice.** The frequency
   table above is a first draft chosen on paper, not by ear, and cannot be
   validated by any automated test — AC14's manual pass is the only real
   check. Expect to retune `CUES` after hearing it; this is confined to
   one constant and changes no contract. `round` and `turn` are the pair
   most at risk of sounding alike, since both are short sine blips in the
   same register; they may need pulling further apart by ear.
2. **Cue timing versus visual state is not synchronized.** A cue fires from
   a React effect after the state update that produced it, so it lands
   roughly with the re-render but with no guarantee. Fine for discrete
   cues; would need real thought if animation is ever driven off the same
   seam.
3. **Several cues can fire in one state update** (e.g. a Regicide move that
   both defeats an enemy and completes the match). They will overlap
   rather than queue, since each is an independent oscillator. Accepted:
   the alternative is a scheduler, which is more machinery than a casual
   board-game platform needs. Worth re-checking during AC14 — the round
   cue makes this slightly more likely, since a round ending and a game's
   own "level complete" log cue land in the same update.
4. **The `isActive` turn edge is only as good as boardgame.io's flag.** For
   a stage-based game like Regicide, entering the `defend` stage may or may
   not present as a `false → true` edge depending on how the engine reports
   activity mid-turn. AC14 is where this gets confirmed against the real
   engine rather than assumed from the type.

## Implementation-level non-goals

- No `vitest.setup.ts` change. Unlike feature 027's `PointerEvent`
  polyfill, the absent `AudioContext` is handled by `soundPlayer`'s own
  feature detection, which is behavior the product needs anyway (older
  browsers, hardened environments) rather than test-only scaffolding.
- No changes to `App.tsx`, `RoomShell.tsx`, `useSeatClients.ts`, or any
  `BoardComponent` — `GameMount` already receives everything the observer
  needs.
- No refactor of `ChatPanel`'s own `stampedLog` logic to share code with
  `useGameSounds`. The two look similar but differ in exactly the way that
  matters (ChatPanel stamps its initial batch; sound must not), so sharing
  would mean a flag parameter that obscures the one real distinction.
