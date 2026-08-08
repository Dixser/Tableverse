# Feature 033 — Magaluf Board: Implementation Plan

## Order of work

The rules amendments come first — the board cannot be built or tested against
a `G` shape that is about to change underneath it.

1. `G.lastDraw` (**done**, feature 032's `tasks.md` records it).
2. Round-confirm gates, and the boardgame.io phase machinery they force.
3. `GameoverResult.standings` and the banner that renders it.
4. The board itself.

## 1. Round confirm, and the phase restructure

The largest piece, and the one that changes feature 032's architecture rather
than adding to it.

**`state.ts`** — `MagalufG` gains the reserved `RoundConfirmG` fields
(`roundConfirm`, `hostPlayerID`), plus a `pendingAdvance` discriminator saying
what the wait is for:

```ts
pendingAdvance: { kind: 'phase'; next: number } | { kind: 'day'; next: number } | null;
```

Without it the confirm's completion handler cannot tell whether to deal the
next venue or start the next day, and re-deriving it from `G.phase` would be a
second source of truth for something the transition already knew.

**`gameDef.ts`** — two boardgame.io phases:

- `party` — `turn: { order: turnOrder }`, moves `drink` / `withdraw` /
  `useItem`. The custom `TurnOrderConfig` from 032 is unchanged.
- `confirm` — `turn: { activePlayers: ActivePlayers.ALL }`, moves
  `confirmRoundReady` / `forceAdvanceRound`, `endIf` on
  `isRoundConfirmComplete`, and an `onEnd` that performs the deferred
  transition. Love Letter's shape exactly.

`endPhase` stops calling `startPhase`/`resolveNight` inline. It awards Último
en Pie, records `pendingAdvance`, calls `beginRoundConfirm` with the **non-dead**
active seats, and lets the move that triggered it hand over to the `confirm`
phase via `events.setPhase('confirm')`.

`resolveNight` keeps resolving the balconing rolls *before* the wait begins, so
`G.jumps` is already populated when the banner appears — that ordering is what
lets the overlay play inside the gate.

Both moves are `client: false`, like The Mind's: the completion handler deals
new decks for everyone, and an optimistic client-side dry run would predict
them locally.

The doc comments in `gameDef.ts` that currently say "there is deliberately no
boardgame.io phase machinery" must be corrected. Leaving prose that contradicts
the code is worse than the original decision being wrong.

**Guard:** `canAct` already refuses when `G.finished`; it must also refuse
while `G.roundConfirm` is non-null, so a queued click cannot land a drink
during a wait (AC29).

## 2. Gameover standings

**`packages/game-core/src/types.ts`** — add the optional `standings` field and
the `GameoverStanding` interface. Optional, so no existing game changes.

**`packages/client/src/gameMount/GameoverBanner.tsx`** — extract a
`resolveStandings(gameover, playerNames, t)` alongside the existing
`resolveGameoverMessage`, following that function's own precedent of being
separately exported and unit-testable without mounting React. It must tolerate
a malformed value, exactly as `resolveGameoverMessage` already tolerates a
non-conforming `gameover`.

**`magaluf/gameDef.ts`** — `matchGameoverResult` already sorts the seats; it
now also maps that ordering into `standings`.

New platform i18n keys under `gameover.*` for the table's column headings.

## 3. The board

All under `packages/game-core/src/games/magaluf/`.

| File | Owns |
|---|---|
| `BoardComponent.tsx` | `MagalufBoard`. Composition and the move calls. |
| `PhaseHeader.tsx` | Day, venue, day multiplier, and the limit card. |
| `DrawnCards.tsx` | `G.lastDraw`. |
| `PlayerPanel.tsx` | One seat: name, status, meter, VP, items. |
| `IntoxMeter.tsx` | Resaca floor, current intoxication, and the limit band or marker. |
| `ActionBar.tsx` | Beber / Retirarse / one button per item held. |
| `BalconyOverlay.tsx` | The two-beat reveal. |
| `CardTile.tsx` | Presentational atom for an alcohol or event card. |
| `limitScale.ts` | The meter's domain. |
| `useJumpQueue.ts` | The watermark and queue (**done**). |
| `i18nFixture.ts` | `TEST_`-prefixed strings. |

No `FinalStandings` — the platform banner owns it.

### `limitScale.ts` — the anti-leak

The whole point is that the meter's geometry must carry no information about
which limit card was drawn:

```ts
export function limitRange(day: number, limitShift: number): { min: number; max: number };
export function meterMax(day: number, limitShift: number): number;   // max + HEADROOM
```

Both read `LIMIT_DECKS` — static, public data — and `G.settings.limitShift`,
which is a public room setting. Neither reads `G.limit`. That is the property
AC12 and AC14 pin: two boards with the same day and different hidden limits
must be pixel-identical.

`IntoxMeter` renders the band from `limitRange` while
`limit === HIDDEN_LIMIT`, and a single marker at `G.limit` otherwise.

## Testing / verification strategy

- `BoardComponent.test.tsx` — Testing Library, `// @vitest-environment jsdom`,
  with `i18nFixture` so no assertion can pass against production copy.
- `limitScale.test.ts`, `useJumpQueue.test.ts` — plain node.
- `gameDef.test.ts` — extended for the confirm gates (AC24–AC29).
- `GameoverBanner.test.tsx` — extended for standings (AC31–AC34), including
  the unchanged-when-absent case that protects the other six games.
- **In the real app**: `client-dev` + `server-dev`, create a room, claim three
  seats solo, play a full weekend. The confirm gate and the balcony overlay
  cannot be trusted until they have fired against a real match rather than a
  mock `G`.

## Open risks

1. **Eight confirm gates per weekend is a lot of clicking**, especially at six
   seats. Mitigated by landing them on the two beats that matter, and by the
   host's force-advance. If playtesting says it drags, a setting is the fix.
2. **The phase restructure is the riskiest change in the whole game.** It
   moves who is allowed to move and when. The conformance suite plus AC24–AC30
   are the guard, and the in-app playthrough is non-negotiable before this is
   called done.
3. **`GameoverBanner` is shared by six games.** The standings field is
   optional and AC31 exists specifically to prove nothing else changed.
4. **Six seats is a lot of panels.** The grid must wrap rather than shrink
   panels below legibility.
5. **`lastDraw` shows one card while a Ronda drank many.** Accepted; the log
   carries the rest.

## Implementation-level non-goals

- No shared board-primitive extraction. Magaluf is the first game here with no
  hand at all, so anything generalised now would be a guess from one example.
- No animation library.
- No changes to `GameMount`, `ChatPanel` or `SettingsForm`; the only platform
  files touched are `types.ts`, `GameoverBanner.tsx`, the locale files, and the
  single `boardRegistry.ts` line.
