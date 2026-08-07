# Feature 033 — Magaluf Board: Implementation Plan

## File layout

All under `packages/game-core/src/games/magaluf/`, co-located with the rules
per this codebase's convention.

| File | Owns |
|---|---|
| `BoardComponent.tsx` | `MagalufBoard`. Composition and the move calls — the only file that touches `moves`. |
| `PhaseHeader.tsx` | Day, phase, day multiplier, and the limit card face-down or face-up. |
| `DrawnCards.tsx` | `G.lastDraw` — the alcohol card and the event it triggered. |
| `PlayerPanel.tsx` | One seat: name, status, meter, VP, items. |
| `IntoxMeter.tsx` | The three-value bar: Resaca floor, current intoxication, limit marker. |
| `ActionBar.tsx` | Beber / Retirarse / one button per item held. |
| `BalconyOverlay.tsx` | The two-beat reveal. |
| `FinalStandings.tsx` | End-of-weekend table. |
| `CardTile.tsx` | Shared presentational atom for an alcohol or event card. |
| `useJumpQueue.ts` | The watermark and queue. No React DOM — testable without jsdom. |
| `i18nFixture.ts` | `TEST_`-prefixed strings for component tests. |

Plus `boards.ts` and `packages/client/src/boardRegistry.ts` — the two
registration lines — and a `magaluf.board.*` subtree in both locale files.

Every component gets a sibling `.module.css`.

## The 032 amendment, first

`G.lastDraw` lands before any UI work, since `DrawnCards` has nothing to
render without it:

- `state.ts` — add the field to `MagalufG` and to the initial state.
- `gameDef.ts` — set it in `takeDrink` (after the event resolves, so the pair
  is written together), clear it in `startPhase`.
- `gameDef.test.ts` — a drink populates it; a new phase clears it; it survives
  a JSON round trip.
- Feature 032's `tasks.md` — record the deviation.

It is public and unfiltered: `playerView` continues to touch only `limit`.

## The jump queue

The one piece of real logic in this feature, and the one most likely to be got
wrong, so it lives outside the component:

```ts
useJumpQueue(jumps: JumpRecord[]): {
  current: JumpRecord | null;
  advance(): void;
  skipAll(): void;
}
```

- A ref holds the watermark, **initialised to `jumps.length` on first render**
  rather than to 0. This is the whole reconnection story: anything already in
  `G` when you arrived is history.
- `current` is `jumps[watermark]` when one exists, else null.
- `advance` moves the watermark forward one; `skipAll` jumps it to
  `jumps.length`.
- The watermark only ever increases, so a `G` that shrinks (it cannot, but
  defensively) can never re-show a jump.

Unit-tested directly with a plain array, no rendering.

## Reading the limit

`G.limit` arrives already filtered by `playerView`. The board's only rule is
to treat `HIDDEN_LIMIT` as "no information": no marker, no number, no risk
badge. `poolChance` is imported from `balconing.ts` rather than reimplemented,
the same "don't duplicate the maths" precedent as Cahoots' board reusing
`isLegalPlacement`.

## Chrome vs board

The board renders the play surface only. It does **not** render the player
list as chrome, seat controls, presence, chat, or the gameover banner. It
*does* render per-seat game state (intoxication, VP, items, status), which is
game data rather than platform chrome — the same line `PlayerStatusList` walks
in Cahoots.

## Testing / verification strategy

- `BoardComponent.test.tsx` — Testing Library against mock `BoardProps`, with
  `i18nFixture` so a passing assertion can never be production copy.
  `// @vitest-environment jsdom` at the top, per this package's convention.
- `useJumpQueue.test.ts` — plain node, no jsdom.
- Verification in the real app: run `client-dev` + `server-dev`, create a room,
  claim three seats solo (the platform supports one user holding every seat),
  and play a weekend end to end — the balcony overlay cannot be trusted until
  it has been seen firing against a real match rather than a mock `G`.

## Open risks

1. **The overlay fires on a state update the viewer did not cause.** A jump
   resolves during whichever player's move ended the day, so every other
   client gets the overlay unprompted. Intended, but it means the overlay must
   never block a move the viewer needs to make — it appears between days, when
   nobody is waiting on them.
2. **Six seats is a lot of panels.** At `maxPlayers` the meter row has to stay
   readable on a laptop; the panel grid needs to wrap rather than shrink each
   panel below legibility.
3. **`lastDraw` shows one card while a Ronda drank many.** Accepted: the
   triggering draw is the reveal, and the log carries the rest. Revisit only
   if playtesters find it confusing.
4. **Testing the overlay's watermark through the component is awkward** —
   mounting with a populated `G.jumps` must show nothing, which is a test that
   passes for the wrong reason if the queue is broken in the other direction.
   Hence the separate unit test for the queue itself, where both directions
   are cheap to assert.

## Implementation-level non-goals

- No shared board-primitive extraction. Magaluf is the first game here with no
  hand at all, so anything generalised now would be a guess from one example.
- No animation library.
- No changes to `GameMount`, `ChatPanel`, `SettingsForm` or any platform file
  beyond the single `boardRegistry.ts` line.
