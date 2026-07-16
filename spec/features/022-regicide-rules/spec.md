# Feature 022 — Regicide: Rules Engine

Rules source: the official Regicide rulebook (Abrahams/Badger/Richdale,
art by SketchGoblin),
https://www.regicidegame.com/site_files/33132/upload_files/RegicideRulesA4.pdf.
Card effects below are restated in this document's own words, not quoted
from the rulebook — game rules/mechanics are facts, not protected
expression, but the rulebook's specific phrasing is not reproduced here.

## Versioning classification (per tech-stack.md's heuristic)

**New catalog entry, `regicide-v1`.** Regicide shares no turn structure,
win condition, or phase shape with any existing catalog entry: it is a
single-round-per-enemy, strictly-cooperative game with a four-step turn
(play-or-yield → suit power → damage → discard-to-defend) and a shared
loss condition (any one player failing to defend ends the match for
everyone). This is the "structural" branch of the heuristic, not the
"additive/parametric" one — there is no existing module this could be
expressed as a settings variant of.

## Description

Rules summary (authoritative numbers restated from the rulebook):

- **Deck split.** A single 52-card poker deck plus 2 Jesters (not part of
  a standard deck) is split into two decks at setup:
  - **Castle deck**: all 12 face cards. Shuffle the 4 Kings, place
    facedown; shuffle the 4 Queens, place facedown on top; shuffle the 4
    Jacks, place facedown on top of that. The pile is drawn Jack → Queen →
    King, four of each rank, at all times — never reshuffled as a whole
    once assembled.
  - **Tavern deck**: cards 2-10 of all four suits (36 cards), the 4 Animal
    Companions (one per suit — a card with a suit and no rank, always
    worth attack value 1), and a number of Jesters set by seated player
    count, shuffled together.

| Seated players | Jesters in Tavern deck | Starting/max hand size |
|---|---|---|
| 2 | 0 | 7 |
| 3 | 1 | 6 |
| 4 | 2 | 5 |

  (The rulebook's 1-player row is not implemented — see "Resolved design
  decisions" and Non-goals.)

- **Setup.** Assemble the Castle deck and Tavern deck as above. Reveal the
  top Castle card (a Jack) as the first enemy. Deal every seated player a
  hand up to their max hand size from the shuffled Tavern deck. Pick the
  starting player uniformly at random (the rulebook's own tiebreaker —
  "whoever most recently committed regicide" — has no digital equivalent;
  see "Resolved design decisions").

- **The match is 12 rounds**, one per Castle-deck card (4 Jacks, then 4
  Queens, then 4 Kings, always in that order since the pile was assembled
  that way and is never reshuffled). A round is the fight against one
  enemy: it starts when that enemy's card is revealed and ends the instant
  its remaining health reaches 0.

| Enemy rank | Attack | Health |
|---|---|---|
| Jack | 10 | 20 |
| Queen | 15 | 30 |
| King | 20 | 40 |

- **Turn order.** Ordinary clockwise seat order, with two overrides:
  1. The player whose card defeats an enemy (short of the 12th/final one)
     starts a fresh turn (Step 1) against the newly revealed next enemy
     once every seated player has confirmed they're ready to move on (see
     "Round-defeat confirmation" below) — they do not wait for their next
     clockwise turn, and the defeated enemy's turn skips Step 4 entirely
     (the newly revealed enemy has not acted yet).
  2. A player who plays a Jester (see below) chooses which seated player
     goes next, overriding clockwise order for that one transition only.
- **No dealing or reshuffling happens at a round boundary.** The Tavern
  deck, discard pile, and every hand carry over unchanged from the end of
  one enemy's fight to the start of the next — the only things that change
  are the current enemy and its accumulated spade-shield total, which
  resets to 0 for the new enemy. Nothing is ever dealt at this boundary —
  but see "Round-defeat confirmation" for why a pause still happens here
  despite that.

### Round-defeat confirmation

