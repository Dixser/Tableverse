# Feature 022 — Regicide: Rules Engine Implementation Plan

## Turn/phase architecture

Two phases, mirroring Love Letter's own `round`/`roundConfirm` split (same
reason: `setActivePlayers`/`ActivePlayers.ALL` can't be layered onto a
phase's existing turn via a stage the way `chancellorChoice` is — a
distinct wait phase is the established pattern in this codebase):

- **`combat`** (`start: true`) — the actual four-step turn loop. Single
  active player (`ctx.currentPlayer`), default boardgame.io turn-order
  restriction (no `ActivePlayers` override needed). Phase-level `moves`:
  `playCards`, `yield` (Step 1). A `defend` turn stage holds the one
  Step-4 move, `discardCards`, entered via `events.setStage('defend')`
  only when Step 4 actually requires a choice (see "Step 4 entry" below).
  `endIf: ({ G }) => G.roundConfirm !== null` — the phase transitions out
  the instant a non-final enemy is defeated and `beginRoundConfirm` has
  been called; `next: () => 'roundConfirm'`.
- **`roundConfirm`** — `turn: { activePlayers: ActivePlayers.ALL }`,
  `endIf: isRoundConfirmComplete(G.roundConfirm)`, `next: () => 'combat'`.
  Moves: `confirmRoundReady`/`forceAdvanceRound` from the shared
  `roundConfirm.ts`. Nothing is dealt here (spec.md's "Round-defeat
  confirmation") — the only purpose is the pause itself. `onEnd` is where
  the *rest* of the defeat transition actually happens (see "Deferred
  defeat resolution" below), not `resolveEnemyDefeat` itself.

## Deferred defeat resolution

Per spec.md's corrected "Round-defeat confirmation" section: the pause
must show the *defeated* enemy's final state, not an already-swapped-in
next enemy. So `resolveEnemyDefeat` (called from `playCards`, inside
`combat`) does only the part that doesn't change what's on screen — move
this round's `cardsInPlay` to the discard pile, and (for the 12th King
only) end the match outright. For every other enemy, it leaves
`G.currentEnemy` untouched (still the just-defeated card, `G.damageDealt`
and `G.spadeShieldTotal` still showing the numbers that finished it) and
stashes only *what to do once confirmed*:

```ts
interface RegicideG {
  // ...
  /** Set by resolveEnemyDefeat for a non-final defeat; consumed and
   * cleared by the roundConfirm phase's onEnd, which is where the card
   * actually moves, the next enemy is revealed, and counters reset. */
  pendingEnemyDisposal: 'tavern' | 'discard' | null;
}
```

```ts
function resolveEnemyDefeat(G: RegicideG, defeatingPlayerID: string): void {
  const enemy = G.currentEnemy!;
  const exact = G.damageDealt === enemyHealth(enemy);
  G.log.push({ key: 'regicide.log.enemyDefeated', params: { actor: defeatingPlayerID, enemy: enemy.id, damage: G.damageDealt } });
  G.discardPile.push(...G.cardsInPlay);
  G.cardsInPlay = [];

  if (G._castleDeck.length === 0) { // this WAS the 12th/final enemy
    if (exact) G._tavernDeck.push(enemy); else G.discardPile.push(enemy); // doesn't matter which -- match's over
    G.currentEnemy = null;
    G.matchResult = 'won';
    G.log.push({ key: 'regicide.log.matchWon' });
    return;
  }

  G.pendingEnemyDisposal = exact ? 'tavern' : 'discard';
  G.nextTurnStartSeatID = defeatingPlayerID;
  beginRoundConfirm(G, G.activeSeatIDs);
}
```

`roundConfirm`'s `onEnd` performs the deferred half once every seat has
confirmed (or the host force-advanced):

```ts
onEnd: ({ G }) => {
  G.roundConfirm = null;
  const defeated = G.currentEnemy!;
  if (G.pendingEnemyDisposal === 'tavern') G._tavernDeck.push(defeated); else G.discardPile.push(defeated);
  G.pendingEnemyDisposal = null;
  G.currentEnemy = G._castleDeck.pop()!; // always defined -- resolveEnemyDefeat only opened this wait when one remained
  G.damageDealt = 0;
  G.spadeShieldTotal = 0;
  G.enemyImmunityCancelled = false;
},
```

`_castleDeck.length === 0` (checked with the 12th enemy still occupying
`currentEnemy`, before any pop) is the "was that the last one" test —
cheaper and clearer than tracking a separate enemy-index counter, since
it's already the exact same condition the original (non-deferred, now
superseded) draft used.

