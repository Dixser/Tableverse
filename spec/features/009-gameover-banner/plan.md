# Feature 009 — Gameover Banner: Implementation Plan

## `GameoverResult` — the shared contract

Added to `packages/game-core/src/types.ts`, alongside `BoardProps` and
`GameModule`. This is the required shape of `ctx.gameover` for every
`GameModule` in the catalog — not enforced by boardgame.io's own types
(`Game<G>['endIf']` returns `any` upstream), so it is documentation-plus-a-
type, the same status `BoardProps` already had before any real game existed
to check it against:

```ts
/**
 * Required shape of `Ctx.gameover` for every GameModule's `endIf`. Not
 * enforced by boardgame.io's own types (endIf returns `any` upstream) --
 * this is the platform's own contract on top of it, consumed generically by
 * GameoverBanner. Tic-Tac-Toe's endIf already returns exactly this shape
 * (see gameDef.ts); this type formalizes it, it does not introduce it.
 *
 * `winner` is explicitly "one or more playerIDs" -- a single string for the
 * common case, or an array for any future game whose endIf can produce more
 * than one winner (e.g. a team win). GameoverBanner treats both forms
 * identically by normalizing to an array before use; no game today needs
 * the array form, but the message-resolution logic must not assume exactly
 * one winner just because Tic-Tac-Toe always has one.
 */
export interface GameoverResult {
  /** playerID(s) who won. Omit for a draw or any non-win end state. */
  winner?: string | string[];
  /** True when the match ended with no winner. */
  draw?: boolean;
}
```

Exported from `packages/game-core/src/index.ts` alongside the existing
`BoardProps`/`GameModule`/`JSONSchema` type exports, so `packages/client`
can import it for `GameoverBanner`'s prop typing.

No change to `GameModule` itself, `gamesCatalog.ts`, or any `gameDef.ts` —
`Ctx.gameover`'s shape is set by each game's own `endIf`, which is already
free to return `GameoverResult`-shaped data (Tic-Tac-Toe already does).

## Where winner display names come from — boardgame.io's own `matchData`, not a new endpoint

The obvious-looking approach — add `displayName` to `Room.members` /
`SeatAssignment` (shared types), enrich it server-side, thread it down
through `RoomShell` → `ActiveRoom` → `GameMount` — is **not** what this plan
does, because the data already exists one layer down and is already being
delivered to the client for free:

- `roomService.claimSeat` and `roomService.startMatch`
  (`packages/server/src/rooms/roomService.ts`) already write
  `metadata.players[playerIndex].name = user.displayName` into
  boardgame.io's own match metadata when a seat is claimed/a match starts.
  This is boardgame.io's **native** "player name" field, not something
  Tableverse invented — it exists specifically so a lobby/game UI can show
  player names without touching credentials.
- Every `Client()` instance (`useSeatClients.ts`'s `mountSeat`/
  `mountSpectator`) already subscribes to that match's SocketIO transport,
  which syncs a `filteredMetadata` array (boardgame.io's `FilteredMetadata`
  type: `{ id: number; name?: string; isConnected?: boolean }[]`, credentials
  stripped) directly onto the Client instance as `client.matchData` on every
  sync — this is already flowing into the browser today; `useSeatClients`
  simply never reads that field when building `boardProps`.

So the correct fix is: read `matchData` off the Client instance itself
(not off `SeatState`/`getState()` — see the correction below for why), in
the same place `boardProps` is already assembled. **Zero changes to
`packages/server`, `packages/shared`, or any shared type** (`Room`,
`RoomMember`, `SeatAssignment`) — this stays a client-only feature, as
originally scoped, just sourced from a field that was already being
delivered and previously ignored.

### `useSeatClients` changes — reading `client.matchData`, not `getState().matchData`

