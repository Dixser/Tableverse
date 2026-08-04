# Feature 030 — Sound Cues

## Description

The platform is entirely silent. There is no `Audio`, no `AudioContext`, no
sound library, and not one binary asset anywhere in the repo — a player gets
no non-visual feedback for anything at all. A seat becoming active, a match
ending, or a notable in-game event all pass unnoticed unless the player
happens to be looking at the right part of the screen at the right moment.

This feature adds short synthesized sound cues, split across two layers that
are genuinely different problems and are therefore solved differently:

1. **Platform cues** — "it's your turn", "the round ended, confirm to
   continue", "you won", "you lost", "it's a draw". These are derived
   entirely from state the platform already reads (`isActive`,
   `G.roundConfirm`, `ctx.gameover`). **No `GameModule` writes a line of
   code to get them**, exactly as no game writes gameover UI to get
   `GameoverBanner` (feature 009).

   The selection rule for this layer: **a platform cue belongs to a moment
   a shared platform component already renders.** `GameoverBanner` and
   `RoundConfirmBanner` are each rendered by `GameMount` for every game
   that reaches those states, so both are shared moments by construction —
   cueing them adds sound to something the platform already announces
   visually. The turn cue is the deliberate exception: nothing renders
   turn-start today, and that absence is the gap this feature exists to
   close, not a reason to skip it.
2. **Per-game cues** — events only that game understands: Regicide
   defeating an enemy or suffering damage, The Mind's misplay, Love
   Letter's elimination. These are declared by the game itself.

Both naive designs for layer 2 are unsound, not merely inelegant, and the
reasons are already written down elsewhere in this repo:

- **A `switch (gameID)` in client code is forbidden.** tech-stack.md's
  "Game module contract" states that nothing in `packages/server` or
  `packages/client` may branch on a specific game's identity; all
  game-specific behavior must be reachable only through the contract.
  Feature 026 exists partly to demonstrate that rule holding under
  pressure.
- **A move may not emit sound as a side effect.** boardgame.io moves are a
  deterministic reducer that is *replayed* to reconstruct state (on
  reconnection sync, for instance), with no live socket attached. A move
  that pushed a sound out-of-band would double-fire on every replay or
  silently do nothing — the identical argument
  `spec/features/012-chat/plan.md` makes for why chat's game-status
  messages live in `G` and not a side channel, and the same category of
  constraint tech-stack.md already states for randomness.

The mechanism that survives both objections already exists and is already
populated. Every game appends `GameLogEntry` values to a reserved
`G.log` array that is append-only, public-only, and replay-safe by
construction (feature 012). Regicide alone already emits
`regicide.log.enemyDefeated`, `regicide.log.suffered`,
`regicide.log.jesterPlayed`, `regicide.log.cardsPlayed` and
`regicide.log.yielded` — precisely the events worth hearing. So this
feature adds **one optional typed field to `GameLogEntry`** rather than
inventing a parallel event system, a second reserved field on `G`, or a
fourth registration point (feature 011 already observes that three is one
more than it wanted).

Deliberately scoped narrower than "audio for the platform": only Regicide
populates per-game cues here. The contract serves all six games, but per
the precedent set by features 009, 015 and 027, a shared shape is
validated against a real consumer rather than designed speculatively for
six at once — and cue selection for a game is a judgement call about that
game, not plumbing.

## Resolved design decisions

Called out up front since they shape every acceptance criterion below.

- **Synthesized WebAudio, not audio files** (per user decision). A small
  `soundPlayer` module generates each cue from oscillators. This keeps the
  repo's zero-binary-asset property, needs no licensing or sourcing step,
  has no decode latency or network fetch, and is testable against a stubbed
  `AudioContext` with no fixture files. The cost accepted is character:
  short synthesized tones, not authored sound design. Replacing them with
  real files later is a change confined to `soundPlayer.ts`, because no
  game and no other client module ever names a sound — only a cue.
- **Games declare a semantic cue, never a sound.** `SoundCue` is a closed
  union (`'turn' | 'round' | 'win' | 'lose' | 'draw' | 'play' |
  'success' | 'failure' | 'special'`). A game says an event *means* "a setback"; the
  platform decides what a setback sounds like. This is the same "platform
  knows the param's semantic role, not which game sent it" convention
  `ChatPanel` already uses for `PLAYER_ID_PARAM_KEYS` and
  `COLOR_VALUE_PARAM_KEYS`, and it is what keeps platform code free of any
  game identity: the client reads a typed field, never an `entry.key`
  prefix. (Note `ChatPanel` does currently special-case
  `key.endsWith('.eliminated')` for styling; this feature deliberately does
  not copy that, since the typed field makes it unnecessary.)