Defeating any enemy other than the 12th (the last King) does not
immediately hand off to the defeating player's bonus turn. Instead it
opens a wait, using feature 021's shared `roundConfirm` mechanism
(`beginRoundConfirm`/`confirmRoundReadyMove`/`forceAdvanceRoundMove`),
scoped to every currently seated player (including the defeating player
themselves), so everyone can see the fully-resolved final board state —
the defeated enemy's card, the damage/shield numbers that finished it off
— before it's replaced by the next enemy. No move other than
`confirmRoundReadyMove` (or the match's host calling
`forceAdvanceRoundMove`) is legal while this wait is pending; the next
Castle card is revealed and the defeating player's bonus Step 1 begins
only once every pending seat has confirmed. This repurposes feature 021's
mechanism for "let everyone see the result" rather than its original
"pause before the next deal" motivation — nothing is dealt at this
boundary (see above), but the same pending/confirmed bookkeeping and
host force-advance authorization apply unchanged. Defeating the 12th
enemy (the match win) does not open this wait — the match is already
over and `ctx.gameover`/the existing `GameoverBanner` (feature 009) is
the end state, with nothing further to confirm into.

### Turn structure (four steps)

**Step 1 — Play or yield.** The active player either plays a legal
selection of cards from their hand (see "Legal plays" below) face up in
front of them, or yields. A player may not yield if every other seated
player's own last turn was itself a yield (tracked per seat; see AC13).
Yielding skips straight to Step 4.

**Step 2 — Suit powers.** Every suit present in the played selection
triggers its power, evaluated once each at the selection's **total**
attack value (not per card — see "Legal plays"). Enemy suit immunity (see
below) can suppress a specific suit's power without suppressing the
selection's damage. Suit powers are mandatory, never optional:

| Suit | Power | Timing |
|---|---|---|
| ♥ Hearts | Heal: shuffle the discard pile, count out cards face down equal to the total attack value, place them under (bottom of) the Tavern deck, return the rest of the discard pile face up. | Resolved immediately in Step 2. |
| ♦ Diamonds | Draw: starting with the active player and proceeding clockwise, each seated player draws one card at a time until a number of cards equal to the total attack value have been drawn in total. A player already at their max hand size is skipped. Drawing stops with no penalty if the Tavern deck empties. | Resolved immediately in Step 2, **after** any Hearts power in the same selection (see below). |
| ♣ Clubs | Double damage: the selection's damage contribution in Step 3 is doubled. | Locked in at Step 3 of *this* turn — evaluated against the enemy's immunity as it stood at that moment; a later Jester cannot retroactively double it. |
| ♠ Spades | Shield: adds the total attack value to a running "spade total played against the current enemy" counter. | The counter is cumulative across every turn of the current enemy's round and reset to 0 only when a new enemy is revealed. Whether it currently reduces the enemy's attack is re-evaluated fresh every Step 4 against the enemy's *current* immunity (see "Enemy suit immunity" — this is what makes Jester-cancelled immunity retroactively unlock previously "wasted" spade value). |

**Ordering rule:** whenever both Hearts and Diamonds trigger from the same
selection (a multi-suit combo, or an Animal Companion paired with a card
of the other suit), Hearts resolves first. This is not cosmetic — Hearts
replenishes the Tavern deck's bottom before the Diamonds draw runs, which
can be the difference between a Diamonds draw exhausting the deck
mid-effect versus completing in full.

**Step 3 — Damage.** The selection's total attack value (doubled if any
played card is Clubs and not immune) is added to a running total damage
dealt to the current enemy this round. If that running total is now ≥ the
enemy's health, the enemy is defeated:

1. Move every card played against this enemy (by any player, across the
   whole round) to the discard pile.
2. If the defeated enemy was the 4th King (the last Castle deck card),
   the match ends in a win instead — see "Win/loss conditions." The
   defeated King card's own final placement (below) doesn't matter at
   that point and may happen either way.
