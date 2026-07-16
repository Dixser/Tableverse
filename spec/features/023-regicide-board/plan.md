# Feature 023 — Implementation plan

## File layout

Per `packages/game-core/src/boards.ts`'s established convention (Love
Letter, The Mind), everything lives under
`packages/game-core/src/games/regicide/`, colocated with feature 022's
rules engine:

- `BoardComponent.tsx` / `.module.css` / `.test.tsx` — top-level board,
  owns the card-selection draft state machine.
- `CardTile.tsx` / `.module.css` / `.test.tsx` — placeholder card (rank +
  suit, no artwork), keyed off `Card`'s `kind`/`suit`/`rank` instead of
  Love Letter's single numeric rank. Doubles as interactive hand card and
  inert compact badge (cards in play / discard), same convention as
  Love Letter's `CardTile`.
- `HandView.tsx` / `.module.css` / `.test.tsx` — own hand, toggle-select
  using `legalPlay.ts`'s `isLegalSelection` to compute per-card
  disablement (AC1-3).
- `EnemyPanel.tsx` / `.module.css` / `.test.tsx` — enemy rank/attack/
  health/damage/shield/"damage you'll take" (AC6), Tavern/discard/Castle
  counts (AC9), and the round-defeat confirmation UI (AC9a — see below).
- `HandCountBadges.tsx` / `.module.css` / `.test.tsx` — every seated
  player's hand count, mirrors The Mind's `PlayerStatusList` (AC7).
- `DefendPanel.tsx` / `.module.css` / `.test.tsx` — the `defend`-stage
  discard UI (see "Defend stage" below — not separately numbered in the
  ACs but required for the game to be playable at all).
- `JesterNextPlayerPicker.tsx` / `.module.css` / `.test.tsx` — seat picker
  for story 5 / AC8, mirrors Love Letter's `TargetPicker`.
- `playerLabel.ts` — copy of Love Letter's/The Mind's per-game helper
  (seat → display name, `room.seatLabel` fallback). Not shared across
  games per this feature's own Non-goals (no shared board-UI kit yet).
- `i18nFixture.ts` — TEST_-prefixed fixture, same convention as Love
  Letter/The Mind.

Registration (mechanical, three files):
- `packages/game-core/src/boards.ts` — add
  `export { RegicideBoard } from './games/regicide/BoardComponent.js';`
- `packages/client/src/boardRegistry.ts` — import `RegicideBoard`, add
  `'regicide-v1': RegicideBoard` to the map.
- `packages/game-core/src/gamesCatalog.ts` — already wired (feature 022).

## Resolved design decisions (spec vs. existing architecture)

### 1. AC9a's "N of M confirmed"/Confirm/force-advance — revised: chrome-owned, not board-owned

AC9a's literal wording ("[RegicideBoard] renders ... a 'N of M
confirmed' count and a Confirm button ... a force-advance control")
reads as asking `RegicideBoard` itself to own this UI. An earlier pass
implemented exactly that inside `EnemyPanel` (a duplicated
`roundConfirmDisplay.ts` resolver) — but every other game embedding
`RoundConfirmG` (Love Letter) already gets this UI for free from
`GameMount`'s generic `RoundConfirmBanner`, which is unconditionally
rendered above every board (see `GameMount.tsx`). Mounted through the
real app, both fired at once: two "N of M confirmed" panels, two
Confirm buttons. Patching that over with a `GameModule.ownRoundConfirmUI`
opt-out flag would have fixed the symptom but kept two independent
implementations of the same wait-for-everyone mechanism alive.

Corrected reading: AC9a's *substance* — the frozen enemy state, and
Play/Yield disabling — is genuinely Regicide-specific and belongs in
`EnemyPanel`/`BoardComponent`. The N-of-M/Confirm/force-advance
controls themselves are not; they're `RoundConfirmBanner`'s job,
unchanged, same as Love Letter. `EnemyPanel` now takes only
`roundConfirm: RoundConfirmState | null` (to decide whether to show a
"Defeated" badge next to the frozen stats) and renders no
Confirm/force-advance controls of its own —
`currentEnemy`/`damageDealt`/`spadeShieldTotal` already keep showing
the finishing numbers for free, since `resolveEnemyDefeat` doesn't
reset them until the `roundConfirm` phase's `onEnd` runs. No
`GameModule` capability flag, no duplicated resolver — `GameMount`,
`RoundConfirmBanner`, and `types.ts` are all back to their
pre-feature-023 shape.

