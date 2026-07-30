# Feature 028 — Cahoots: Rules Engine

Rules source: the official rulebook for *Cahoots* (Ken Gruhl, 2018
Gamewright), https://world-of-board-games.com.sg/docs/Cahoots.pdf. Card
effects and goal mechanics below are restated in this document's own
words, not quoted from the rulebook — game rules/mechanics are facts, not
protected expression, but the rulebook's specific phrasing is not
reproduced here. Shipped under the working title **Mission Accomplished**
(`displayName`); the catalog `id` and this spec both use the rulebook's
own name, Cahoots, since that's what the rules/tests trace back to.

The rulebook's four card suits (in Cahoots' own physical edition) are
replaced with **Blue, Yellow, Red, Green** per the user's request — a
cosmetic renaming only, the mechanics (match by color or by number) are
unchanged. The goal-card set is **not** the rulebook's own 50-card deck
(not available as data); it is a hand-authored 54-card set built from
`goals.md`, covering every goal family the user specified.

## Versioning classification (per tech-stack.md's heuristic)

**New catalog entry, `cahoots-v1`.** A pile-building goal-completion game
with no trick-taking, no phases, and a "current player has zero legal
plays" loss condition shares no turn structure, phase shape, or win/loss
condition with any existing module. `minPlayers: 2, maxPlayers: 4` — the
rulebook's own range.

## Description

### Cards and dealing

- **56 number cards**: 4 colors (Blue, Yellow, Red, Green) × numbers 1-7,
  two copies of each number per color.
- **Dealing**: shuffle the 56 cards. Deal 4 face-down to each active seat
  (kept secret, same as any hand). Deal 4 more face-up in a fixed
  left-to-right row to seed the 4 piles (`G.piles[0..3]`, one card each).
  The remainder becomes the face-down draw pile.
- **Piles keep their full history, not just the top card** — `G.piles[i]`
  is the whole stack (bottom to top), all public. The rulebook explicitly
  allows looking through a pile at any time to see what's been played;
  storing the full stack (not just the current top) is what makes that
  possible for the client, not a new mechanic.

### Goal deck and difficulty

- A hand-authored 62-entry `GoalDefinition` set (see "Goal catalog"
  below), independent of the physical rulebook's own 50 cards, built from
  `goals.md`.
- The host picks a **difficulty** (`settingsSchema.difficulty`:
  `beginner | normal | expert | insane`, default `beginner`). Combined
  with the active seat count, this determines the **target goal count**
  for the match — exactly the rulebook's own table:

  | Difficulty | 2-3 players | 4 players |
  |---|---|---|
  | beginner | 15 | 12 |
  | normal | 18 | 15 |
  | expert | 21 | 18 |
  | insane | 24 | 21 |

- At setup, the full 62-entry goal set is shuffled and sliced down to
  exactly `targetGoalCount` entries — this slice, not the full 62, is
  this match's entire goal pool. 4 are flipped face-up as `G.activeGoals`;
  the rest sit face-down as `G.goalDeck`.