3. Otherwise, a round-defeat confirmation wait opens (see "Round-defeat
   confirmation" above) — the defeated enemy's card **stays in place** as
   the current enemy for the rest of this step, still showing the damage
   total that finished it, precisely so every seated player can see that
   final state before it's replaced. Only once every seated player has
   confirmed (or the host force-advances) does the rest of this step
   actually happen: if total damage dealt exactly equalled the enemy's
   health, the enemy card goes face down on **top of** the Tavern deck (it
   re-enters play as a drawable card — see "Face cards in hand" below);
   otherwise (overkill) it goes to the discard pile. The next Castle deck
   card is then revealed as the new current enemy, the spade-shield
   counter and running damage total both reset to 0, and the defeating
   player skips Step 4 and begins a new Step 1 against the newly revealed
   enemy (see "Turn order" above).

**Step 4 — Suffer damage.** Skipped entirely if the enemy was just
defeated in Step 3, or if the active player yielded (Step 4 is reached
directly from Step 1 in that case, with no card played and thus no Step 2
or 3). Otherwise: compute the enemy's effective attack as its printed
attack value minus the current spade-shield counter (evaluated per the
Spades row above), floored at 0. The active player must discard cards
from their hand, one at a time face up to the discard pile, whose values
sum to at least that effective attack. Discard values: number cards use
their printed rank, Animal Companions are worth 1, Jesters are worth 0,
and a face card sitting in a hand (see below) is worth 10/15/20 by rank.
If the player cannot reach the required total even discarding their
entire hand, they are defeated and the match ends in a loss for everyone
immediately (an empty hand after discarding is otherwise fine). Play then
passes to the next seated player clockwise, starting a new Step 1.

### Legal plays (Step 1 selections)

Exactly one of the following, or a yield:

1. **A single card** (any rank/suit, including a face card sitting in
   hand — see below), attack value = its printed value. Always legal by
   itself (this is why "unable to play a card" as a loss trigger, see
   below, can only actually happen with an empty hand).
2. **A single Jester**, always played alone, attack value 0. Its only
   effect: cancel the current enemy's suit immunity going forward (does
   not retroactively affect this same turn's own resolution — there is no
   "this turn's own suit power" to retroactively unlock, since the Jester
   itself carries no suit), then skip Step 3 and Step 4 entirely, and the
   playing player chooses which seated player takes the next turn.
3. **A same-rank combo of 2, 3, or 4 cards** (2 through 10 only — face
   cards and Animal Companions cannot combo), whose printed values sum to
   ≤ 10 (so only ranks 2-5 can ever form a legal combo: a pair of 5s = 10
   is the ceiling). Attack value = the sum. Every suit among the combo's
   cards triggers its power once, each at the combo's total attack value.
4. **A single Animal Companion**, attack value 1, its own suit's power
   applied at value 1.
5. **An Animal Companion paired with exactly one other card** (a number
   card, a face card, or another Animal Companion — never a Jester, never
   part of a larger combo). Attack value = the Animal Companion's 1 plus
   the other card's value. Both cards' suit powers trigger at that
   combined total, except when both cards share the same suit, in which
   case that suit's power triggers only once (still at the combined
   total).

### Enemy suit immunity

Each enemy is immune to the suit power matching its own suit (e.g. the
Jack of Spades never grants a spade shield from spades played against it,
the Queen of Hearts never triggers a heal from hearts played against it).
Immunity blocks only the *power* — the card's attack value still counts
toward damage as normal. A Jester played against the current enemy
cancels this immunity from that point forward, for every card played
against this same enemy afterward (including by other players later in
the same round) — it does not retroactively apply to cards already
resolved earlier in the round, **except** for the Spades shield counter,
which is deliberately re-evaluated fresh every Step 4 (see the Spades row
above) — so previously-played, previously-immune spade value starts
counting the moment immunity is lifted, even though Clubs/Hearts/Diamonds
effects already resolved under immunity do not retroactively re-trigger.

### Face cards in hand

Whenever a Castle-deck card ends up as a Tavern deck card (only possible
via the exact-health-defeat rule placing it on top of the Tavern deck,
from which it can later be dealt out by a Diamonds draw), it behaves as an
ordinary Tavern card everywhere it matters: playable as a single-card
Step 1 selection (attack value 10/15/20 by rank, its own suit's power
applies normally, subject to the *new* current enemy's immunity, not the
enemy it came from) and discardable in Step 4 (value 10/15/20). It cannot
be combo'd or Animal-Companion-paired (rule 3/5 above already restrict
combos to ranks 2-10 and pairs to number/face/Animal-Companion cards —
face cards ARE eligible as the "other card" in an Animal Companion pair,
per rule 5's wording above; only the same-rank numeric combo excludes
them).

### Win/loss conditions