Re-entering `combat` (both the very first time, from `setup`, and every
subsequent time, from `roundConfirm`) needs a specific starting player,
not boardgame.io's default `playOrder[0]`. One field does both jobs:

```ts
turn: {
  order: {
    first: ({ G, ctx }) => ctx.playOrder.indexOf(G.nextTurnStartSeatID ?? ctx.playOrder[0]!),
    next: ({ G, ctx }) => {
      if (G.forcedNextSeatID != null) {
        const idx = ctx.playOrder.indexOf(G.forcedNextSeatID);
        if (idx !== -1) return idx;
      }
      for (let step = 1; step <= ctx.playOrder.length; step++) {
        const idx = (ctx.playOrderPos + step) % ctx.playOrder.length;
        if (G.activeSeatIDs.includes(ctx.playOrder[idx]!)) return idx;
      }
      return undefined;
    },
  },
  onBegin: ({ G, ctx }) => {
    G.forcedNextSeatID = null; // one-shot Jester override, consumed by the `next` call that just ran
    checkStuckLoss(G, ctx);    // Step 1's "empty hand + yield forbidden" loss (see below)
  },
},
```

`G.nextTurnStartSeatID` is set once at `setup` (the random starting
player) and again every time a non-final enemy is defeated (the
defeating player) — same "who resumes first" pattern as Love Letter's
`nextRoundStartPlayerID`, just also covering the match's very first turn
instead of only round 2+. `G.forcedNextSeatID` is a one-shot override for
the Jester's arbitrary-next-player choice; cleared in `onBegin` right
after it's been consumed by the `next` call that determined this new
turn, so it never leaks into an ordinary clockwise handoff later.

## Step 1 → Step 4 within one turn, no phase change

Steps 2/3 (suit powers, damage) are fully automatic — only Step 1 (play
vs. yield) and Step 4 (which cards to discard) are player decisions, and
both belong to the *same* active player, so this is a turn-stage problem,
not a phase problem (mirrors Love Letter's `chancellorChoice` stage, not
its `roundConfirm` phase). `playCards`/`yield` run everything through
Step 3 inline, then call a shared `enterStep4` helper:

```ts
function enterStep4(G: RegicideG, playerID: string, events: CombatEvents): void {
  const effectiveShield = isImmune(G, 'S') ? 0 : G.spadeShieldTotal;
  const required = Math.max(0, enemyAttack(G.currentEnemy!) - effectiveShield);
  if (required <= 0) {
    events.endTurn();
    return;
  }
  const handTotal = G.hands[playerID]!.reduce((sum, c) => sum + cardValue(c), 0);
  if (handTotal < required) {
    G.matchResult = 'lost'; // capability check -- see spec.md AC11; no discardCards move needed to prove it
    G.log.push({ key: 'regicide.log.matchLostDefense', params: { actor: playerID } });
    return; // no endTurn -- the match is over, top-level endIf catches G.matchResult next tick
  }
  G.pendingDefense = { requiredTotal: required };
  events.setStage('defend');
}
```

The loss check is a **capability** check (can this hand, discarded in
full, ever reach `required`?), evaluated the instant Step 4 begins — not
a rejected `discardCards` call. This sidesteps an ambiguity the rulebook
doesn't have to resolve physically: a client sending an insufficient
`discardCards` selection when a *larger* legal selection exists is just
`INVALID_MOVE` (they should pick more cards), never a loss; the loss only
fires when no selection could possibly work.