- **Winning is completing every goal in this match's sliced pool** —
  `G.completedGoals.length >= G.targetGoalCount`, not "complete 4 visible
  goals." `targetGoalCount` is both the slice size and the win threshold,
  by construction (they're the same number).

### Turn structure

- **First player is random** (via the boardgame.io `random` plugin,
  replacing the rulebook's own "whoever last ate something orange"
  tiebreaker) — chosen once at setup, stored as `G.firstSeatID`, and fed
  into a custom `TurnOrder.first`. Turn order proceeds clockwise from
  there (`ctx.playOrder`), skipping any unclaimed phantom seat, same
  `nextActiveSeatIndex`-style pattern as Crew/Regicide.
- **A turn is a single move, `playCard(pileIndex, cardID)`**, combining
  both of the rulebook's two turn steps (play, then draw) — there is no
  player decision in the draw step (always exactly 1 card, always
  automatic when the deck isn't empty), so it doesn't need its own move
  or phase, matching Regicide/Crew's precedent of folding a no-choice
  follow-up step into the same move that triggered it:
  1. The named card must be in the caller's hand and legally placeable on
     the named pile (`isLegalPlacement`: same color as the pile's current
     top card, or same number, or both).
  2. Remove it from hand, push it onto the pile.
  3. **Resolve goals** (see below) — looped until stable, since playing
     one card can complete several goals at once, and a newly-revealed
     replacement goal can itself already be satisfied.
  4. If the draw pile isn't empty, draw exactly 1 card into the acting
     seat's hand.
  5. End turn.
- There is deliberately **no boardgame.io phase machinery** at all — one
  flat turn order, one move, no `phases` block. Nothing in this game
  needs a wait-for-everyone step (`roundConfirm`), so it isn't used.

### Goal resolution

Runs after every card is played, and once at setup against the initial
layout (the rulebook's own "goals completed by the starting cards" case):

1. For every currently active goal, check it against the current
   `G.piles`. Any that are satisfied move to `G.completedGoals` (the
   rulebook's "wins pile").
2. Refill `G.activeGoals` back up to 4 from `G.goalDeck` (fewer than 4 if
   the goal deck has run dry — the rulebook's own explicit exception).
3. Repeat from step 1 until nothing changes in a full pass — a freshly
   drawn goal may itself already be satisfied by the current piles, and
   must be checked before the resolution loop stops.

### Win and loss

Both computed inside `endIf({ G, ctx })` — a pure function of state, not
a stored `matchResult` flag, since (unlike Crew) there's no phase
transition this needs to avoid triggering:

- **Win**: `G.completedGoals.length >= G.targetGoalCount`. Every active
  seat is a winner.
- **Loss (empty table)**: the draw pile is empty AND every active seat's
  hand is empty.
- **Loss (stuck player)**: the seat whose turn it currently is
  (`ctx.currentPlayer`) holds no card that legally matches any of the 4
  piles' current top cards. This is checked directly off `ctx.currentPlayer`
  after each move's `endTurn()` has been processed (and once immediately
  after setup, before any move — a bad initial deal can end the match
  before the first `playCard` ever succeeds). Note a stuck player with a
  genuinely empty hand (0 cards) is also caught here — `hasLegalMove` on
  an empty hand is vacuously false — so this condition subsumes an
  individual seat running out of cards early; the "empty table" loss
  above only matters for the simultaneous case the rulebook names
  explicitly.
- Loss returns `{}` (no winner) — win returns `{ winner: activeSeatIDs }`
  — both conforming to `GameoverResult` (types.ts), rendered generically
  by `GameoverBanner`.

### Goal catalog

`GoalDefinition` is a discriminated union on `kind`; each entry below is
one *instance* (a concrete goal card) in the 62-entry pool, not a
template. `piles` in every checker below means `G.piles.map(pile =>
pile[pile.length - 1])` — the 4 current top cards, left to right. Per the
rulebook's own "Notes": every goal must match **exactly** as written (a
"3 of a color" goal is false if 4 piles show that color, not just true
"at least 3"), and any goal naming a specific color requires at least one
pile of that color actually present (guards a vacuous zero-cards-of-that-
color pass).

| kind | params | count | meaning (goals.md line) |
|---|---|---|---|
| `noRepeatedValues` | — | 1 | all 4 top numbers distinct (2) |
| `noRepeatedColors` | — | 1 | all 4 top colors distinct (3) |
| `noRepeatedValuesAndColors` | — | 1 | both of the above at once (4) |
| `aboveFour` | — | 1 | every top number > 4 (5) |
| `belowFour` | — | 1 | every top number < 4 (6) |
| `allOdd` | — | 1 | every top number odd (7) |
| `allEven` | — | 1 | every top number even (8) |
| `splitParity` | — | 1 | positions 0&2 share one parity, 1&3 share the other, and the two differ (9) |
| `straightOfFourAnyOrder` | — | 1 | the 4 numbers, sorted, are 4 consecutive integers; position irrelevant (10) |
| `straightOfThreeInOrder` | — | 1 | some 3 consecutive positions (0-1-2 or 1-2-3), left to right, are strictly increasing by 1 each step (11) |
| `sumAll` | `target: 10\|15\|18\|20` | 4 | the 4 top numbers sum to `target` (12) |
| `sumColor` | `color`, `target` | 8 | the top numbers of piles matching `color` sum to `target`; blue {3,9}, red {4,10}, green {6,7}, yellow {2,11} (13-16) |
| `exactlyThreeColor` | `color` | 4 | exactly 3 of the 4 top piles are `color` (17/18, collapsed — see "Resolved design decisions") |
| `twoAdjacentColor` | `color` | 4 | exactly 2 top piles are `color`, at positions 1 apart (19) |
| `twoNotAdjacentColor` | `color` | 4 | exactly 2 top piles are `color`, at positions ≥2 apart (20) |
| `twoAlternatedColor` | `color` | 4 | exactly 2 top piles are `color`, at positions exactly 2 apart (0&2 or 1&3) (21) |
| `colorPairOnly` | `colors: [A, B]` | 6 | every top pile's color is `A` or `B` — one goal per unordered color pair (22) |
| `colorSumEquals` | `colorA`, `colorB` | 6 | the sum of `colorA` top piles equals the sum of `colorB` top piles, whatever that total is — one goal per unordered color pair, both colors required present (23, generalized) |
| `colorSumDoubles` | `doubleColor`, `halfColor` | 12 | the sum of `doubleColor` top piles is exactly double the sum of `halfColor` top piles — one goal per ORDERED color pair (`doubleColor ≠ halfColor`), both colors required present (24, generalized) |

Total: 62 goal-card instances.

## Resolved design decisions

- **Goals 17/18 (`goals.md`) were an identical-text duplicate** — per
  user decision, collapsed to a single `exactlyThreeColor` set of 4 (one
  per color), not 8.
- **Adjacent/alternated/not-adjacent position semantics** (pile positions
  0-3, left to right), per user decision: adjacent = index distance 1;
  alternated = index distance exactly 2; not-adjacent = index distance
  ≥2. This means `twoNotAdjacentColor` and `twoAlternatedColor` overlap
  (a distance-2 pair satisfies both) — accepted; goal cards are not
  required to be mutually exclusive of each other.
- **`straightOfThreeInOrder` is position-sensitive**, per user decision —
  unlike `straightOfFourAnyOrder` (which explicitly ignores position),
  this goal requires 3 *consecutive* piles, left to right, in strictly
  increasing order.
- **`colorPairOnly` requires every card to be one of the two named
  colors, not that both colors are simultaneously present.** "And/or" in
  the rulebook's own phrasing for this goal family is read as a per-card
  OR, so e.g. 4 blue piles legitimately satisfies "every card is blue
  and/or yellow." No stricter "at least one of each" reading is applied,
  since the rulebook's "must have at least one named color in play" note
  is read as guarding against a *zero*-cards-of-that-color vacuous pass,
  not requiring every named color to be simultaneously represented.
- **The communication restriction (no stating hand contents) is not
  enforced in software.** It's an honor-system social mechanic in the
  physical game; this platform already has free-text chat (feature 012)
  and nothing about that changes here. Out of scope, not a Non-goal
  oversight.
- **No `roundConfirm` phase.** Unlike Crew/Love Letter, nothing in
  Cahoots has a simultaneous "wait for everyone" step — goal resolution
  and the draw are both fully automatic and synchronous inside the one
  move that triggers them.
- **`G.piles` stores full stacks, not just tops**, specifically so the
  client can offer the rulebook-sanctioned "look through a pile" view
  without any extra hidden state — this is public information regardless
  of stack depth.
- **Goals 23/24 (`greenEqualsRedValue`/`redDoublesBlueValue`) were
  generalized from goals.md's literal wording, per user decision.** The
  original goals.md phrasing named a fixed value ("a green card and a red
  card both show 5") and hard-coded the color pair (green/red, red/blue).
  The user's revised intent: no fixed target value at all — just "the two
  colors' *total sums* match" (`colorSumEquals`) or "one color's total sum
  is exactly double the other's" (`colorSumDoubles`) — generalized to
  *every* color pair rather than one hard-coded pair, and both now
  explicitly require at least one pile of each named color actually
  present (otherwise an absent color's sum is vacuously 0, and two absent
  colors would trivially satisfy either goal via `0 === 0`).
  `colorSumEquals` is symmetric (A equals B is the same statement as B
  equals A), so it gets one entry per **unordered** pair (6, same count
  and pairing as `colorPairOnly`). `colorSumDoubles` is directional (A
  doubles B is a different, independently-achievable condition from B
  doubles A), so — per explicit user decision — it gets one entry per
  **ordered** pair (12: every color as the "doubled" side against each of
  the other 3), not one arbitrary direction per unordered pair.

## User stories

### 1. Starting a match with a random first player and the right goal count

As a seated player, once the match starts, I see my 4-card hand, the 4
face-up piles, and 4 active goals — with the target goal count for this
match fixed by whatever difficulty the host picked, scaled for however
many of us actually claimed a seat.

### 2. Playing a card

As the active seat, I can play any card from my hand onto any pile whose
current top card shares its color or its number (or both); playing it
immediately checks for completed goals, refills the goal row, draws me
back up if the deck still has cards, and passes the turn clockwise.

### 3. Multiple goals completing at once, or a freshly-revealed goal already being satisfied

As any seated player or spectator, if one card play satisfies more than
one active goal, all of them move to the completed pile and are replaced
in the same resolution — and if a just-replaced goal is itself already
true of the current piles, it completes too, without needing another
turn to happen first.

### 4. Winning

As any seated player, the moment the completed-goals pile reaches this
match's target count, the match ends in a win for everyone seated — we
don't need to finish out the deck.

### 5. Losing because nobody can play

As any seated player, if the deck is empty and the piles have not yet let
someone play their entire hand down to nothing on both counts (draw pile
AND every hand empty), the match doesn't yet end — but the moment the
seat whose turn it is holds no card that matches any pile, the match ends
in a loss, even mid-deck.

### 6. Reviewing a pile's history

As any seated player or spectator, I can see every card ever played into
a given pile, not only its current top card.

## Acceptance criteria

`[unit]` denotes a headless-`Client` test against this feature's `Game`
definition. `[conformance]` denotes the shared conformance suite.

1. `[unit]` `setup` at 2, 3, and 4 active seats deals 4 cards to each
   hand, seeds all 4 piles with 1 card each, and puts everything else in
   the draw pile — total cards across hands + piles + draw pile is always
   56.
2. `[unit]` `targetGoalCount` matches the difficulty × player-count table
   exactly for all 4 difficulties at both the 2-3-player and 4-player
   bands; the goal deck slice used for the match is exactly that many
   entries, 4 of which start face-up.
3. `[unit]` The first player is randomized (varies across seeded runs)
   and turn order then proceeds clockwise among active seats only,
   skipping any unclaimed phantom seat.
4. `[unit]` `isLegalPlacement` accepts a card matching the target pile's
   top card by color, by number, or both, and rejects one matching
   neither; `playCard` enforces it via `INVALID_MOVE`.
5. `[unit]` A successful `playCard` removes the card from hand, appends
   it to the named pile (not replacing the pile's history), runs goal
   resolution, draws exactly 1 replacement card when the draw pile is
   non-empty (0 when it's empty), and ends the turn.
6. `[unit]` Goal resolution: a play that satisfies 2+ active goals moves
   all of them to `completedGoals` in the same resolution and refills
   every vacated slot; a refilled goal that's already true of the current
   piles is itself resolved in the same pass, not left pending for the
   next turn; once the goal deck is empty, `activeGoals` is allowed to
   shrink below 4 rather than blocking.
7. `[unit]` Every one of the 19 goal `kind`s in the catalog table above
   is independently unit-tested: at least one board state that satisfies
   it and one adjacent/near-miss state that doesn't (e.g. 4-of-a-color
   correctly failing an `exactlyThreeColor` goal; a distance-3 pair
   correctly failing `twoAlternatedColor` while passing
   `twoNotAdjacentColor`).
8. `[unit]` `endIf` returns a win (`{ winner: activeSeatIDs }`) the
   instant `completedGoals.length` reaches `targetGoalCount`, including
   when that threshold is crossed by the initial setup-time resolution
   before any move has been played.
9. `[unit]` `endIf` returns a loss (`{}`) when the draw pile is empty and
   every active hand is empty, AND separately when the seat currently up
   holds no card matching any pile's top card, including immediately
   after setup if the initial deal happens to leave the first player
   stuck.
10. `[unit]` `playerView` never exposes any seat's hand contents to
    another seat or to a spectator (`playerID: undefined`); `G.piles`,
    `activeGoals`, `completedGoals`, and hand *counts* are visible to
    everyone.
11. `[conformance]` `testGameModuleConformance(cahootsModule)` passes at
    both `minPlayers` (2) and `maxPlayers` (4), including determinism
    under a fixed seed.

## Non-goals

- The rulebook's own 50-card goal deck as literal data — a hand-authored
  62-entry set built from `goals.md` is used instead (see "Description").
- Enforcing the communication restriction — honor-system, unenforced, per
  "Resolved design decisions."
- The "Speed Cahoots" / "Mum's the Word" / "Lil Cahoots" printed variants
  — none requested; not built.
- Any client/UI concern — all of that is feature 029.