Play/Yield still render `disabled` for every seat whenever
`G.roundConfirm !== null` (AC9a's last sentence) — that part is
`BoardComponent`'s own responsibility, independent of who renders the
confirm controls.

### 2. Jester next-player choice (story 5 / AC8) — no round trip mid-choice

`playCards`' `jesterNextPlayerID` param is validated synchronously inside
the same atomic move (`gameDef.ts` lines 369-376) — feature 022 resolved
its own open question ("a parameter of `playCards`, or a following move")
in favor of the parameter form. Consequence: the next-player choice must
happen 100% client-side *before* the move is ever sent; no G field
carries a "someone is currently choosing" state, and none should be
added (spec.md line 6-8: this feature's props are feature 022's shape
as-is, not a speculative one).

Resolution: `BoardComponent` holds local-only draft state (never written
to G, same category as Love Letter's `MoveDraft`) —
`{ step: 'choosingJesterNext'; jesterCardID: string }` — entered when the
current selection is a lone Jester and Play is pressed; only the acting
seat's own client can ever reach this step, since `HandView`/Play gate
all interactivity on `isActive`. `JesterNextPlayerPicker` lists
`G.activeSeatIDs` minus the acting seat. Every other viewer (including a
spectator) can never observe this in-progress local choice — for AC8's
"a waiting indicator (no picker) for every other seat's view", the board
already shows a persistent "current turn: {name}" status line (mirroring
Love Letter's own status line) whenever it isn't the viewer's turn; the
AC's assertion for a non-acting seat is that no picker renders (true by
construction) and that this turn indicator is present.

### 3. `defend`-stage UI (`discardCards`) — not in the numbered ACs, but required

No AC enumerates a defend/discard UI, yet `regicideGameDef`'s `defend`
stage requires the active player to call `discardCards` before the turn
can end whenever Step 4 triggers — without it the game cannot be played
past the first non-lethal turn, and AC12's manual full-match playthrough
requires it. `DefendPanel` renders whenever `G.pendingDefense !== null`
for the current player (own hand, running-total discard selection,
submit once the total reaches `G.pendingDefense.requiredTotal`) — same
toggle-then-submit shape as the Play flow, reusing `HandView`/`CardTile`.
Flagging this explicitly since it's implementation necessity rather than
a numbered acceptance criterion.

## Card rendering

`CardTile` renders from a `Card` (feature 022's discriminated union)
directly rather than a bare rank, since Regicide cards need a suit too:
- number: rank digit + suit symbol (♠♥♦♣) + translated suit name.
- companion: "Animal Companion" + suit.
- jester: "Jester", no suit.
- face: J/Q/K + suit, plus (non-compact only) printed attack/health for
  use in the enemy panel's own reuse of `CardTile` for `currentEnemy`.

`disabled`/`disabledReason` follow `CardTile`'s existing
`onClick ? enabled : inert` convention; `HandView` computes both by
testing `isLegalSelection([...selected, candidate])` per card (AC1-3),
same shape as `HandView`'s existing `countessBlocksOtherCard` computation
for Love Letter, generalized to feature 022's own exported pure function
instead of a locally reimplemented one.

## i18n

New `regicide.*` namespace in `en.json`/`es.json` (cards, hand, enemy
panel, hand counts, defend, Jester picker, yield-disabled reason, deck
counts) — added to both files together so
`packages/client/src/i18n/localeParity.test.ts` stays green. Also fills
the pre-existing gap from feature 022: `regicide.log.*` keys
(`matchLostStuck`, `matchLostDefense`, `enemyDefeated`, `matchWon`,
`jesterPlayed`, `cardsPlayed`, `yielded`, `suffered`) referenced by
`G.log` entries but never added to either locale file — needed for
feature 012's `ChatPanel` (AC12's manual test explicitly checks this) even
though the board itself doesn't render `log`.

## Testing

Component tests per AC, fixture-built `RegicideView`/`Ctx` (no real
server), following Love Letter's `BoardComponent.test.tsx` conventions
(`@vitest-environment jsdom`, Testing Library, `i18nFixture.ts` import).
`isLegalSelection` is already covered by feature 022's
`legalPlay.test.ts` and reused, not retested.