`discardCards` (the `defend` stage's only move) validates
`sum(selected) >= G.pendingDefense.requiredTotal`, moves the selected
cards to `G.discardPile`, clears `G.pendingDefense`, `events.endStage()`,
`events.endTurn()`.

## Step 1's other loss trigger — the stuck-empty-hand case

`checkStuckLoss` (called from `turn.onBegin`, see above) is the only place
this is checked — not inside `playCards`/`yield` — because it's a
precondition of the *turn even starting* legally, independent of which
move (if any) gets attempted:

```ts
function checkStuckLoss(G: RegicideG, ctx: Ctx): void {
  if (G.matchResult) return;
  const playerID = ctx.currentPlayer;
  if (G.hands[playerID]!.length > 0) return; // any single card is always a legal Step 1 play
  if (yieldAllowed(G, playerID)) return;
  G.matchResult = 'lost';
  G.log.push({ key: 'regicide.log.matchLostStuck', params: { actor: playerID } });
}
```

## Unifying combos, Animal Companion pairs, and single cards

Every legal Step 1 selection reduces to the same two derived values —
`totalAttack` (sum of `cardValue` across the selection) and `suits` (the
*deduplicated* set of suits present, Jesters excluded) — resolved
identically regardless of which of the five shapes in spec.md's "Legal
plays" produced them. `legalPlay.ts` owns shape validation only
(`isLegalSelection(cards: Card[]): boolean`, exported separately from
`gameDef.ts` since feature 023's card-disabling UI will need the same
function to compute which additional cards a partial selection still
allows — same reuse reason Love Letter's `eligibleTargets.ts` is its own
module); `gameDef.ts` owns the total/suits reduction and every suit's
resolution.

```ts
function isLegalSelection(cards: Card[]): boolean {
  if (cards.length === 0) return false;
  if (cards.length === 1) return true; // single card (incl. Jester, incl. a face card) -- always legal
  if (cards.some((c) => c.kind === 'jester')) return false; // Jester never combos/pairs
  const companions = cards.filter((c) => c.kind === 'companion').length;
  if (companions >= 1) return cards.length === 2; // AC + exactly one other (numeric/face/AC)
  if (cards.length > 4 || !cards.every((c) => c.kind === 'number')) return false;
  const rank = (cards[0] as NumberCard).rank;
  if (!cards.every((c) => (c as NumberCard).rank === rank)) return false;
  return cards.reduce((sum, c) => sum + cardValue(c), 0) <= 10;
}
```

## Spade shield: cumulative-raw, immunity gated only at read time

`G.spadeShieldTotal` accumulates the **raw** attack value of every
selection containing a spade, unconditionally — including while the
current enemy is immune to spades. Immunity only ever gates the value at
the point it's *read* (`enterStep4`'s `isImmune(G, 'S') ? 0 :
G.spadeShieldTotal`), never at the point it's written. This single design
choice is what produces the rulebook's specific retroactive-unlock
behavior (spec.md's "Enemy suit immunity" section) for free — no separate
"replay past spade plays" logic needed once immunity is lifted, because
the raw total was never gated in the first place.

Clubs is the opposite: its doubling is computed once, inline, in the same
`playCards` call that played it (`isImmune(G, 'C')` checked *then*), and
never revisited — there is no persistent Clubs counter to re-evaluate
later, matching spec.md's "locked in" language.

## Hearts-before-Diamonds

```ts
if (suits.has('H') && !isImmune(G, 'H')) resolveHearts(G, totalAttack, random);
if (suits.has('D') && !isImmune(G, 'D')) resolveDiamonds(G, ctx, playerID, totalAttack);
```

Plain sequential `if`s in this order are sufficient — no shared state
threading needed between them beyond `G` itself, since `resolveHearts`
only ever pushes onto `G._tavernDeck`'s bottom and `resolveDiamonds` only
ever reads from its top; the ordering requirement is naturally satisfied
by evaluating the two statements in program order.

## `Card`/deck shape (`deck.ts`)

Discriminated union (`kind: 'number' | 'companion' | 'jester' | 'face'`),
each variant carrying a stable `id` (`"${suit}${rank}"`, e.g. `"S7"`,
`"SAC"`, `"SJ"`; Jesters `"Jester1"`/`"Jester2"`) used both as the
`playCards`/`discardCards` move parameter and as the eventual React key in
feature 023. `cardValue(card)` is the single function both Step 1's
attack-value math and Step 4's discard-value math read (identical table
per spec.md: number = rank, companion = 1, jester = 0, face = 10/15/20)
— one function, not two, since the rulebook itself never distinguishes
them. `_tavernDeck`/`_castleDeck` use the same "`pop()` = top" convention
Love Letter's `_deck` already established in this codebase; "place under
the deck" (Hearts' heal, and a defeated-exactly enemy re-entering play)
is `unshift`/`push` onto the *opposite* end from `pop()`.