**Important correction from an earlier draft of this plan:** `matchData`
does **not** flow through `Client().subscribe()`/`getState()`. Checked
directly against boardgame.io's own client implementation
(`_ClientImpl.getState()` returns `{...state, log, isActive, isConnected}` —
no `matchData` field) and its transport handling: `matchData` arrives over
a *separate* `'matchData'` socket event (also folded into the initial
`'sync'` payload as `syncInfo.filteredMetadata`), handled by
`receiveMatchData(matchData)`, which does two things: `this.matchData =
matchData` (a property directly on the Client instance itself) and
`this.notifySubscribers()`. boardgame.io's own official React `Board`
wrapper reads it the same way — `matchData: this.client.matchData` — never
from the subscribed state object.

The practical upshot: `playerNames` must be derived from the **Client
instance** (`activeClient.matchData` / `spectator.client.matchData`), not
from `SeatState`. This still updates reactively without any new
subscription plumbing, because `receiveMatchData` calls
`notifySubscribers()`, which invokes the same `onState` callback
`useSeatClients` already passes to `client.subscribe()` — by the time that
callback (and the React re-render it triggers via `setStatesBySeat`) runs,
`client.matchData` is already current.

```ts
// packages/client/src/seats/useSeatClients.ts
import type { FilteredMetadata, Game } from 'boardgame.io';

export interface SeatClientsState {
  // ...existing fields...
  /**
   * playerID -> display name, derived from the active (or spectator)
   * Client's matchData -- boardgame.io's own FilteredMetadata, already
   * populated server-side from User.displayName at seat-claim/match-start
   * time (see roomService.claimSeat/startMatch). Entries with no `name`
   * yet synced are simply absent -- GameoverBanner falls back to "Seat N"
   * for any playerID missing here, so this map is allowed to be partial or
   * momentarily empty (e.g. right after a fresh Client() mount, before its
   * first sync arrives).
   */
  playerNames: Record<string, string>;
}
```

```ts
function playerNamesFrom(matchData: FilteredMetadata | undefined): Record<string, string> {
  const names: Record<string, string> = {};
  for (const entry of matchData ?? []) {
    if (entry.name) names[String(entry.id)] = entry.name;
  }
  return names;
}

// ...inside useSeatClients, alongside the existing boardProps derivation
// (activeClient is already computed there: `seats.get(activeSeatID)?.client`)...
const playerNames = playerNamesFrom(activeClient?.matchData ?? spectator?.client.matchData);

return {
  seatIDs: [...seats.keys()],
  activeSeatID,
  setActiveSeatID,
  boardProps,
  playerNames,
  addSeat,
};
```

`activeClient?.matchData ?? spectator?.client.matchData` mirrors the
existing `boardProps` fallback chain (active seat takes priority; spectator
only when no seat is held) — `matchData` is the same for every connection to
a given match regardless of who's viewing, so either source works, but
reusing the same priority order keeps this function trivially easy to
reason about next to `boardProps`.

## `GameoverBanner` component

```
packages/client/src/gameMount/GameoverBanner.tsx
packages/client/src/gameMount/GameoverBanner.module.css
```

```ts
export interface GameoverBannerProps {
  /** Raw ctx.gameover -- unknown, not GameoverResult, because a
   * non-conforming future game must not crash the banner (spec.md AC8). */
  gameover: unknown;
  /** The currently active seat's playerID, or null for a spectator --
   * exactly BoardProps['playerID'], already available to GameMount. */
  playerID: string | null;
  /** playerID -> display name, from useSeatClients (see above). */
  playerNames: Record<string, string>;
}
```

Message resolution (pure function, unit-tested independent of rendering):

```ts
function nameFor(id: string, playerNames: Record<string, string>): string {
  return playerNames[id] ?? `Seat ${id}`;
}

/** "Alice" / "Alice and Bob" / "Alice, Bob and Carol" */
function formatNameList(names: string[]): string {
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// Exported separately so GameoverBanner.test.tsx can cover every branch
// without mounting React for each case.
export function resolveGameoverMessage(
  gameover: unknown,
  playerID: string | null,
  playerNames: Record<string, string>,
): string | null {
  if (!gameover || typeof gameover !== 'object') return null;
  const g = gameover as { winner?: string | string[]; draw?: boolean };
  if (g.draw === true) return "It's a draw.";
  if (g.winner !== undefined) {
    const winnerIDs = Array.isArray(g.winner) ? g.winner : [g.winner];
    const iAmWinner = playerID !== null && winnerIDs.includes(playerID);
    const others = winnerIDs
      .filter((id) => id !== playerID)
      .map((id) => nameFor(id, playerNames));
    if (iAmWinner) {
      return others.length === 0 ? 'You win!' : `You and ${formatNameList(others)} win!`;
    }
    const verb = winnerIDs.length > 1 ? 'win' : 'wins';
    return `${formatNameList(others)} ${verb}!`;
  }
  return 'Game over.';
}
```

