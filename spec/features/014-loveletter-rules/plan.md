# Feature 014 — Love Letter: Rules Engine: Implementation Plan

## Why rounds are a looping boardgame.io *phase*, not the top-level game

boardgame.io's `endIf` ends the whole **match** — but Love Letter has two
nested end conditions (a round ends often; the match ends only once a
token threshold is crossed). The idiomatic boardgame.io way to model
"repeating sub-games within one match" is a **phase that re-enters
itself**: the phase's own `endIf` detects a round-over condition and its
`next` points back at the same phase, so a new round starts automatically
inside the same match/log, while the **top-level** `Game.endIf` — checked
after every phase transition — is the only thing that can produce a real
`ctx.gameover`.

```ts
export const loveletterGameDef: Game<LoveLetterG> = {
  setup: (ctx, setupData) => initialMatchState(ctx, setupData as LoveLetterSetupData),

  phases: {
    round: {
      start: true,
      // Ends THIS round -- deck exhausted or one player left in the round.
      endIf: ({ G }) => isRoundOver(G),
      // Awards tokens, appends the round-winner G.log entry, decides
      // whether the match is now over -- see "Round -> match handoff".
      onEnd: ({ G, ctx, random }) => concludeRound(G, ctx, random),
      next: 'round',
      turn: {
        order: skipEliminatedTurnOrder,
        onBegin: ({ G, ctx }) => drawIntoActiveHand(G, ctx),
      },
      moves: { playCard },
    },
  },

  // Only true once concludeRound has set G.matchWinners / G.matchDraw.
  endIf: ({ G }) => matchGameoverResult(G),
};
```

### Round → match handoff

`concludeRound` (called from the `round` phase's `onEnd`, per boardgame.io
semantics — `onEnd` runs once `endIf` returns true, before `next` starts
the following phase instance) does, in order:

1. Determine this round's winner(s) — either the sole remaining
   non-eliminated player, or (deck exhausted) every player tied for the
   highest hand rank among those still in the round.