## `G` shape

```ts
interface RegicideG extends RoundConfirmG {
  activeSeatIDs: string[];
  _tavernDeck: Card[];              // hidden from everyone -- blanket-hidden like Love Letter's _deck
  _castleDeck: Card[];              // hidden from everyone -- remaining, unrevealed enemies
  currentEnemy: FaceCard | null;    // public; null only in the instant between the 12th defeat and match end
  discardPile: Card[];              // public, full contents (feature 023 chooses to render only its count)
  cardsInPlay: Card[];              // public -- cards played against currentEnemy, not yet discarded
  damageDealt: number;              // public, cumulative vs currentEnemy, resets to 0 on a new enemy
  spadeShieldTotal: number;         // public, cumulative RAW vs currentEnemy (see "Spade shield" above)
  enemyImmunityCancelled: boolean;  // public, resets to false on a new enemy
  hands: Record<string, Card[]>;    // secret -- conformance suite secretKey
  lastActionWasYield: Record<string, boolean>; // public, per active seat -- feature 022 AC13
  pendingDefense: { requiredTotal: number } | null; // public -- non-null only during the `defend` stage
  pendingEnemyDisposal: 'tavern' | 'discard' | null; // public -- see "Deferred defeat resolution" above
  forcedNextSeatID: string | null;  // Jester's one-shot next-player override
  nextTurnStartSeatID: string | null; // combat phase's turn.order.first() input
  matchResult: 'won' | 'lost' | null;
  log: GameLogEntry[];
}

interface RegicideView extends Omit<RegicideG, '_tavernDeck' | '_castleDeck' | 'hands'> {
  tavernCount: number;
  /** 1-indexed position of currentEnemy in the 12-card Castle deck (e.g. "enemy 3 of 12"). */
  enemyNumber: number;
  handCounts: Record<string, number>;
  hands: Record<string, Card[]>; // narrowed to the viewer's own entry only (or {} for a spectator)
}
```

`playerView` strips `_tavernDeck`/`_castleDeck` unconditionally (nobody
has ever seen their contents — not a per-owner secret, same category as
Love Letter's `_deck`/`_setAsideFacedown`) and narrows `hands` to the
viewer's own seat, same shape as every other game's `playerView` in this
codebase.

## `GameoverResult`

Same convention as The Mind (`themind/gameDef.ts`): a win is `{ winner:
G.activeSeatIDs }` (every active seat credited — this is a shared win, not
an individual one); a loss is `{}` (no winner, not a draw — a
`GameoverResult` with both fields absent is fully conforming and degrades
to `t('gameover.fallback')` client-side, the same accepted degradation
The Mind's own loss state already uses).

## Files

```
packages/game-core/src/games/regicide/
  deck.ts                 # Card/Suit/FaceRank types, cardValue, enemyAttack/enemyHealth, buildTavernDeck, buildCastleRanks
  deck.test.ts
  legalPlay.ts             # isLegalSelection -- reused by feature 023 later
  legalPlay.test.ts
  gameDef.ts                # RegicideG/RegicideView/RegicideSetupData, phases, moves, playerView
  gameDef.test.ts            # headless Client() coverage of every acceptance criterion
  index.ts                   # GameModule, id 'regicide-v1', minPlayers 2, maxPlayers 4, no settingsSchema, no BoardComponent import
  regicideModule.conformance.test.ts   # secretKeys: ['hands']
```

Registration: `game-core/src/gamesCatalog.ts` only (import + array entry)
— `boards.ts`/`client/src/boardRegistry.ts` wiring is feature 023's job,
once `RegicideBoard` exists to register.

## Non-goals (implementation-level, beyond spec.md's own)

- No i18n/locale additions in this feature — per Love Letter's own
  014/015 split (locale strings for `G.log` keys and any other
  player-facing text are added where the *renderer* lives, i.e. feature
  023's `packages/client` work, not here). `G.log` entries this feature
  pushes carry `key`/`params` only, same as every other rules-only
  feature's `log` entries before their board ships.
- No `BoardComponent.tsx` or any file under a path Node can't resolve
  (`.module.css`, React) — `index.ts` imports only `gameDef.ts`, per
  `types.ts`'s own documented reason (`GameModule` must stay
  server-safe).