| `gameover` | viewer | message |
|---|---|---|
| `undefined` / falsy | any | *(component renders `null`)* |
| `{ draw: true }` | any | "It's a draw." |
| `{ winner: '0' }`, `playerID: '0'` | seated, sole winner | "You win!" |
| `{ winner: ['0','1'] }`, `playerID: '0'` | seated, co-winner | "You and Alice win!" |
| `{ winner: '0' }`, `playerID: '1'` | seated, not a winner | "Alice wins!" |
| `{ winner: ['0','1'] }`, `playerID: '2'` | seated, not a winner | "Alice and Bob win!" |
| `{ winner: '0' }`, `playerID: null` | spectator | "Alice wins!" |
| `{ winner: '0' }`, name not yet synced | any | "Seat 0 wins!" *(fallback, spec.md AC5)* |
| anything else truthy | any | "Game over." *(fallback, spec.md AC8)* |

```tsx
export function GameoverBanner({ gameover, playerID, playerNames }: GameoverBannerProps) {
  const message = resolveGameoverMessage(gameover, playerID, playerNames);
  if (message === null) return null;
  return (
    <div className={styles.banner} role="status">
      {message}
    </div>
  );
}
```

## `GameMount` / `App.tsx` wiring

`GameMount` gains one new prop, `playerNames`, sourced from
`useSeatClients`'s new return field — `ctx.gameover` and `playerID` already
arrive via the existing `boardProps` it receives:

```ts
export interface GameMountProps {
  selectedGameID: string | null;
  boardProps: BoardProps | null;
  /** playerID -> display name, from useSeatClients; passed through to GameoverBanner. */
  playerNames: Record<string, string>;
}
```

```tsx
return (
  <div data-testid="game-mount">
    <GameoverBanner
      gameover={boardProps.ctx.gameover}
      playerID={boardProps.playerID}
      playerNames={playerNames}
    />
    <BoardComponent {...boardProps} />
  </div>
);
```

`ActiveRoom` in `App.tsx` threads it straight through:

```tsx
<GameMount
  selectedGameID={selectedGameID}
  boardProps={seatClients.boardProps}
  playerNames={seatClients.playerNames}
/>
```

This keeps `BoardComponent`'s own render output banner-free (spec.md AC9) —
`TicTacToeBoard` continues to only stop accepting input via its existing
`!ctx.gameover` check in `canPlay`; it never renders gameover text or names
itself.

Perspective updates automatically when the active seat changes (spec.md
story 4): `GameMount` re-renders with new `boardProps`/`playerNames`
whenever `useSeatClients`'s `activeSeatID` changes (existing behavior,
unmodified), so `GameoverBanner` recomputes `resolveGameoverMessage` against
the newly active seat's `playerID` on the very next render — no new state or
effect required.

## File layout

```
packages/game-core/src/
  types.ts        # + GameoverResult
  index.ts        # + export type { GameoverResult }

packages/client/src/seats/
  useSeatClients.ts       # + playerNamesFrom() + playerNames field on SeatClientsState
  useSeatClients.test.ts  # + matchData -> playerNames derivation cases

packages/client/src/gameMount/
  GameoverBanner.tsx
  GameoverBanner.module.css
  GameoverBanner.test.tsx    # resolveGameoverMessage table (incl. multi-winner) + render smoke tests
  GameMount.tsx             # + playerNames prop, renders <GameoverBanner>
  GameMount.test.tsx        # + gameover-present / multi-winner / name-fallback cases

packages/client/src/App.tsx  # + passes seatClients.playerNames to <GameMount>
```

