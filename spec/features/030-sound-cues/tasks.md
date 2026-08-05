# Feature 030 — Sound Cues: Tasks

Ordered so each task is independently verifiable and nothing is built
against a contract that does not yet exist. The `game-core` contract
lands first (tasks 1-2) because both the client observer and Regicide
depend on it. `soundPlayer` (task 3) comes before everything that calls
it, so later tests can mock a module that already has its real shape.
The settings hook and toggle (tasks 4-5) are deliberately sequenced
*before* the observer, so that the very first time a cue can fire there
is already a way to turn it off. Regicide (task 7) comes last of the
code changes, since it is the proof that the finished contract works
end-to-end without touching platform code. Manual verification (task 9)
is unavoidably last — audio cannot be checked from `jsdom`.

- [x] 1. Add `SoundCue` and the optional `GameLogEntry.sound` field to
      `packages/game-core/src/types.ts`, exported from `index.ts`.
      **Verify:** `npm run typecheck` passes across all packages with no
      other change; `npm run test:integration --workspace=packages/server`
      still boots the server, proving the catalog stays server-safe
      (spec.md AC1).

- [x] 2. Move `extractGameLogEntries` from `chat/ChatPanel.tsx` into a new
      `packages/game-core/src/gameLog.ts` with its own `gameLog.test.ts`;
      re-export it from `ChatPanel.tsx` so existing importers are
      unaffected.
      **Verify:** `ChatPanel.test.tsx` passes **unmodified**, including its
      existing `extractGameLogEntries` table tests (spec.md AC12).

- [x] 3. Build `packages/client/src/sound/soundPlayer.ts` — the `CUES`
      table, lazy `getContext()`, the one-shot autoplay-unlock listener,
      the gain envelope, and `setSoundSettings`.
      **Verify:** `soundPlayer.test.ts` covers cue → oscillator calls
      against a stubbed `AudioContext`, silence when disabled, volume
      scaling, no context constructed at module load, `resume()` on first
      gesture, and a clean no-op when `AudioContext` is undefined
      (spec.md AC8, AC9).

- [x] 4. Build `useSoundSettings.ts` against `localStorage` key
      `tableverse:sound`, modelled on `theme/useTheme.ts`.
      **Verify:** `useSoundSettings.test.ts` (modelled on the existing
      `useTheme.test.ts`) covers default-when-absent, round-tripping,
      write-through to `setSoundSettings`, and the corrupt-JSON fallback
      (spec.md AC10).

- [x] 5. Build `SoundToggle.tsx` + `.module.css` and render it in
      `menu/SettingsSection.tsx`; add `sound.*` keys to `en.json` and
      `es.json`.
      **Verify:** `SoundToggle.test.tsx` asserts both controls render and
      drive the hook; `localeParity.test.ts` passes, proving en/es key
      sets did not diverge (spec.md AC11).

- [x] 6. Build `resolveGameoverCue.ts` and `useGameSounds.ts` (four
      primitive-keyed effects — turn, round, outcome, log — the
      `heardCount`-starts-at-`null` baseline, and both reset triggers),
      and call the hook from `gameMount/GameMount.tsx` above its early
      returns. The turn ref must key on `{ seatID, wasActive }`, not
      `wasActive` alone.
      **Verify:** `resolveGameoverCue.test.ts` (spec.md AC2) and
      `useGameSounds.test.ts` (AC3-AC6, AC13) pass with `playCue` mocked
      — including the seat-switch case, where a changed `playerID`
      carrying a `false → true` shape must fire nothing; every existing
      `GameMount`, `GameoverBanner` and `BoardComponent` test passes
      unmodified (AC12).

- [x] 7. Add `sound` to Regicide's five non-terminal log entries in
      `games/regicide/gameDef.ts`.
      **Verify:** `regicide/gameDef.test.ts` asserts the five mappings and
      that `matchWon`/`matchLostStuck`/`matchLostDefense` carry no `sound`
      at all — the double-fire guard (spec.md AC7). Regicide's
      conformance suite still passes, confirming `G` stays
      JSON-serializable.

- [x] 8. Full suite and typecheck.
      **Verify:** `npm run test:unit && npm run typecheck`. The
      `packages/client` baseline measured on this branch before any
      change was **17 files / 171 tests, all green** — note this
      supersedes feature 027's task 6, which recorded ~42 pre-existing
      `RoomShell.test.tsx` failures that have since been fixed. Any
      failure here is therefore a real regression, not inherited noise.

- [x] 9. Manual browser verification via `.claude/launch.json`'s
      `server-dev` (8000) and `client-dev` (5173).
      **Verify:** a two-session Regicide match confirms the turn ping on
      handover, `success` on `enemyDefeated`, `failure` on `suffered`,
      `special` on the Jester, the round cue when the confirm banner
      appears, and exactly one sound at match end (spec.md AC14); a
      mid-match reload and a rematch replay no historical sounds (AC15);
      the toggle silences immediately and the volume persists across a
      reload (AC16); a solo multi-seat match cycling the seat switcher
      stays silent (AC17). Retune the `CUES` table by ear if needed —
      plan.md's open risk 1 — and re-check open risks 3 (overlapping
      cues in one update) and 4 (whether Regicide's `defend` stage
      presents as an `isActive` edge).

## Verification record

Automated (task 8): `npm run test:unit` → shared 24, game-core 546,
client 240 = **810 passing**, 0 failing. `npm run typecheck` clean,
`eslint` clean on every touched path. The client suite went 17 files/171
tests → 23/240. Note this supersedes feature 027's task 6: its ~42
pre-existing `RoomShell.test.tsx` failures no longer exist — that file
was green (43/43) on a clean checkout of this branch before any edit.

