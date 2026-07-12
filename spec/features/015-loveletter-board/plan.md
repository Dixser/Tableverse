# Feature 015 — Love Letter: Board UI, Round Tracking & Private Reveals: Implementation Plan

## `BoardProps<G>` vs. the actual wire shape

Feature 014's `playerView` returns a reshaped view, not `LoveLetterG`
verbatim (it adds `deckCount`, narrows `hands`/`privateReveals` to the
viewer's own entry, and drops `_deck`/`_setAsideFacedown` entirely — see
that feature's plan.md). This feature defines the view's actual shape
once, in `game-core` alongside `LoveLetterG` (so both feature 014's
`playerView` implementation and this feature's `BoardComponent` share one
source of truth instead of each guessing the other's shape):

```ts
// packages/game-core/src/games/loveletter/gameDef.ts
export interface LoveLetterView {
  edition: LoveLetterEdition;
  deckCount: number;
  setAsideFaceup: CardRank[];
  hands: Record<string, CardRank[]>; // at most one entry: the viewer's own
  privateReveals: Record<string, GameLogEntry[]>; // ditto
  eliminated: Record<string, boolean>;
  handmaidProtected: Record<string, boolean>;
  playedCards: Record<string, CardRank[]>;
  roundWins: Record<string, number>;
  // log, nextRoundStartPlayerID, matchWinners intentionally omitted from
  // BoardProps' concern -- log is chat's (feature 012), the other two are
  // internal engine bookkeeping no UI needs.
}

export const LoveLetterBoard: React.FC<BoardProps<LoveLetterView>> = (props) => { /* ... */ };
```

## Card display data — i18n, not a hardcoded table

`packages/game-core/src/games/loveletter/BoardComponent.tsx` reads card
name/text via `t('loveLetter.cards.' + rank + '.name')` / `.text`, new
keys added to feature 010's existing `en`/`es` resource files (not
duplicated here — `en.json`/`es.json` gain a `loveLetter.cards.0`
through `.9` block, each with `name` and `text`, phrased in this
project's own words per spec.md's copyright note on feature 014's spec).
No separate "card data" module holding English strings — i18next's
resource files *are* the single source of card display text, consistent
with feature 010's principle of extracting every user-facing string
rather than introducing a second, code-level string table that could
drift from the translated one.

## Component breakdown

```
packages/game-core/src/games/loveletter/
  BoardComponent.tsx           # LoveLetterBoard -- composes the below
  BoardComponent.module.css
  HandView.tsx                 # own hand: 1-2 CardTile, click-to-select
  CardTile.tsx                 # one card's placeholder rendering (rank/name/text)
  TargetPicker.tsx             # eligible-opponent (+ self, for Prince) picker
  GuardGuessPicker.tsx         # rank picker, Guard-only, chained after TargetPicker
  PlayArea.tsx                 # per-player playedCards + eliminated/protected badges
  RoundWinsTracker.tsx         # roundWins, every seat, always visible
  PrivateRevealToast.tsx       # renders unread privateReveals entries
```

### Move-composition state machine

`LoveLetterBoard` holds one local `useState` for the in-progress move
being composed — never written into `G`, pure client UI state, same
category as any uncommitted form input:

```ts
type MoveDraft =
  | { step: 'idle' }
  | { step: 'choosingTarget'; cardRank: CardRank; handIndex: 0 | 1; eligibleTargets: string[] }
  | { step: 'choosingGuess'; cardRank: 1; handIndex: 0 | 1; targetPlayerID: string };
```

Clicking a `CardTile` in `HandView`:

1. Compute `eligibleTargets` from the current `G` view: every seated
   `playerID` (from `Object.keys(playedCards)`, since that map has one
   entry per seat regardless of elimination) minus `eliminated` players,
   minus `handmaidProtected` players — **except** for the Prince (rank 5),
   whose own `playerID` is always included even if self-protected (spec.md
   story 6), and minus self for every other targeted card (Guard/Priest/
   Baron/King cannot target their own player).
2. Cards needing no target (Spy = 0, Countess = 8) call `moves.playCard`
   immediately (spec.md AC3) — no draft state entered at all.
3. Cards needing a target (1,2,3,5,7 — Guard/Priest/Baron/Prince/King):
   if `eligibleTargets.length === 0`, call `moves.playCard` immediately
   with no target (spec.md story 5/AC6 — the engine's own
   "no legal target, plays with no effect" rule from feature 014 handles
   the rest; the client doesn't need to special-case this beyond not
   showing an empty picker). Otherwise enter `choosingTarget`.
4. Selecting a target in `TargetPicker`: for the Guard (rank 1), transition
   to `choosingGuess` (`GuardGuessPicker`, offering every rank 0-9 except
   1); for every other targeted card, call `moves.playCard` immediately
   with the chosen target.
5. Selecting a guess in `GuardGuessPicker` calls `moves.playCard` with
   both the target and the guess.

`moves.playCard`'s call shape (matching feature 014's move signature):

```ts
moves.playCard(handIndex, { targetPlayerID, guardGuess });
```

### Countess forced-play (spec.md story 2 / AC5)

Pure function, unit-tested independent of rendering (same pattern as
`resolveGameoverMessage` in feature 009):

```ts
export function countessBlocksOtherCard(hand: CardRank[]): boolean {
  return hand.includes(8) && hand.some((r) => r === 5 || r === 7);
}
```

`HandView` calls this once per render; if true, the non-Countess card
renders `disabled` with a `title`/inline hint sourced from a new
`loveLetter.countessForced` i18n key. This is purely a UX affordance —
feature 014's `playCard` move independently rejects the illegal attempt
server-side regardless (`INVALID_MOVE`), so a client bug here degrades to
"the disabled state is wrong" at worst, never to an actually-illegal move
succeeding.

### Eligible-target computation (spec.md story 5/6, AC2/AC6)

```ts
export function eligibleTargets(
  cardRank: CardRank,
  selfID: string,
  view: Pick<LoveLetterView, 'eliminated' | 'handmaidProtected' | 'playedCards'>,
): string[] {
  const seats = Object.keys(view.playedCards);
  const alive = seats.filter((id) => !view.eliminated[id]);
  if (cardRank === 5) {
    // Prince: self always eligible; others eligible unless protected.
    return alive.filter((id) => id === selfID || !view.handmaidProtected[id]);
  }
  // Guard/Priest/Baron/King: never self, never a protected opponent.
  return alive.filter((id) => id !== selfID && !view.handmaidProtected[id]);
}
```

Exported and unit-tested directly (spec.md AC2/AC6), independent of
`TargetPicker`'s own rendering tests.

### `PrivateRevealToast` (spec.md story 3, AC7)

Reads `view.privateReveals[playerID]` (at most one key, the viewer's own,
per feature 014's `playerView` — see spec.md story 7/AC9's spectator
case, where this map is always empty). Renders each entry's translated
text (`t(entry.key, entry.params)`) in a visually distinct element
(`role="status"`, a CSS class signaling "private," e.g. a lock icon or
different background — exact visual treatment is an implementation
detail, not spec'd further than "distinctly-styled" per spec.md story 3).
Tracks which entries have already been shown (by array index, mirroring
`GameoverBanner`'s and chat's own "diff by array length" convention) so a
re-render doesn't re-surface an already-dismissed reveal as if it were
new.

### `RoundWinsTracker` (spec.md story 4, AC8)

Trivial: one row per `Object.entries(view.roundWins)`, always rendered
(not gated behind any "round over" condition) — this is the one piece of
`LoveLetterBoard` explicitly required to be visible **during** a round in
progress, not just between rounds, per spec.md story 4's "at a glance, at
any point."

## File layout

```
packages/game-core/src/games/loveletter/
  gameDef.ts               # + LoveLetterView export (feature 014's file, extended)
  BoardComponent.tsx
  BoardComponent.module.css
  BoardComponent.test.tsx
  HandView.tsx (+ .test.tsx)
  CardTile.tsx (+ .test.tsx)
  TargetPicker.tsx (+ .test.tsx)
  GuardGuessPicker.tsx (+ .test.tsx)
  PlayArea.tsx (+ .test.tsx)
  RoundWinsTracker.tsx (+ .test.tsx)
  PrivateRevealToast.tsx (+ .test.tsx)
  eligibleTargets.ts (+ .test.ts)       # pure function, per above
  countessBlocksOtherCard.ts (+ .test.ts)   # pure function, per above

packages/client/src/boards.ts       # already exists (feature 001) -- + export LoveLetterBoard
packages/client/src/boardRegistry.ts  # + 'loveletter-v1': LoveLetterBoard

packages/client/public/locales/{en,es}/translation.json  # + loveLetter.* keys (feature 010's existing resource files)
```

Following feature 011's checklist, `loveletter-v1` also needs its
`gamesCatalog.ts` entry (added by feature 014, since that's where the
`GameModule` itself is defined) — this feature only adds the two
board-registration lines (`boards.ts`, `boardRegistry.ts`), per feature
011's three-registration-point breakdown.

## Testing / verification strategy

- `eligibleTargets.test.ts` / `countessBlocksOtherCard.test.ts` — pure
  function tables covering spec.md AC2/AC5/AC6's cases directly, no DOM.
- `HandView.test.tsx`, `TargetPicker.test.tsx`, `GuardGuessPicker.test.tsx`
  — the move-composition state machine's transitions (spec.md AC2-4,
  AC6), mocking `moves.playCard` and asserting exact call arguments at
  each terminal step.
- `PrivateRevealToast.test.tsx` — renders from a fixture `privateReveals`
  array, confirms translated text and the "already shown" de-dup logic;
  a second test asserts nothing renders from an empty map (the spectator/
  other-player case, AC7/AC9).
- `RoundWinsTracker.test.tsx` — renders all seats' counts from a fixture,
  including a mid-round (non-gameover) fixture, confirming it's not
  gated behind any round/match-end condition (AC8).
- `BoardComponent.test.tsx` — the composed whole: a spectator fixture
  (`playerID: null`) renders no hand and no private reveals but full
  public state (AC9); confirms no chrome leakage (player list, seat
  controls, presence, chat) the same way `TicTacToeBoard.test.tsx`
  already does for Tic-Tac-Toe (AC10).
- Manual/browser verification (AC11): a full two-seat solo-played match
  through at least two rounds, explicitly checking the Countess
  disabled-state hint, a Baron or Priest private toast, the round-wins
  counter incrementing, and cross-referencing feature 012's chat panel
  for the corresponding public `G.log`-sourced messages appearing
  alongside manually-typed chat in the same feed.

## Open risks

1. **No prior game in this codebase has ever needed a multi-step move-
   composition UI** (Tic-Tac-Toe's `play` move is a single click with no
   intermediate state) — the `MoveDraft` state machine above is new
   territory for this codebase's client patterns, flagged as the piece
   most likely to need real-world adjustment once built against an actual
   `GuardGuessPicker` interaction, not just its unit tests.
2. **Deferred board-UI-kit extraction** (roadmap.md) means any
   `CardTile`/`TargetPicker` patterns that turn out to generalize well
   stay local to `packages/game-core/src/games/loveletter/` for now,
   even if a future game's needs would clearly benefit from reusing them
   — intentional, not an oversight (see spec.md Non-goals), but flagged
   so a future contributor doesn't mistake the lack of extraction for
   this feature having missed an obvious opportunity.