- **`sound` is never set on a log entry that describes the match ending.**
  `ctx.gameover` already drives win/lose/draw centrally for every game, so
  a cue on e.g. `regicide.log.matchWon` would fire a second sound on top of
  the platform's own stinger. This is a real trap rather than a
  hypothetical: Regicide pushes `matchWon`/`matchLostStuck`/
  `matchLostDefense` alongside setting the `G.matchResult` its `endIf`
  reads, so both would fire in the same state update. AC7 is the
  regression guard.
- **The turn cue fires only for the currently focused seat** (per user
  decision). tech-stack.md's multi-seat section foreshadows notifications
  on a *non*-focused seat, and the machinery would support it
  (`useSeatClients` holds live state for every claimed seat), but solo play
  is a first-class citizen here — one user claiming every seat is an
  explicitly supported mode, and that user would otherwise hear a turn ping
  on literally every turn of the match. Reading `boardProps.isActive` (the
  active seat's) is both the quieter behavior and the simpler wiring.
- **`isActive` is the turn signal, not `ctx.currentPlayer`.** It is
  boardgame.io's own per-seat "may act now" flag, so it is automatically
  correct across all three turn styles in the catalog: flat alternating
  (Tic-Tac-Toe), custom `TurnOrderConfig` that skips eliminated/phantom
  seats (every real game), and stage-based (Regicide's `defend`). It is
  also correctly **silent** for The Mind, where `ActivePlayers.ALL` keeps
  every seat permanently active so no `false → true` transition ever
  occurs — a turnless game should not have a turn sound, and this falls out
  of the design rather than needing a special case.
- **The round cue fires on `G.roundConfirm` going `null → non-null`.**
  That is exactly when `RoundConfirmBanner` appears, and
  `roundConfirm.ts` guarantees the shape: `null` when no wait is in
  progress, a `RoundConfirmState` while one is. Four of the six games
  already use it (Love Letter, Regicide, Crew, The Mind), so this one
  signal covers most of the catalog with no game code — and it is the
  only platform cue The Mind ever produces, which is a better fit for a
  turnless cooperative game than a turn ping would have been. Unlike the
  outcome cue this fires for **spectators too**, since a round ending is a
  fact about the table rather than about the viewer.
- **No cue when the last seat confirms and play resumes.** Considered and
  rejected: it would land in the same instant as the turn cue that
  immediately follows it for whichever seat acts next, so the two would
  overlap into one indistinct noise. The round-*start* moment is already
  served by the turn cue.
- **The turn cue re-baselines when the focused seat changes.** Not just on
  match teardown. `SeatSwitcher` swaps which seat feeds `boardProps`
  without ever nulling it, so a switch from a seat with `isActive: false`
  to one with `isActive: true` would otherwise read as a genuine
  `false → true` edge and ping spuriously on every seat switch — precisely
  the multi-seat noise the focused-seat-only decision above exists to
  avoid, arriving by a different route. The observer therefore keys its
  previous-`isActive` memory on `boardProps.playerID` and treats a changed
  seat as a fresh first observation. AC3 covers this.
- **A spectator hears no outcome cue.** `GameoverBanner` shows a spectator
  an observer-framed message (feature 009 story 2), but there is no
  observer framing available for a stinger — a "you won" chime is simply
  wrong for someone who did not play. Spectators still hear every public
  `G.log` cue, since those describe the table, not the viewer.
- **Sound preferences are a per-user client preference, stored in
  `localStorage`**, not `Room.gameSettings` and not the `User` record.
  This matches theme (`tableverse:theme`) and language
  (`tableverse:language`) exactly; `User` stays `{ id, displayName,
  createdAt }` per tech-stack.md's deliberately minimal Phase 1 identity.
- **No React Context is introduced.** There is currently no `createContext`
  anywhere in `packages/client` or `packages/game-core`. The established
  mechanism for a cross-cutting client concern is a module singleton plus a
  hook (i18n, `seatCredentialStore`, `useTheme`), and this feature follows
  it rather than making sound the first `Provider` in the codebase.

## User stories

### 1. Knowing it is my turn without watching the screen

As a seated player, when my seat becomes able to act I hear a short cue, so
I can look away during other players' turns without missing mine.

### 2. Hearing how the match ended

As a seated player, when the match ends I hear a cue that distinguishes
winning from losing from a draw, matching the banner I am shown — and I
hear exactly one sound, not one for the outcome and another for the game's
own "match over" log entry.

### 3. A game giving its own events meaning

As a seated player or spectator in a Regicide match, I hear distinct cues
for defeating an enemy, suffering damage, and playing the Jester — events
that matter in Regicide specifically and that no other game shares.

### 4. Every game gets the platform layer for free

As a developer, adding a new `GameModule` to the catalog requires writing
no sound code at all to get turn, round-confirm and win/lose/draw cues,
and adding a per-game cue means setting one optional field on a log entry
the game already emits — no new file, no new registration point, and no
change to any platform module.

### 5. Reconnecting mid-match does not replay the match's sounds

As a player who reloads the page or reconnects partway through a match, I
hear nothing for the events I missed — the whole `G.log` history arrives at
once on sync, and playing it back would be a burst of noise describing
things that already happened.

### 6. Turning it off

As a player who does not want sound, I can switch it off (or lower its
volume) from the same settings panel that holds the theme and language
controls, and my choice persists across reloads and applies immediately
without restarting a match.

### 7. A turnless game stays quiet

As a player of The Mind, where every seat is permanently active and there
are no turns at all, I never hear a turn cue — the absence is correct
behavior, not a missing feature. What I hear instead is the level ending
(story 8) and The Mind's own card-played and misplay cues, which carry far
more information than a turn ping would.

### 8. Hearing a round end

As a player of any game that waits for confirmation between rounds (Love
Letter, Regicide, Crew, The Mind), I hear a cue at the moment the
confirmation banner appears, so a round ending while I am looking
elsewhere does not leave the table waiting on me.

### 9. Switching seats does not ping me

As a player holding several seats, switching the focused seat with the
seat switcher never fires a turn cue by itself — I only hear it when a
seat genuinely becomes active, not as an artifact of changing which seat
I am looking at.

## Acceptance criteria

`[unit]` denotes a Vitest test of a pure function or hook in isolation.
`[component]` denotes a test of a mounted React component.
`[manual]` denotes verification against the real dev server in a browser,
since audio output cannot be observed from `jsdom` or a screenshot.

1. `[unit]` `SoundCue` and the optional `GameLogEntry.sound` field are
   exported from `@tableverse/game-core`, and `packages/server` still
   imports `gamesCatalog` without pulling in any client or React code —
   the field is plain data, changing nothing about what the server loads.
2. `[unit]` `resolveGameoverCue(gameover, playerID)` returns `'draw'` for
   `{ draw: true }`, `'win'` when `playerID` is among `winner` (single
   value or array), `'lose'` when `gameover` is set and `playerID` is not
   among the winners (including the no-winner-no-draw cooperative loss
   shape `{}` that The Mind and Regicide produce), and `null` for a
   spectator (`playerID: null`), for `undefined`/`null`, and for a
   **non-object** `gameover` (a string, a number) — returning `null`
   rather than throwing, the same defensive posture
   `resolveGameoverMessage` already takes. Note an *object* carrying
   neither `winner` nor `draw` resolves to `'lose'`, not `null`: that is
   exactly the shape a cooperative loss uses, so it is by construction
   indistinguishable from an unrecognized object shape, and "the match
   ended without me winning" is the safe reading of both.
3. `[unit]` The turn cue plays when the observed `isActive` transitions
   `false → true`, and does not play on `true → true`, on `true → false`,
   or on the observer's very first observation of an already-active seat
   (a player reconnecting into their own live turn should not be pinged by
   the reconnect itself). It also does not play when `boardProps.playerID`
   changes — a seat switch re-baselines rather than reading the new seat's
   `isActive` as an edge from the old seat's (story 9), including the
   `false → true` shape that would otherwise ping on every switch.
4. `[unit]` Log entries already present the first time the observer sees a
   match are recorded as heard and play **nothing** (story 5). This is a
   deliberate difference from `ChatPanel`'s `stampedLog`, which stamps its
   initial batch — correct for rendering history, wrong for sound.
5. `[unit]` A newly appended log entry carrying `sound` plays that cue
   exactly once, even across re-renders that do not change the log's
   length; an appended entry with no `sound` field plays nothing; and
   several entries appended in one update each play their own cue.
6. `[unit]` A `log` array shorter than the last observed length (a rematch
   resetting it) re-baselines silently rather than replaying it as new —
   verified without threading a `matchID` prop into `GameMount`, which
   does not receive one today.
7. `[unit]` In Regicide's `gameDef.test.ts`: `cardsPlayed` and `yielded`
   carry `'play'`, `jesterPlayed` carries `'special'`, `enemyDefeated`
   carries `'success'`, and `suffered` carries `'failure'`; and
   `matchWon`, `matchLostStuck` and `matchLostDefense` carry **no** `sound`
   field at all (the double-fire guard from "Resolved design decisions").
8. `[unit]` `soundPlayer` plays a cue by creating and starting an
   oscillator against a stubbed `AudioContext`; plays nothing when
   settings are disabled; scales output gain by the configured volume; and
   is a silent no-op (no throw) when `AudioContext` is undefined entirely,
   which is the case in this project's `jsdom` test environment and means
   no `vitest.setup.ts` polyfill is required.
9. `[unit]` `soundPlayer` does not construct an `AudioContext` at module
   load, and calls `resume()` once on the first user gesture — required
   because browsers refuse to start an audio context before one, so a cue
   fired by the very first state update after page load would otherwise be
   silently dropped.
10. `[unit]` `useSoundSettings` reads and writes a single `localStorage`
    key `tableverse:sound`, defaults to enabled at a sensible volume when
    the key is absent, tolerates a corrupt/unparseable stored value by
    falling back to the default instead of throwing, and writes its values
    through to the `soundPlayer` singleton — structurally mirroring
    `useTheme`'s existing shape and its own test file.
11. `[component]` `SoundToggle` renders inside `SettingsSection` alongside
    the existing `LanguageToggle` and `ThemeToggle`, exposes an on/off
    control and a volume control, and both are labelled from i18n keys
    present in **both** `en.json` and `es.json` (enforced automatically by
    the existing `localeParity.test.ts`).
12. `[component]` `GameMount` still renders exactly as it does today with
    sound enabled or disabled — the observer is a side effect only, and
    `BoardComponent.test.tsx`'s existing "no chrome" assertion and every
    existing `GameMount`/`GameoverBanner` test pass unmodified.
13. `[unit]` The round cue plays when `G.roundConfirm` transitions
    `null → non-null`, does not play while it stays non-null as individual
    seats confirm, does not play when it returns to `null` as the next
    round begins, and never plays at all for a game whose `G` has no
    `roundConfirm` field (Tic-Tac-Toe, Cahoots). It plays for a spectator
    as well as a seated player, unlike the outcome cue.
14. `[manual]` A real two-session Regicide match: the turn cue fires on
    handover, `success` on defeating an enemy, `failure` on suffering
    damage, `special` on the Jester, the round cue when the confirm banner
    appears, and exactly one sound at match end.
15. `[manual]` Reloading a browser mid-match replays no historical sounds
    (story 5), and starting a rematch does not replay the previous match's
    log.
16. `[manual]` Toggling sound off silences everything immediately without
    reloading or restarting the match; the setting and the chosen volume
    survive a page reload.
17. `[manual]` In a solo match with several seats claimed, cycling the seat
    switcher fires no turn cue on its own (story 9) — the regression check
    for the defect this behavior exists to prevent.

## Non-goals

- **Per-game cues for Tic-Tac-Toe, Love Letter, The Mind, Crew or
  Cahoots.** The contract serves them and they need no migration — an
  entry without `sound` is simply silent. Choosing cues for each is a
  per-game judgement call, deferred rather than guessed at here; Regicide
  is this feature's one real consumer, per features 009/015/027's
  precedent.
- **A private, per-viewer sound channel.** Love Letter's `privateReveals`
  is already `GameLogEntry[]` filtered by `playerView`, so the same
  `sound` field would work there unchanged — but no game needs a you-only
  cue today, and wiring a second observer for a consumer that does not
  exist is the speculative design this repo consistently refuses.
- **Turn cues on background (non-focused) seats.** See "Resolved design
  decisions"; the state needed is available in `useSeatClients` if this is
  ever wanted.
- **Per-category volume, sound packs/themes, or user-supplied audio.** One
  on/off toggle and one volume control; no one has asked for more
  granularity and each extra control is more settings surface plus more
  i18n keys.
- **Server-side or per-room sound settings.** Sound is a per-user client
  preference like theme and language, not shared room configuration, so
  `Room.gameSettings`, `settingsSchema` and the `User` record are all
  untouched.
- **Haptics, desktop notifications, or animation.** All would ride the
  same `G.log` seam this feature establishes, and all are separate
  features with their own permission and accessibility questions.
- **Music, ambient loops, or any continuous audio.** Short discrete cues
  only — consistent with tech-stack.md's "no built-in continuous-time
  simulation": there is no ticking clock to synchronize a loop against.
- **Replacing `ChatPanel`'s `key.endsWith('.eliminated')` styling
  special-case** with the typed-field approach this feature introduces.
  Tempting and arguably now inconsistent, but it is feature 012's code and
  a rendering concern, out of scope here.