Browser (task 9), two real sessions against `server-dev`/`client-dev` —
`localhost:5173` as host "SoundTester" and `127.0.0.1:5173` as
"Player2" (a separate localStorage origin, which is what makes two
distinct identities possible in one browser profile). Cues were observed
by patching `AudioContext.prototype.createOscillator` to record
frequency/waveform, since audio output itself cannot be asserted:

| Check | Observed |
|---|---|
| `turn` on a real `isActive` false→true | 880 Hz sine, exactly as the turn passed to seat 1 |
| `play` on `cardsPlayed` | 660 Hz sine, one per move, with the matching chat entry |
| `failure` on `suffered` | 196 Hz + 155.56 Hz sawtooth (both steps) |
| Seat switch to an *active* seat (AC17) | **0 cues** — the defect the seat-keyed ref exists to prevent |
| Match start with the observer mounting fresh | **0 cues** (baseline) |
| Sound toggled off | move logged to chat, **0 oscillators** |
| Sound re-enabled | cues resume immediately, no reload |
| Settings UI | renders in both AppMenu and RoomShell drawers, Spanish labels, defaults `{enabled:true, volume:0.6}`, persists to `tableverse:sound` |
| Console errors | none in either session |

Two open risks resolved by that run:

- **Risk 4 (closed):** Regicide's `defend` stage does **not** present as a
  spurious `isActive` edge — entering it fired no turn cue, because the
  seat stays continuously active through the stage.
- **Risk 3 (confirmed as predicted, accepted):** a single update can fire
  several cues, observed as `turn` + `failure` landing on the same
  timestamp. They overlap rather than queue, as planned.

Also confirmed incidentally: a public `G.log` cue reaches **every**
client, not just the acting one (the host heard Player2's yield).

**Still outstanding, needs a human:** how the cues actually *sound*
(plan.md open risk 1). Not reached in the browser run and covered only by
unit tests: the `win` stinger, `special` (Jester), and the
reload-no-replay path — the last because the spy cannot be installed
before the app's own module executes on load.

### Follow-up change: `failure` moved off `suffered`, `lose` retuned

Requested after the first pass: suffering damage should not buzz, and
losing a match should. Since both Regicide loss paths already produce a
`lose` stinger via `ctx.gameover`, cueing their log entries would have
stacked a second sound rather than replaced one — so `lose` itself was
retuned to the buzz instead, and `regicide.log.suffered` lost its cue.

Re-verified in a second browser run (a fresh solo two-seat match driven
to a round completion):

| Check | Observed |
|---|---|
| `round` on `roundConfirm` null→non-null | 587.33 + 880 Hz sine, as the confirm banner appeared |
| `success` on `enemyDefeated` | 659.25 + 987.77 Hz triangle |
| `suffered` after the change | several defends across the run, **0 oscillators** |
| `lose` cue itself | 196 + 155.56 + 130.81 Hz sawtooth through a real AudioContext |
| Outcome wiring | `resolveGameoverCue({}, '0')` → `'lose'` in-page — `{}` is exactly what Regicide's `endIf` returns for **both** loss paths |

Suite after the change: shared 24, game-core 546, client 241 =
**811 passing**.

### Follow-up: cues for the rest of the catalog

- [x] 10. Extend cues to the remaining five games, each decided with the
      user rather than guessed.
      **Verify:** `npm run test:unit` → shared 24, game-core 557, client
      241 = **822 passing**; `npm run typecheck` clean. Each game's own
      `gameDef.test.ts` gained cue assertions covering both what is cued
      and what must stay uncued.

Outcome: The Mind, Love Letter, Regicide and Cahoots carry per-game cues;
**Tic-Tac-Toe and Crew are deliberately platform-only.** See spec.md's
cue map for the full table.

**Deviation from the original plan:** the "never cue a terminal entry"
rule turned out to be too narrow. Entries that land in the same update as
the **`round`** cue collide identically — The Mind's `levelComplete` and
rewards, Love Letter's `roundWinner`/`spyBonus`, and Crew's `trickWon` all
sit on the path ending at `beginRoundConfirm`. The rule in spec.md is now
stated generally ("same update as any platform cue"), with the operative
distinction being *same fact announced twice* (suppress) versus *two
different facts* (allow — e.g. Love Letter's `eliminated` firing alongside
the play that caused it).

Crew is the notable result: it has **no** cueable entry at all, because
every event it logs is already a trick, round, or match boundary. That the
platform layer alone fully covers a real game is the strongest evidence
the two-layer split sits in the right place. Its test file carries a guard
asserting `G.log` holds zero cued entries after a completed trick, so this
does not get "fixed" later.

One pre-existing test needed updating rather than a new one: cahoots'
`completes a goal the instant a play satisfies it` asserted a whole log
entry with `toContainEqual`, so the added `sound` field had to be
reflected there.

Browser-verified against a real solo two-seat **The Mind** match — the
game whose misplay was the original motivating example. Seat 1 held 26 and
seat 2 held 42; playing 42 first forces a mistake:

| Oscillators | Cue | Source |
|---|---|---|
| 587.33 + 880 Hz sine | `round` | level complete opened the roundConfirm wait |
| 660 Hz sine | `play` | `theMind.log.cardPlayed` |
| 196 + 155.56 Hz sawtooth | `failure` | `theMind.log.mistake` |

Two things this confirms beyond the cues themselves: `levelComplete`
produced **no** fourth cue (the `round` cue already marked that moment —
the collision rule working in the real app), and match start fired
**nothing at all**, confirming a turnless game gets no turn ping outside
of unit tests. Effect order is round → log, matching plan.md's declared
ordering.