- **Win:** the 4th King (the Castle deck's last card) is defeated (Step
  3's damage check reaches its health). The match ends immediately in a
  win for every seated player — no further moves are legal.
- **Loss (either trigger ends the match immediately for every seated
  player):**
  1. The active player reaches Step 4 and cannot discard cards from their
     hand summing to at least the enemy's effective attack, even
     discarding their whole hand.
  2. The active player reaches Step 1 with an empty hand and is not
     allowed to yield (every other seated player's last turn was itself a
     yield).

## Resolved design decisions

- **`minPlayers = 2`, `maxPlayers = 4`.** The rulebook's 1-player variant
  is not a parametric shrink of the 2-4 player game — it swaps the
  Jester's entire power (immunity-cancel becomes "discard hand and refill
  to 8," used at most twice total) and adds a bronze/silver/gold scoring
  tier with no equivalent in `GameoverResult`. That is a structural
  change under tech-stack.md's own heuristic, not a `settingsSchema`
  variant of this module. Per tech-stack.md's existing solo-play design
  ("solo play is modeled as an ordinary multiplayer match in which one
  user claims some or all seats"), a single user can already play a full
  2-seat `regicide-v1` match solo by claiming both seats — this covers
  the "one person, no friends available" use case without needing a
  third structurally distinct ruleset. A true boxed-rules 1-player
  variant (`regicide-solo-v1`) is left as a future independent catalog
  entry if ever requested — see Non-goals.
- **Starting player is uniform-random** (via boardgame.io's `random`
  plugin, never `Math.random()`), matching Love Letter's own precedent
  for the same "rulebook tiebreaker has no digital equivalent" situation.
- **No `settingsSchema`.** Every number in this feature (Jester count, max
  hand size, enemy stats) is derived purely from seated player count or
  is a fixed rulebook constant — there is no host-configurable option,
  the same conclusion The Mind (feature 016) reached for lives/stars.
- **`roundConfirm` (feature 021) is used, but repurposed.** It normally
  pauses between a round ending and the next one's cards being dealt.
  Regicide never deals anything at a round boundary — the winning
  player's bonus turn is the rulebook's own immediate hand-off — but per
  explicit user request the pause itself is still wanted, purely so
  every seated player gets to see the fully-resolved final state (the
  defeated enemy, the damage/shield numbers that finished it) before it's
  replaced by the next enemy. See "Round-defeat confirmation" above for
  the mechanics. `hostPlayerID` bookkeeping for rematch purposes (also
  part of feature 021's shared contract) is baked into `G` the same way
  every other post-021 game already does it.
- **The "Communication" section of the rulebook** (restricting players
  from verbally revealing hand contents, relaxed briefly after a Jester)
  is a social/physical-game rule with no software enforcement mechanism —
  a free-text chat message's content cannot be validated against hidden
  game state without defeating the purpose of hidden information in the
  first place. Not modeled; see Non-goals.
- **Move shape (informative, not binding on the implementation plan):** a
  `playCards(cardIds: string[])` move validated against the "Legal plays"
  list above, and a `yield()` move, cover Step 1 entirely; Step 4's
  discard is a second move (e.g. `discardCards(cardIds: string[])`)
  restricted to exactly the turn's active player once Step 4 is reached;
  the Jester's "choose next player" is either a parameter of `playCards`
  when the played selection is a Jester, or a following move — left to
  plan.md.

## User stories

### 1. Fighting through a single enemy to defeat it

As a seated player, I can play cards on my turn to deal damage to the
current enemy; when the team's cumulative damage reaches its health, it
is defeated and the next Castle card is revealed with no new cards dealt
to anyone; once every seated player (including me) has confirmed they've
seen the result, I (having landed the killing blow) begin a new turn
against the newly revealed enemy.

### 1a. Pausing on a defeated enemy until everyone confirms

As any seated player, when an enemy is defeated (short of the match-
ending 12th), the board holds on that enemy's final state — including
the damage/shield numbers that finished it — until I confirm I'm ready to
move on; the next enemy is revealed and play resumes only once every
seated player has confirmed, or the host force-advances on everyone's
behalf.

### 2. Suffering and defending against enemy damage

As the active player, when the enemy is not defeated on my turn, I must
discard cards from my hand covering its attack value (reduced by
whatever spade shield the team has built against this enemy); if I
cannot, the whole team loses immediately.

### 3. Using suit powers, including in combination

As a seated player, playing a single card of a given suit (or several
same-rank cards spanning multiple suits, or an Animal Companion paired
with another card) triggers every present suit's power at the total
attack value once each — healing before drawing when both trigger
together — not once per individual card.

### 4. Playing against an immune enemy, and lifting immunity with a Jester

As a seated player, playing a card whose suit matches the current enemy's
own suit deals damage but grants no power from that suit; playing a
Jester (which itself deals no damage and grants no draw/heal/double)
lifts that immunity for every card played against this enemy afterward,
including retroactively unlocking previously-played spade value into the
shield total.

### 5. Yielding, and being blocked from yielding too often

As a seated player, I can yield my turn to skip straight to defending
against the enemy's attack, unless every other seated player's most
recent turn was also a yield — in which case I must play something or, if
my hand is empty, the team loses.

### 6. Winning by defeating the final King

As a seated player, once the 4th King's health reaches 0, the match ends
in a shared win for every seated player — no further Castle cards remain
to reveal.

### 7. A defeated face card re-entering play

As a seated player, when an enemy is defeated by damage exactly equal to
its health, it goes on top of the Tavern deck instead of the discard pile
— it can later be drawn into a hand, played as an attack card worth its
rank's value with its own suit's power, or discarded in Step 4 for that
same value.

## Acceptance criteria

`[unit]` denotes a headless-`Client` test against this feature's `Game`
definition. `[conformance]` denotes the shared conformance suite from
feature 001.

1. `[unit]` `setup` at 2, 3, and 4 seated players produces the correct
   Tavern deck composition (36 number cards + 4 Animal Companions + 0/1/2
   Jesters), the correct Castle deck ordering (Jacks on top of Queens on
   top of Kings, each rank internally shuffled), a face-up first enemy
   (a Jack), and every seated player dealt up to the correct max hand
   size for that player count.
2. `[unit]` A single-card play resolves exactly one suit's power once, at
   that card's own printed value; a same-rank combo (sizes 2-4, sums ≤
   10) resolves every present suit's power once each, at the combo's
   total; combos summing to more than 10, of non-matching ranks, of size
   > 4, or including a face card or Animal Companion are all rejected
   (`INVALID_MOVE`).
3. `[unit]` An Animal Companion played alone resolves its own suit's
   power at value 1; paired with a number card, face card, or another
   Animal Companion, resolves at the combined total, with same-suit
   pairs applying that suit's power exactly once (not twice); paired
   with a Jester, or added to a 2+ card numeric combo, is rejected.
4. `[unit]` Hearts and Diamonds, when both present in one selection,
   resolve Hearts (reshuffle discard, seed cards under the Tavern deck
   bottom) strictly before Diamonds (draw from the top) — constructed so
   that the Diamonds draw would run out of cards if resolved first but
   succeeds in full when Hearts resolves first, proving the ordering is
   load-bearing, not incidental.
5. `[unit]` Clubs doubles the Step 3 damage contribution of its own
   selection; Spades adds the selection's total to a per-enemy cumulative
   counter that persists across turns and resets to 0 only when a new
   enemy is revealed.
6. `[unit]` Enemy suit immunity suppresses only the matching suit's
   power (damage from that card still counts); a Jester played against
   the current enemy lifts immunity for every subsequent card played
   against that same enemy, including causing previously-played (already
   immune-blocked) spade value to start counting toward the shield
   total on the very next Step 4 — without retroactively doubling
   already-resolved Clubs damage or re-triggering already-resolved
   Hearts/Diamonds effects from earlier in the round.
7. `[unit]` The Jester: always rejected unless played alone
   (`INVALID_MOVE` if combined with anything); deals 0 damage; skips
   Step 3 and Step 4 entirely (the enemy does not attack that turn); and
   requires the playing player to name which seated player takes the
   next turn, overriding clockwise order for that one transition.
8. `[unit]` Diamonds draw order: starting with the active player and
   proceeding clockwise, one card at a time, skipping any player already
   at max hand size, stopping (with no error) if the Tavern deck empties
   before the full attack value has been drawn.
9. `[unit]` The instant a non-final enemy is defeated, every card played
   against it this round moves to the discard pile, but the enemy's own
   card stays as `currentEnemy` unchanged (still reporting the damage
   total that defeated it), and no next Castle card is revealed yet — see
   AC9a for what unblocks this. No cards are dealt to anyone and no
   Tavern deck reshuffle happens at any point in this whole transition.
9a. `[unit]` Defeating a non-final enemy opens a `roundConfirm` wait
    scoped to every currently seated player; no move besides
    `confirmRoundReadyMove`/`forceAdvanceRoundMove` is legal while it's
    pending (`INVALID_MOVE` for e.g. an attempted `playCards`/`yield` by
    any seat, including the defeating player). Only once every pending
    seat has confirmed (or the match's host seat calls
    `forceAdvanceRoundMove`) does the rest of the transition happen, all
    at once: the defeated enemy's card is placed face down on top of the
    Tavern deck (exact-health defeat) or into the discard pile (overkill),
    the next Castle card is revealed as the new `currentEnemy`, the
    spade-shield and cumulative-damage counters both reset to 0, and the
    defeating player's fresh Step 1 turn against the new enemy (skipping
    Step 4) begins. Defeating the 4th King does not open this wait at all
    (see AC14) — its own placement doesn't gate anything since the match
    is already over.
10. `[unit]` A face card drawn into a hand (post-defeat re-entry) plays
    as a single-card Step 1 selection at attack value 10/15/20 by rank
    with its own suit's power (subject to the *current* enemy's
    immunity), and discards in Step 4 for the same value; it cannot be
    used in a same-rank numeric combo.
