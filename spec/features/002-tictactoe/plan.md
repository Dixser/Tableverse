# Feature 002 — Tic-Tac-Toe: Implementation Plan

## Resolved architectural decision (before file layout)

**BoardComponent placement.** tech-stack.md's monorepo-layout section says
`game-core` has "no React, no server code... framework-agnostic," but the
same document's `GameModule` contract requires `BoardComponent:
React.FC<BoardProps>` as a field the catalog (which lives in `game-core`)
carries. Feature 001's dummy fixture sidestepped this with a stub
(`() => null`) needing only `@types/react` (type-only). Tic-Tac-Toe is the
first module needing a real, rendering component — a genuine runtime
dependency, not just types.

**Decision:** `BoardComponent.tsx` stays inside `game-core`, alongside
`gameDef.ts`, matching the `GameModule` contract and feature 001's file
layout literally — `react` is added to `game-core/package.json` as a
**peerDependency**, not a regular dependency. The rules module (`gameDef.ts`)
and the conformance suite never import the `.tsx` file, so headless testing
and any non-web reuse of the rules still need zero React install; only a
consumer that actually renders (the client app, which already depends on
`react`) needs the peer satisfied. This resolves the contradiction by
narrowing "framework-agnostic" to mean "the *rules* are framework-agnostic,"
not "nothing in this package ever touches React."

## File layout

```
packages/game-core/
  package.json                # add peerDependencies: { react: "^18.3.1" }
  src/
    games/
      tictactoe/
        gameDef.ts             # boardgame.io Game<TicTacToeG> definition — no React import
        gameDef.test.ts        # headless-Client unit tests (AC1-5)
        BoardComponent.tsx     # real JSX 3x3 grid — the only file in this
                                # module that imports React; never imported
                                # by gameDef.ts or the conformance suite
        index.ts                # exports the tictactoeModule: GameModule combining both
    gamesCatalog.ts             # +1 line: register tictactoeModule (the only
                                 # change to a file outside games/tictactoe/)
```

No changes to `packages/server` or any existing `packages/client` file —
per spec.md's AC9 and this feature's entire reason for existing. `GameMount`
already looks up `BoardComponent` generically via `getGameModule`; it needs
no per-game awareness.

## `gameDef.ts` — the `Game` definition

```ts
export interface TicTacToeG {
  cells: (PlayerID | null)[]; // length 9, index 0-8
}

