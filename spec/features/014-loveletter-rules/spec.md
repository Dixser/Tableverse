# Feature 014 — Love Letter: Rules Engine

Rules source: the official Love Letter (2nd edition, Z-Man Games, 2019)
rulebook. Card effects below are restated in this document's own words,
not quoted from the rulebook — game rules/mechanics are facts, not
protected expression, but the rulebook's specific phrasing is not
reproduced here.

## Versioning classification (per tech-stack.md's heuristic)

**One catalog entry, `loveletter-v1`**, with an `edition` setting
(`'normal' | 'classic'`), not two independent catalog entries. Applying
the heuristic ("if the new version is a superset of the old one, it's a
parameter of the same module... if it changes or removes base rules, it's
an independent catalog entry") to the two editions this feature ships:

- **Classic's card pool is a strict subset of Normal's** (Normal minus 1
  Guard, both Chancellors, and both Spies — see "Deck composition"
  below). Historically Classic *is* the original 1995/2012 edition and
  Normal is the 2019 edition that added the Chancellor and Spy cards on
  top of it — Normal is the superset, Classic the subset.
- Neither edition changes turn structure, the definition of a round, how
  a round ends, or how the match-level win condition (accumulating favor
  tokens across rounds) works — only the deck's composition and the
  supported player-count range differ, both of which are ordinary
  `setup`-time data, not a different `Game` shape.

This is exactly the "additive/parametric" case tech-stack.md's heuristic
describes, not the "structural" one — one `Game` definition, `edition`
resolved inside `setup` at match-creation time.

## Deck composition

| Rank | Name | Normal qty | Classic qty | Effect summary |
|---|---|---|---|---|
| 0 | Spy | 2 | 0 (removed) | No effect when played/discarded. If you're the only player who played or discarded a Spy by the time the round ends, you gain a bonus favor token — this never overrides the round's actual winner, who still gets their own token. |
| 1 | Guard | 6 | 5 | Name any rank other than Guard and pick an opponent; if their hand holds that rank, they're eliminated from the round. |
| 2 | Priest | 2 | 2 | Privately look at one opponent's hand. |
| 3 | Baron | 2 | 2 | Privately compare hands with one opponent; whoever holds the lower rank is eliminated. A tie eliminates neither. |
| 4 | Handmaid | 2 | 2 | You cannot be targeted by any other player's card effect until the start of your next turn. |
| 5 | Prince | 2 | 2 | Force any player, including yourself, to discard their current hand (its effect does not resolve) and draw a replacement — from the deck normally, or from the single facedown set-aside card if the deck is empty. If the discarded card was the Princess, that player is eliminated. |
| 6 | Chancellor | 2 | 0 (removed) | Draw two cards from the deck, then return two of your three held cards to the bottom of the deck in an order you choose, keeping one. |
| 7 | King | 1 | 1 | Trade hands with another player. |
| 8 | Countess | 1 | 1 | No effect when played/discarded. If your other held card is the King or a Prince, you must play the Countess this turn instead of that other card. |
| 9 | Princess | 1 | 1 | Being played or discarded for any reason immediately eliminates you from the round, even as a side effect of another player's Prince. |

Normal: 21 cards total. Classic: 16 cards total (Normal minus 1 Guard, 2
Chancellors, 2 Spies). Both editions share every other card's quantity.

## Round & match structure

- A **match** is a series of **rounds**. Winning enough rounds' favor
  tokens wins the match — this two-level structure (round vs. match) is
  the core rule this feature's `Game` definition has to model, unlike
  Tic-Tac-Toe's single-round match.
- **Setup (each round):** shuffle the edition's deck; set aside the top
  card facedown, unseen by anyone; in a 2-player match only, additionally
  set aside the next 3 cards faceup (publicly visible, permanently out of
  the round). Deal one card to each non-eliminated... — deal one card to
  every seated player (nobody is eliminated at the start of a round).
- **Turn:** the active player draws one card (now holding two), then
  plays exactly one of their two held cards, resolving its effect. A
  player forced out of the round (see "Elimination effects" above) is
  skipped for the remainder of that round — turn order moves to the next
  player still in the round.
- **Round ends** when either: the deck is exhausted (all still-in-round
  players reveal their hand; the highest rank wins, all tied ranks win on
  a tie), or exactly one player remains in the round (they win
  immediately, hand unrevealed).
- **Each round's winner(s) gain one favor token**, tracked per player,
  cumulative across the whole match (feature 015 renders this live —
  see this feature's `roundWins` field below, which feature 015 reads).
- **Match ends** the moment any player's cumulative token count reaches
  the win threshold for the seated player count (table below); on a
  round that produces multiple simultaneous winners, more than one player
  may cross the threshold in the same round, producing a multi-winner
  match end (feature 009's `GameoverResult.winner` already supports an
  array for exactly this case).

| Seated players | Tokens to win |
|---|---|
| 2 | 6 |
| 3 | 5 |
| 4 | 4 |
| 5 | 3 |
| 6 | 3 |

Classic edition supports only 2-4 seated players, using the same table's
2/3/4 columns unchanged.

## Resolved design decisions

- **`minPlayers = 2`, `maxPlayers = 6`** (Normal's range, the superset) —
  `GameModule`'s static fields can't vary per `edition` setting (feature
  013's own non-goal). A Classic match started with more than 4 seats
  claimed is rejected at `startMatch` time with a clear error, not
  prevented by hiding seats 5-6 in the picker — an accepted UX gap, not a
  platform change; see feature 013's spec.md Non-goals for why the seat
  picker doesn't shrink dynamically, and plan.md for exactly where this
  feature's own validation hook goes.
- **First player of the match's first round** is seat `'0'` — the
  rulebook's own tiebreaker ("whoever most recently wrote a physical
  letter") has no digital equivalent; seat `'0'` matches Tic-Tac-Toe's
  existing convention (feature 002 starts with player `'0'`) rather than
  inventing a new rule.
- **First player of every subsequent round** is the prior round's winner;
  on a tied round-end, the next starter is chosen uniformly at random
  among the tied winners, via boardgame.io's `random` plugin (never
  `Math.random()`, per tech-stack.md).
- **The deck's remaining cards and the single facedown set-aside card are
  hidden from every player and every spectator equally** — this is not a
  per-player secret (nobody has looked at it, not even the player who
  eventually draws it), so it does not fit the conformance suite's
  per-owner `secretKeys` model. See plan.md for how `playerView` handles
  a "hidden from everyone" field distinctly from a "hidden from
  non-owners" field.
- **A card's played-or-discarded status is always public** (per the
  rulebook's own requirement that all played/discarded cards stay
  visible) — modeled as a public per-player list, not filtered by
  `playerView` at all.
- **Baron/Priest results are never public.** The fact that a Baron
  comparison *happened*, and between whom, is public (a `G.log` entry,
  per feature 012's contract — e.g. "Player A used the Baron on Player
  B"). The actual compared ranks, and the actual card a Priest views, are
  visible only to the acting player — a `playerView`-filtered private
  field, structurally identical to `hands` (feature 015 renders it; this
  feature only defines and populates the field).

## User stories

### 1. Playing a full round to a deck-exhaustion win

As a seated player, when the deck runs out, my hand (and every other
still-in-round player's hand) is revealed and compared; the highest rank
wins the round and gains a favor token, with a tie splitting the token
among every tied top rank.

### 2. Playing a full round to a last-player-standing win

As a seated player, when every other player has been eliminated by card
effects, the round ends immediately in my favor without a deck-exhaustion
reveal, and I gain a favor token.

### 3. Using a targeted card correctly resolves its public and private halves

As the player using the Baron (or Priest), the fact that I targeted a
specific opponent with that card is visible to everyone; the actual
compared ranks (or the viewed card) reach only me.

### 4. The Countess's forced-play rule is enforced

As a player holding the Countess alongside the King or a Prince, I cannot
play the other card — the game rejects that attempt and requires me to
play the Countess instead.

### 5. Winning enough rounds wins the match

As a seated player, once my favor-token count reaches this match's
threshold for the current player count, the match ends in my favor (or
in a tied multi-winner end, if another player crosses the threshold in
the same round) — I don't need to keep playing further rounds.

### 6. Playing the Classic edition

As a host who selected the Classic edition (via feature 013's settings
form) with 2-4 seats claimed, the match is dealt from the 16-card Classic
deck — no Chancellor or Spy is ever drawn, and only 5 Guards exist.

## Acceptance criteria

`[unit]` denotes a headless-`Client` test against this feature's `Game`
definition. `[conformance]` denotes the shared conformance suite from
feature 001.

1. `[unit]` A round's `setup` at both `edition: 'normal'` and `edition:
   'classic'` produces a deck of the correct composition and size (21 vs.
   16 cards), with the correct facedown/faceup set-aside behavior at 2
   players vs. 3+.
2. `[unit]` Each of the ten cards' effects, exercised individually:
   Guard's correct-guess elimination and incorrect-guess no-op (and that
   naming "Guard" itself is rejected as an illegal guess); Priest's
   private reveal populates only the acting player's private field;
   Baron's lower-rank elimination and tie-no-effect; Handmaid's
   protection blocking targeted effects until the protected player's next
   turn, including the "everyone else is protected" fallback behavior;
   Prince's forced discard-and-redraw, including the empty-deck-draws-the-
   facedown-card case and the Princess-discard elimination case; King's
   hand swap; Chancellor's draw-two-keep-one-return-two-to-bottom
   (including the empty/near-empty deck edge cases); Countess's
   forced-play rule when held with King or Prince, and that it's optional
   otherwise; Princess's immediate elimination on play or discard.
3. `[unit]` A round ends correctly both ways: deck exhaustion (highest
   hand wins, ties split the token) and last-player-standing (immediate
   win, no reveal).
4. `[unit]` Turn order skips eliminated players correctly, resuming
   normal order once only non-eliminated players remain.
5. `[unit]` Favor tokens persist across rounds within one match (a second
   round's `setup` does not reset `roundWins`), and the match ends
   (`ctx.gameover` populated per `GameoverResult`) the instant any
   player's token count reaches the threshold for the current seated
   player count — including a simultaneous multi-winner case.
6. `[unit]` Starting a `classic`-edition match with more than 4 seats
   claimed is rejected (a clear setup error, not a silent truncation to 4
   players).
7. `[unit]` A `G.log` entry (feature 012's `GameLogEntry` contract) is
   appended for every publicly-observable event: a card played (naming
   the player and card, and its target if any), an elimination, a round's
   winner(s), and the match's winner(s) — but never for the private
   content of a Baron comparison or a Priest's view.
8. `[conformance]` `testGameModuleConformance(loveletterModule, {
   secretKeys: ['hands', 'privateReveals'] })` passes at both `minPlayers`
   (2) and `maxPlayers` (6) — including determinism under a fixed seed,
   proving the shuffle and every card effect that consumes randomness
   (Guard naming aside, which is player choice, not randomness) go
   through boardgame.io's `random` plugin.
9. `[unit]` The deck's remaining contents and the facedown set-aside card
   are absent from `playerView`'s output for every `playerID` (including
   `null`/spectator) — verified directly, since this "hidden from
   everyone" guarantee is structurally different from or the
   `secretKeys` per-owner check in AC8 and needs its own assertion (see
   plan.md).

## Non-goals

- Any client/UI concern — hand display, target-selection UI, the
  round-wins display, private-reveal rendering. All of that is feature
  015, which depends on this feature's `G`/`BoardProps` shape.
- A shared board-UI kit — deferred per roadmap.md until feature 015 (the
  second real `BoardComponent`) exists to extract from.
- Making `GameModule.minPlayers`/`maxPlayers` reactive to the `edition`
  setting — see "Resolved design decisions" above; this is feature 013's
  explicit non-goal, not solved here either.
- A 4th, "expanded" edition or any card beyond the 21 in the 2019
  rulebook (no promo/expansion cards).
- AI/bot opponents, move history/replay UI beyond what `G.log` already
  provides for chat.