11. `[unit]` Step 4's required discard total is the enemy's printed
    attack minus its current effective spade shield (floored at 0);
    discarded values use Animal Companion = 1, Jester = 0, face card =
    10/15/20, number card = printed rank; discarding the entire hand
    without reaching the total ends the match in a loss
    (`ctx.gameover`, no winner) immediately, with no further moves legal.
12. `[unit]` Reaching Step 1 with an empty hand while yielding is
    disallowed (every other seated player's last turn was a yield) ends
    the match in the same immediate loss; reaching Step 1 with an empty
    hand while yielding is still allowed is not a loss (the player
    yields normally).
13. `[unit]` Yield eligibility is tracked per seated player's own most
    recent turn (play vs. yield), correctly reset by that player's next
    play, and correctly evaluated against every *other* currently seated
    player's last turn (not the acting player's own).
14. `[unit]` Defeating the 4th King ends the match in a win
    (`ctx.gameover` with every seated player as `winner`, conforming to
    `GameoverResult`) the instant its health reaches 0, even mid-combo
    (overkill in the same Step 3 that crosses the threshold) — no
    `roundConfirm` wait opens for this defeat, and no further moves are
    legal afterward.
15. `[conformance]` `testGameModuleConformance(regicideModule)` passes at
    both `minPlayers` (2) and `maxPlayers` (4), including determinism
    under a fixed seed (proving Castle/Tavern shuffles, the Hearts
    reshuffle-and-reseed, and starting-player selection all go through
    boardgame.io's `random` plugin) and that `playerView` never leaks a
    seated player's hand to another seated player or to a spectator
    (`playerID: undefined`).
16. `[unit]` `playerView` exposes every seated player's hand *count* and
    the current enemy's full public state (rank, printed attack/health,
    cumulative damage dealt, cumulative spade shield, immunity status)
    to every viewer, including spectators, while exposing hand *values*
    only to the owning seat.