export const tictactoeGameDef: Game<TicTacToeG> = {
  setup: () => ({ cells: Array(9).fill(null) }),
  moves: {
    play: ({ G, playerID }, cellIndex: number) => {
      if (G.cells[cellIndex] !== null) return INVALID_MOVE;
      G.cells[cellIndex] = playerID;
    },
  },
  turn: { minMoves: 1, maxMoves: 1 },
  endIf: ({ G }) => {
    const winner = checkWinner(G.cells);
    if (winner) return { winner };
    if (G.cells.every((c) => c !== null)) return { draw: true };
  },
  // No playerView override -- G is fully public, per spec.md's rules.
};
```

- `checkWinner` is a pure, non-exported helper checking the 8 winning lines
  (3 rows, 3 columns, 2 diagonals) — unit-tested indirectly through AC3/4 by
  driving the headless `Client` through winning/drawing move sequences,
  not tested as a standalone function (keeps the test suite black-box
  against the actual `Game` definition, consistent with the conformance
  suite's own approach).
- No `random` plugin usage anywhere — Tic-Tac-Toe has no randomness. This
  is why AC6's determinism check is "trivially true": two headless clients
  built from the same `gameDef` with no moves played produce identical `G`
  regardless of seed, since `setup` never calls `random`.
- `turn.minMoves`/`maxMoves: 1` enforces strict alternation (boardgame.io's
  default turn order already alternates `playOrder`; this just also caps
  each turn at exactly one move, rejecting a second move attempt in the
  same turn rather than silently ignoring it).

## `BoardComponent.tsx`

```tsx
export const TicTacToeBoard: React.FC<BoardProps<TicTacToeG>> = ({
  G, ctx, moves, playerID, isActive,
}) => {
  const canPlay = (i: number) => isActive && G.cells[i] === null && !ctx.gameover;
  return (
    <div className="tictactoe-board">
      {G.cells.map((cell, i) => (
        <button
          key={i}
          disabled={!canPlay(i)}
          onClick={() => moves.play(i)}
        >
          {cell === '0' ? 'X' : cell === '1' ? 'O' : ''}
        </button>
      ))}
    </div>
  );
};
```

- Renders **only** the 3x3 grid — no player list, seat controls, presence
  badges, or room chrome of any kind, per spec.md's AC8. `RoomShell` (the
  chrome, from feature 001) is what wraps this via `children`; this
  component receives nothing beyond standard `BoardProps`.
- `isActive` (from boardgame.io, already computed per the current
  `playerID`/turn) gates clickability — no bespoke "is it my turn" logic
  needed beyond what `BoardProps` already supplies.
- `playerID === '0' → 'X'`, `'1' → 'O'` is a fixed, arbitrary-but-consistent
  mapping; no configurability, per spec.md's "no settings" non-goal.

## `index.ts` — the `GameModule`

```ts
export const tictactoeModule: GameModule<TicTacToeG> = {
  id: 'tictactoe-v1',
  displayName: 'Tic-Tac-Toe',
  minPlayers: 2,
  maxPlayers: 2,
  gameDef: tictactoeGameDef,
  BoardComponent: TicTacToeBoard,
  // no settingsSchema -- intentionally minimal, per spec.md.
};
```

## `gamesCatalog.ts` — the one-line registration

```ts
export const gamesCatalog: GameModule[] = [tictactoeModule];
```

This is the only edit to a file outside `games/tictactoe/`. If implementing
any part of this feature requires touching anything else in
`packages/server` or `packages/client`, that's a signal the `GameModule`
contract from feature 001 has a gap — tasks.md's verification step for this
is to actually run the full room flow (create → select tictactoe-v1 → claim
both seats → start → play) against the real app and confirm nothing else
needed changing, not just to assert it in prose.

## Testing strategy for this feature

- `gameDef.test.ts` — headless-`Client` unit tests, no transport, driving
  `client.moves.play(i)` through scripted sequences for each AC (win via
  each of the 8 lines is excessive; plan is one horizontal, one vertical,
  one diagonal, one draw, one illegal-move-rejected, one
  no-moves-after-gameover — covers AC1, 2, 3 (representatively, not
  exhaustively over all 8 lines), 4, 5).
- `tictactoeModule.conformance.test.ts` — calls
  `testGameModuleConformance(tictactoeModule, { secretKeys: [] })` from
  `@tableverse/game-core/testing/conformance.js`, satisfying AC6. This is
  the first time the suite runs against a module actually shipped in
  `gamesCatalog`, not a throwaway fixture.
- `BoardComponent.test.tsx` — `@testing-library/react`, rendered with a
  hand-built `G`/`ctx` fixture (no real boardgame.io `Client`/transport
  needed for a component test), covering AC7 and AC8.
- Manual/live verification (AC9) — no new automated integration test is
  added to `packages/server` for this (feature 001's room/seat/permission
  logic is already fully covered there and is game-agnostic by
  construction); instead, tasks.md's final step is to boot the real
  server + client, play a full game through the actual room flow in a
  browser, and confirm no platform file needed editing. This is
  deliberately a manual/live check, not automated, since a proper
  automated end-to-end test is feature 001's explicitly deferred item
  (5.3) and remains deferred here too — this feature only needs to prove
  the *contract* holds for one real game, not stand up Playwright.

## Open risks (as planned)

None were anticipated at planning time — this feature is intentionally
narrow (no hidden information, no settings, fixed 2-player count), and the
one real architectural question (BoardComponent placement) was resolved
above before writing this plan.

## What actually happened (post-implementation)

The plan held for `game-core` (rules, board component, catalog
registration — no surprises). It did **not** hold for the live
verification step: plugging a real `GameModule` into feature 001's room
flow surfaced four bugs in `packages/client`'s glue code (`App.tsx`,
`useSeatClients.ts`) plus one recurrence of feature 001's boardgame.io
subpath-resolution issue in `game-core`. None of these were design flaws
in this feature's own plan — they were latent bugs in feature 001's client
wiring that had no way to surface without a real, rendering
`BoardComponent` and a real `Client()` connection to exercise them
end-to-end. Full detail is in tasks.md's task 9 entry; summary:

1. `RoomShell` never surfaced the room's `selectedGameID`/`currentMatchID`
   to the code that mounts `GameMount`/`useSeatClients` (fixed: new
   `onRoomUpdate` prop).
2. `useSeatClients` never subscribed to the boardgame.io `Client`'s state
   changes, so React never re-rendered when server state arrived (fixed:
   wired `client.subscribe()` into hook state).
3. The client-side `gameDef` never had `.name` set to the catalog id,
   causing a silent `"Invalid namespace"` socket failure (fixed: shared
   `withGameName` helper in `game-core`, used by both server and client).
4. The (now-correct) `gameDef` wasn't memoized, so the `Client()`/socket
   was torn down and recreated every render (fixed: `useMemo`).

This is the reason feature 001's plan.md flagged "if a client's tab is
already open when another seat's credential newly becomes available...
won't automatically re-mount" as an acknowledged follow-up rather than a
blocking gap — that follow-up and these four bugs are all instances of the
same underlying lesson: feature 001's client-side seat-mounting code was
never exercised against a real, connecting `Client()` until this feature's
live verification step, because feature 001 shipped with an empty
catalog by design.
