# Feature 016 — The Mind: Implementation Plan

## No phases, no turn order — `ActivePlayers.ALL`

Unlike every other shipped game, The Mind has no `Game.phases`/turn
structure at all. Every seat is permanently active via
`turn: { activePlayers: ActivePlayers.ALL }` (`= { all: Stage.NULL }`,
confirmed by inspecting `boardgame.io/dist/cjs/core.js` at runtime — both
`Stage.NULL` and `ActivePlayers.ALL` are plain data, not functions, so no
call is needed). This is the exact pattern tech-stack.md's "Known engine
limitations" section names for The Mind by name. `Game.moves` is a flat,
top-level map (`playCard`, `proposeShuriken`, `voteShuriken`,
`cancelShurikenVote`) — every active seat may call any of them at any
time; `ctx.currentPlayer` exists (boardgame.io always assigns one) but is
never read by any move or the board.

`ActivePlayers` needs the same CJS-runtime-vs-type-only-subpath treatment
`INVALID_MOVE` already gets in `game-core/src/vendor.ts` (boardgame.io
ships no root `exports` map; `boardgame.io/core`'s subpath resolves under
Vite/Vitest's bundler resolution but not real Node ESM, which is what
`packages/server` uses). Add `ActivePlayers` to the same vendor re-export
rather than importing it directly in `gameDef.ts`.

## `G` shape

```ts
interface TheMindG {
  activeSeatIDs: string[];         // real, claimed seats -- see Love Letter's own field of the same name
  totalLevels: number;             // fixed at setup from activeSeatIDs.length (12/10/8)
  level: number;                   // current level, 1-indexed
  lives: number;
  stars: number;
  hands: Record<string, number[]>; // secret -- conformance suite secretKey. Sorted ascending.
  playedCards: number[];           // public -- this level's shared pile, in play order.
  setAsideCards: number[];         // public -- cards revealed by a misplay this level.
  starDiscards: number[];          // public -- cards revealed by a resolved shuriken this level.
  shurikenVote: { proposerID: string; votes: Record<string, boolean> } | null;
  log: GameLogEntry[];
  matchResult: 'won' | 'lost' | null;
}
```

`playerView` strips `hands` down to the viewer's own entry (empty for a
spectator) and adds a public `handCounts: Record<string, number>` derived
from every seat's hand length — this is how AC10/AC12's "counts public,
values private" split is enforced, same shape as Love Letter's
`deckCount` derived field.

`playedCards`/`setAsideCards`/`starDiscards` reset to `[]` at the start of
every level (fresh shuffle each level makes previous levels' specific
values irrelevant — spec.md's "in that Level" scoping for the played-cards
zone confirms this is the intended, not merely convenient, behavior).

## Reward table

The rulebook states rewards happen on levels 2/3/5/6/8/9 but only shows
the icon in a photo, not the text "star" or "life" per level. Read off
the physical card icons (throwing star / heart), the assignment
alternates:

```ts
const LEVEL_REWARDS: Record<number, 'life' | 'star'> = {
  2: 'star', 3: 'life', 5: 'star', 6: 'life', 8: 'star', 9: 'life',
};
const MAX_LIVES = 5; // = total life cards in the physical component count
const MAX_STARS = 3; // = total star cards in the physical component count
```

Applying `Math.min(cap, current + 1)` on reward exactly reproduces the
physical "supply might already be empty" edge case the rulebook's own
"in the ideal scenario" note hedges about, without needing to separately
track a supply-remaining counter.

## Misplay resolution

`playCard` is `client: false` (like Love Letter's `playCard`/
`chancellorKeep`) — it must read every other active seat's hidden hand to
find lower cards, which a client's optimistic dry-run would attempt
against its own already-`playerView`-filtered copy of `G` and throw. Same
reasoning applies to `voteShuriken`'s resolution branch (reads/mutates
every seat's hand) and `proposeShuriken`/`cancelShurikenVote` (touch only
public `G.shurikenVote`, but kept `client: false` too for consistency and
because a client-side dry-run of the shuriken flow has no benefit here).

One life lost per erroneous `playCard` call, regardless of how many cards
across however many seats were lower (AC4) — a single `if
(lowerCards.length > 0)` guard, not a per-card decrement.

## `GameoverResult` encoding for a cooperative loss

`GameoverResult` (`game-core/src/types.ts`) only has `winner?`/`draw?`.
A cooperative win sets `{ winner: G.activeSeatIDs }` (every active seat
listed — `GameoverBanner`'s `resolveGameoverMessage` already handles a
multi-winner array where the viewer is among the winners via
`youAndOthersWin`). A cooperative **loss** is not a draw (nobody won, but
it's not the neutral tic-tac-toe-style stalemate `gameover.draw` implies
either) — `endIf` returns `{}` for a loss: both fields absent, which is a
fully conforming `GameoverResult`. `resolveGameoverMessage` falls through
`draw !== true` and `winner === undefined` straight to
`t('gameover.fallback')` ("Game over.") — this is the documented,
designed-for degradation path (tech-stack.md: "a non-conforming shape
degrades to a generic fallback message"; `{}` is conforming, and this is
the one existing case that legitimately wants the fallback rather than a
richer generic message). `TheMindBoard` renders its own richer
win/loss banner from `G.matchResult` directly (not from `ctx.gameover`) —
allowed under the chrome/board split, since this is the game's own board
surface adding detail on top of, not replacing, the platform's generic
banner.

## Files

```
packages/game-core/src/games/themind/
  gameDef.ts                       # rules (deck/levels/rewards inlined -- trivial, no separate deck.ts needed)
  index.ts                         # GameModule, id 'themind-v1', minPlayers 2, maxPlayers 4, no settingsSchema
  gameDef.test.ts
  themindModule.conformance.test.ts   # secretKeys: ['hands']
  BoardComponent.tsx
  BoardComponent.module.css
  PlayedCardsZone.tsx / .module.css   # this level's pile + set-aside + star-discard zones
  PlayedCardsZone.test.tsx
  PlayerStatusList.tsx / .module.css  # every active seat's hand count, public
  PlayerStatusList.test.tsx
  ShurikenPanel.tsx / .module.css     # propose/vote UI
  ShurikenPanel.test.tsx
  HandView.tsx / .module.css          # own hand, only lowest card clickable
  HandView.test.tsx
```

Registration (three hand-edits per feature 011's checklist):
1. `game-core/src/gamesCatalog.ts` — import + array entry.
2. `game-core/src/boards.ts` — re-export `TheMindBoard`.
3. `client/src/boardRegistry.ts` — `'themind-v1': TheMindBoard`.

i18n: new `theMind.*` namespace in both `en.json` and `es.json` (parity
enforced by `client/src/i18n/localeParity.test.ts`) for every player-facing
string and `G.log` key used.

## Testing strategy

- `gameDef.test.ts`: headless `Client()` games covering setup at each
  player count (levels/lives/stars match the table), lowest-card-only
  play, misplay life loss + card reveal (single vs. multiple lower cards,
  across one and multiple other seats), reward granting and capping,
  level completion via normal play and via shuriken, win at final level,
  loss at 0 lives, shuriken propose/agree/decline/resolve, and that no
  move succeeds after `matchResult` is set.
- `themindModule.conformance.test.ts`: standard suite, `secretKeys:
  ['hands']`.
- Component tests for each board subcomponent with mock props (no real
  server), consistent with tech-stack.md's "Component tests" strategy.
- Manual browser verification (per this session's own working agreement):
  start the dev server, create a room, claim 2+ seats, play a full level
  including a deliberate misplay and a shuriken vote, confirm the shared
  win/loss banners render for every seat identically.