2. Increment `G.roundWins[playerID]` for each winner. Handle the Spy bonus
   token (spec.md's card table, rank 0) independently of the round win —
   it is possible for the round's winner to also be the sole Spy-player,
   in which case they simply receive two token increments this round, one
   from each rule; the rules explicitly allow this (spec.md: "this never
   overrides the round's actual winner, who still gets their own token").
3. Append a `G.log` entry naming the round's winner(s) (feature 012's
   `GameLogEntry` contract).
4. Check every player's `roundWins` against the token-to-win threshold for
   `ctx.numPlayers` (spec.md's table, resolved once via a small lookup
   keyed by `ctx.numPlayers`, clamped to the `classic` edition's 2-4
   range since that's all `minPlayers`/`maxPlayers` ever allow for it). If
   one or more players meet or exceed it, set `G.matchWinners` (a
   `PlayerID[]`, possibly length > 1) — this is what the top-level
   `endIf` reads.
5. If no player met the threshold, reset per-round state (`hands`,
   `eliminated`, `handmaidProtected`, `playedCards`, `privateReveals`,
   `deck`, `setAsideFacedown`, `setAsideFaceup`) and re-deal for the next
   round, per spec.md's round-setup rules — this is the same logic
   `setup` itself uses for the match's first round, factored into one
   shared `dealNewRound(G, ctx, random, startingPlayerID)` function to
   avoid duplicating it between `setup` and `concludeRound`.
6. Determine the next round's starting player (prior winner, or a
   `random.Shuffle`-derived pick among tied winners) and record it so the
   `round` phase's next instance's turn order begins there — boardgame.io
   phases don't automatically preserve "whose turn is it" across a
   `next`-triggered re-entry, so this is passed through a small
   `G.nextRoundStartPlayerID` field the freshly-re-entered phase's first
   `turn.onBegin` (or the phase's own `onBegin`) reads and clears.

```ts
function matchGameoverResult(G: LoveLetterG): GameoverResult | undefined {
  if (!G.matchWinners || G.matchWinners.length === 0) return undefined;
  return { winner: G.matchWinners.length === 1 ? G.matchWinners[0] : G.matchWinners };
}
```

## `G` shape

```ts
export type LoveLetterEdition = 'normal' | 'classic';
export type CardRank = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface LoveLetterG {
  edition: LoveLetterEdition;

  /**
   * Hidden from EVERY player and spectator, always -- not a per-owner
   * secret (nobody has looked at these), so playerView must strip these
   * two fields unconditionally rather than filtering them per-viewer the
   * way `hands`/`privateReveals` are. Leading underscore is a deliberate,
   * documented convention (see "playerView" below) marking a field as
   * "never leaves the server," distinct from `hands`/`privateReveals`
   * ("leaves the server, but only to its owner").
   */
  _deck: CardRank[];
  _setAsideFacedown: CardRank | null;

  /** Public (2-player games only) -- permanently out of the round, visible to all. */
  setAsideFaceup: CardRank[];

  /** Per-player secret -- conformance suite secretKey. */
  hands: Record<string, CardRank[]>;
  /** Per-player secret -- conformance suite secretKey. Baron/Priest results. */
  privateReveals: Record<string, GameLogEntry[]>;

  /** All public. */
  eliminated: Record<string, boolean>;
  handmaidProtected: Record<string, boolean>;
  playedCards: Record<string, CardRank[]>;
  roundWins: Record<string, number>;
  log: GameLogEntry[];

  /** Set only between concludeRound and the next round's dealNewRound. */
  nextRoundStartPlayerID: string | null;
  /** Set once the match is actually over; read by the top-level endIf. */
  matchWinners: string[] | null;
}

export interface LoveLetterSetupData {
  edition?: LoveLetterEdition; // defaults to 'normal'
}
```

## `playerView` — two different kinds of hidden data

```ts
loveletterGameDef.playerView = ({ G, playerID }) => {
  const { _deck, _setAsideFacedown, hands, privateReveals, ...publicG } = G;
  return {
    ...publicG,
    deckCount: _deck.length, // the only thing about the deck anyone may know
    hands: playerID != null ? { [playerID]: hands[playerID] } : {},
    privateReveals: playerID != null ? { [playerID]: privateReveals[playerID] ?? [] } : {},
  };
};
```

`deckCount` is a derived field that only exists in the *view*, never in
`G` itself (`G`'s own deck length is always recomputable from `_deck`,
so storing it twice would risk drift). Feature 015's `BoardProps<...>`
type is therefore this view's shape, not `LoveLetterG` verbatim — flagged
explicitly since every other shipped game so far (Tic-Tac-Toe) has no
`playerView` at all, so this is the first time `BoardProps<G>`'s `G`
generic parameter and the actual wire shape diverge; feature 015 defines
its own `LoveLetterView` type for this.

`hands`/`privateReveals` follow the exact pattern the conformance suite's
`checkPlayerViewLeakFree` already expects (`Record<PlayerID, unknown>`,
only the viewer's own key present) — `secretKeys: ['hands',
'privateReveals']` in this module's conformance test.

`_deck`/`_setAsideFacedown` do **not** go through that mechanism (spec.md
AC9's separate, dedicated test) since they're not owner-keyed data — the
conformance suite's `secretKeys` check would not even know how to
interpret a bare array as a "leak," which is exactly why spec.md calls
this out as a distinct guarantee needing its own test, not an extension of
AC8's generic check.

## Turn order skipping eliminated players

```ts
const skipEliminatedTurnOrder: TurnOrder = {
  first: ({ G, ctx }) => Number(G.nextRoundStartPlayerID ?? ctx.playOrder[0]),
  next: ({ G, ctx }) => {
    const order = ctx.playOrder;
    const currentIdx = order.indexOf(String(ctx.playOrderPos));
    for (let step = 1; step <= order.length; step++) {
      const candidate = order[(currentIdx + step) % order.length]!;
      if (!G.eliminated[candidate]) return order.indexOf(candidate);
    }
    return undefined; // no eligible player -- endIf will already have ended the round by this point
  },
};
```

(Exact boardgame.io `TurnOrder` field names/signatures to be confirmed
against the installed `boardgame.io@0.50.2` types at implementation time —
this snippet captures the intent: skip any `G.eliminated[playerID] ===
true` seat, never the mechanism boardgame.io itself exposes for it.)

## Representative card effect — Baron (illustrates the public/private split)

```ts
function resolveBaron(G: LoveLetterG, actingPlayerID: string, targetPlayerID: string): void {
  const actingRank = G.hands[actingPlayerID]![0]!;
  const targetRank = G.hands[targetPlayerID]![0]!;
  G.log.push({
    key: 'loveLetter.log.baronUsed',
    params: { actor: actingPlayerID, target: targetPlayerID },
  }); // PUBLIC: that a comparison happened, and between whom.

  if (actingRank !== targetRank) {
    const loserID = actingRank < targetRank ? actingPlayerID : targetPlayerID;
    eliminate(G, loserID);
  }
  // PRIVATE: the actual compared ranks, visible only to the acting player.
  G.privateReveals[actingPlayerID]!.push({
    key: 'loveLetter.reveal.baronCompared',
    params: { opponent: targetPlayerID, opponentRank: targetRank, ownRank: actingRank },
  });
}
```

Every other targeted card (Guard's naming, Priest's view, King's swap,
Prince's forced redraw) follows the same shape: a `G.log` push describing
the public fact (who used what on whom, and — for Guard specifically,
since the *guess* itself is spoken aloud in the physical game — what rank
was named, but never whether the guess was correct until the elimination
itself is separately logged as its own public fact), plus, only for
Priest, a `privateReveals` push scoped to the acting player alone. Guard's
correctness and Baron's loser are both eliminations, which are already
public (`eliminated`) — no additional private field needed for those two.

## Deck construction per edition

```ts
const NORMAL_COMPOSITION: Record<CardRank, number> = {
  0: 2, 1: 6, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 1, 8: 1, 9: 1,
};
const CLASSIC_REMOVALS: Partial<Record<CardRank, number>> = { 1: 1, 6: 2, 0: 2 };

function buildDeck(edition: LoveLetterEdition): CardRank[] {
  const composition = { ...NORMAL_COMPOSITION };
  if (edition === 'classic') {
    for (const [rank, removeCount] of Object.entries(CLASSIC_REMOVALS)) {
      composition[Number(rank) as CardRank] -= removeCount;
    }
  }
  return Object.entries(composition).flatMap(([rank, count]) =>
    Array(count).fill(Number(rank) as CardRank),
  );
}
```

`setup`/`dealNewRound` shuffles this via `random.Shuffle` (boardgame.io's
plugin, never `Math.random()`), sets aside the top card as
`_setAsideFacedown`, and — only when `ctx.numPlayers === 2` — the next
three as `setAsideFaceup`, before dealing one card to each seat.

## Classic + player-count validation

Per spec.md's resolved decision (feature 013's seat-picker gap), this
module's own `setup` throws if handed data it cannot honor — the same
"fail loudly at match-creation time" pattern `roomService.startMatch`
already uses for a `setupDataError`:

```ts
setup: (ctx, setupData) => {
  const edition = (setupData as LoveLetterSetupData)?.edition ?? 'normal';
  if (edition === 'classic' && ctx.numPlayers > 4) {
    throw new Error(
      `loveletter-v1: classic edition supports at most 4 players, got ${ctx.numPlayers}`,
    );
  }
  return dealNewRound(buildInitialG(edition), ctx, /* ... */);
},
```

(boardgame.io's `createMatch`/`Server` surfaces a thrown `setup` error as
`setupDataError` on the `Server.CreateMatchAPI` response, which
`roomService.startMatch` already checks and converts into a
`RoomServiceError` — no change needed there; confirmed against the
existing `'setupDataError' in created` check in `roomService.ts`.)

## File layout

```
packages/game-core/src/games/loveletter/
  gameDef.ts                        # phases, moves, playerView, endIf
  gameDef.test.ts                   # spec.md AC1-7 (unit)
  deck.ts                           # buildDeck, NORMAL_COMPOSITION/CLASSIC_REMOVALS
  deck.test.ts
  index.ts                          # loveletterModule (GameModule<LoveLetterG>)
  loveletterModule.conformance.test.ts   # spec.md AC8
  playerView.test.ts                # spec.md AC9 (the "hidden from everyone" check)
```

Generated from feature 011's scaffold (`npm run new-game -- loveletter-v1
"Love Letter"`), per its own printed checklist, then hand-written from
there — this feature is the scaffold's first real consumer.

## Testing / verification strategy

- `deck.test.ts` — composition/count assertions for both editions (spec.md
  AC1's deck-shape half).
- `gameDef.test.ts` — the bulk of spec.md's unit ACs: one `describe` block
  per card effect (AC2), round-end via both paths (AC3), turn-order
  skipping (AC4), token accumulation and match-end incl. multi-winner
  (AC5), classic-edition player-count rejection (AC6), `G.log` presence/
  absence per event (AC7).
- `playerView.test.ts` — AC9's dedicated "never present for anyone" check,
  separate from the conformance suite's per-owner leak check, exactly
  because it's a structurally different guarantee (see "playerView"
  above): assert `'_deck' in view === false` and `'_setAsideFacedown' in
  view === false` for every `playerID` including `null`, at multiple
  points along a played-out game (not just at `setup`, since a
  Chancellor draw or a Prince-triggered empty-deck draw are exactly the
  moments a leak here would be easiest to introduce by accident).
- `loveletterModule.conformance.test.ts` — `testGameModuleConformance` at
  `secretKeys: ['hands', 'privateReveals']`, run at both `minPlayers` (2)
  and `maxPlayers` (6) per the suite's existing per-`numPlayers` loop.

## Open risks

1. **`skipEliminatedTurnOrder`'s exact shape against boardgame.io
   0.50.2's real `TurnOrder` type** is sketched, not confirmed against the
   library's actual signatures (`ctx.playOrderPos` vs. an index vs. a
   `playerID` string varies across boardgame.io's own turn-order helpers)
   — flagged for the first implementation pass to verify directly against
   `node_modules/boardgame.io`'s types, same spirit as feature 009's
   plan.md catching a wrong assumption about `matchData` by checking the
   library's actual source before writing the real code.
2. **`onEnd`'s access to the `random` plugin** (used for the tied-round-
   winner tiebreak) is assumed available on phase `onEnd`'s context the
   same way it is on a move's — boardgame.io's plugin injection into
   phase lifecycle hooks vs. moves is not double-checked here; if `onEnd`
   turns out not to receive `random`, the tiebreak logic moves into the
   first move of the new round instead (a `turn.onBegin` in the freshly
   entered phase, still random-plugin-backed, just relocated).
3. **Countess's "do not reveal your other card" rule** (spec.md's card
   table) has no enforcement mechanism described above beyond "the played
   card stays in `playedCards`, the other stays in the private `hands`
   field" — this is already correct by construction (nothing in this
   design ever exposes the un-played card), noted here only to confirm it
   was considered, not left as an accidental gap.