17. `[unit]` A `G.log` entry (feature 012's `GameLogEntry` contract) is
    appended for every publicly observable event: cards played (naming
    the player, the cards, and the resolved suit powers), a yield, an
    enemy defeated, the match's win, and the match's loss — with no
    entry ever containing the contents of a hand beyond what was just
    played or discarded face up.

## Non-goals

- Any client/UI concern — hand display, selection/combo-building
  affordances, damage/shield indicators. All of that is feature 023,
  which depends on this feature's `G`/`BoardProps` shape.
- The rulebook's 1-player variant (alternate Jester power, bronze/silver/
  gold scoring tiers). See "Resolved design decisions" — deferred as a
  potential future independent catalog entry, not built here. `Gameover
  Result` gains no scoring-tier field for this.
- Enforcing the rulebook's "Communication" restrictions on chat content.
  Not software-enforceable without defeating the purpose of hidden
  information; not attempted.
- A shared board-UI kit — per roadmap.md's existing precedent (deferred
  until a second and third real `BoardComponent` exist to extract from;
  Love Letter and The Mind are already that second/third case, so this
  feature does not re-open that question).
- Any card art beyond what feature 023 decides for its own placeholder
  rendering — this feature has no opinion on presentation.
- A `settingsSchema` — see "Resolved design decisions."