No changes to `packages/server`, `packages/shared`, `gamesCatalog.ts`, or
any `gameDef.ts`.

## Styling

`GameoverBanner.module.css` consumes the existing design tokens from
`global.css` (feature 003/004) — `var(--color-surface)`,
`var(--color-text)`, `var(--color-accent)` or similar for the banner
background/border — the same convention every other chrome component
(`PresenceBadge`, `RoomShell`) already follows. No new tokens are added.

## Testing / verification strategy

- `useSeatClients.test.ts` — new cases asserting `playerNames` is derived
  correctly from a mocked `Client()` instance's `matchData` property
  (entries with a `name` included, entries without one omitted — not
  defaulted here, since the "Seat N" fallback belongs to `GameoverBanner`,
  not this hook). The mock `Client()` factory needs a `matchData` field
  settable independently of `push(state)`, since real boardgame.io keeps
  the two separate (see the correction above) — the mock's `push` helper
  should not need to carry `matchData` inside the pushed state object.
- `GameoverBanner.test.tsx` — unit tests covering every row of the message
  table above via `resolveGameoverMessage` directly (fast, no DOM),
  including the multi-winner rows (`{ winner: ['0','1'] }` from a co-winner's
  perspective, a non-winner's perspective, and a spectator's) and the
  name-fallback row, plus 2-3 `render()`-based smoke tests confirming the
  component mounts the resolved text with `role="status"` and mounts
  nothing (`null`) when `gameover` is falsy.
- `GameMount.test.tsx` — new cases added to the existing suite: a
  `boardProps.ctx.gameover` present case with a populated `playerNames` map
  (banner shows a real name, not "Seat N"), and confirmation the four
  existing cases (no game selected / unknown game / live board / waiting
  placeholder) are unaffected, since none of them set `ctx.gameover`.
- `BoardComponent.test.tsx`'s existing AC "no chrome" assertion (no
  `h1, h2, ul, [role=status]`) is a pre-existing regression guard that
  happens to also catch this feature: if `GameoverBanner` (which renders
  `role="status"`) were ever mistakenly rendered *inside* `TicTacToeBoard`
  instead of `GameMount`, that test would start failing. No edit needed to
  it, but it's called out here since it's load-bearing for spec.md AC9.
- No `gameDef.ts`/`gameDef.test.ts` changes for Tic-Tac-Toe — spec.md AC10
  is verified by leaving that file untouched and confirming its existing
  assertions still pass.
- Manual/browser verification: start the dev server, play Tic-Tac-Toe to a
  win and to a draw with two real nicknames (not seat numbers) claimed,
  confirm the banner names the winner correctly per active seat and updates
  when using the seat switcher across two claimed seats (solo play,
  covering both perspectives in one match).

## Open risks

1. **`matchData` sync timing is not guaranteed to arrive before the first
   `gameover`-carrying state update.** In practice boardgame.io sends
   `filteredMetadata` as part of the same `sync` payload that seeds `G`/
   `ctx`, so this is expected to be a non-issue, but it hasn't been
   confirmed against a real two-browser match. The "Seat N" fallback (spec.md
   AC5) exists specifically to degrade gracefully if this assumption turns
   out to be wrong in practice — flagged for the manual verification step to
   actually check, not just assume.
2. **`GameoverResult` is unenforced by TypeScript at the `endIf` boundary**
   (boardgame.io's own `Game<G>` types `endIf`'s return as `any`). A future
   game author could return a non-conforming shape and only discover it via
   `GameoverBanner`'s AC8 fallback ("Game over.") rather than a compile
   error. Accepted for the same reason feature 001 accepted analogous gaps
   elsewhere in the boardgame.io type surface.
3. **Multi-winner phrasing is untested against a real game** — no current
   `GameModule` ever produces `winner` as an array, so `resolveGameoverMessage`'s
   multi-winner branches are covered by direct unit tests (spec.md AC6) but
   not by an end-to-end play-through. Accepted: the same situation feature
   001's conformance suite is in for any check that can't be run against a
   second real game yet.
