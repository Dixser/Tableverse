# Feature 024 — The Crew: Rules Engine

Rules source: the official rulebook for *The Crew: The Quest for Planet
Nine* (Thomas Sing, 2019 Kosmos/Thames & Kosmos),
https://boardgame.bg/the%20crew%20rulebook.pdf. Card effects and mission
mechanics below are restated in this document's own words, not quoted from
the rulebook — game rules/mechanics are facts, not protected expression,
but the rulebook's specific phrasing is not reproduced here.

The rulebook's own 50-mission "logbook" (the specific per-mission task
counts, order tokens, and special symbols) is a separate physical insert
not included in the PDF above. This feature ships a data-driven mission
engine plus a small hand-authored placeholder set (levels 1-5); the real
50 missions are explicit future content work once that data is available.

## Versioning classification (per tech-stack.md's heuristic)

**New catalog entry, `crew-v1`.** Trick-taking with follow-suit/trump
legality, a mission-draft phase, and a shared cooperative win/loss
condition share no turn structure, phase shape, or win condition with any
existing module. `minPlayers: 3, maxPlayers: 5` — the rulebook's actual
base game. The 2-player variant (a virtual third "JARVIS" seat, a
different deal, no free discussion during JARVIS's turn) is a structurally
different ruleset under this same heuristic, not a `settingsSchema`
variant — left as a future independent catalog entry (`crew-2p-v1`),
sharing only low-level utility modules (`deck.ts`, `trickResolution.ts`,
`constraints.ts`) via plain internal modules, never the `Game` definition
itself.

## Description

### Cards and dealing

- **40 "large" playing cards**: 4 color suits (pink/blue/green/yellow)
  ranked 1-9, plus 4 rocket cards ranked 1-4.
- **36 "small" task cards**: mirror the 4 color suits 1-9 — no rocket
  tasks.
- **Dealing**: shuffle the 40 playing cards, deal round-robin to every
  active seat until the deck is exhausted. At 4 or 5 players this divides
  evenly (10 or 8 each); at 3 players it does not (40 = 13×3 + 1) — the
  seat(s) that land the extra card simply carry one permanently unplayed
  card in hand for the whole mission (see "Resolved design decisions").
  `totalTricks` (the mission's fixed trick count) is the MINIMUM hand size
  across active seats, `floor(40 / activeSeatCount)`.
- **Commander**: whoever holds the rocket-4 after dealing. Leads the
  mission draft and the first trick.

### Trick-taking

- **Follow suit**: a player must play a card matching the led suit (color
  or rocket) if they hold one; only when they hold none may they play any
  other card, including a rocket to "cut."
- **Rockets are trump**: if any rocket is played in a trick, the highest
  rocket wins outright regardless of the led suit (this also covers a
  rocket-led trick — the leading rocket is itself among "any rocket
  played"). Otherwise the highest card matching the led suit wins; an
  off-suit card can never win, regardless of rank.
- **Trick order**: the commander leads the first trick; the winner of each
  trick leads the next.

### Mission draft

- A number of task cards (`level.taskCount`) are drawn face-up and laid
  out in a fixed left-to-right order — this fixed layout position (not
  draft/pick order) is what any of that mission's task-order tokens
  attach to.
- The commander picks one task card, then each other seat picks one,
  clockwise, repeating until every drawn task card is claimed. A seat may
  end up with zero, one, or several tasks.

### Task fulfillment and the two loss triggers

- A task is fulfilled when its OWNER's seat wins a trick that contains the
  task's target playing card anywhere among that trick's plays — not
  necessarily as the trick's own winning card, since the trick's winner
  takes every card played in it. (Example: seat A leads the target card
  low, seat B plays the highest card of that suit and wins the trick — if
  seat B owns the task, it's fulfilled even though seat B didn't play the
  target card itself.)
- **Loss trigger 1 — wrong-owner capture**: if a task's target card ends
  up in a trick won by anyone other than that task's owner, the mission
  fails immediately.
- **Loss trigger 2 — task order violated**: some missions attach an order
  token to specific tasks (see below); fulfilling a tokened task out of
  its required order fails the mission immediately, even if no wrong-owner
  capture occurred.
- **Win**: for a mission with at least one task, all tasks fulfilled
  correctly (order included) — checked the instant the last one resolves,
  not only at the end of the deal. For a mission with zero tasks (a
  constraint-only mission, see below), reaching the last trick without any
  registered constraint firing.
- **The "ran out of tricks" case**: since every one of the 40 dealt cards
  gets played over the course of the mission's fixed trick count (except a
  3-player deal's permanently-unplayed extra card), a task-based mission
  reaching its last trick with an unfulfilled task can only mean that
  task's target card was exactly that unplayed extra card — an accepted,
  rulebook-faithful "bad deal" outcome, resolved as a loss.

### Task order tokens

A mission's task-order constraints reference specific tasks by their
fixed draft-layout position (`taskIndex`), not by owner or by pick order:

- **Position** (1st/2nd/3rd/4th/5th): an absolute rank among every
  position-tokened task in this mission.
- **Before / after**: a requirement relative to one other specific tokened
  task.
- Two or more tokened tasks fulfilled in the very same trick are treated
  as satisfying each other's order requirement regardless of which
  "actually" happened first within that trick.

### Level definition (the data-driven mission engine)

```
LevelConstraint =
  | { kind: 'taskOrder'; taskIndex; order: position | before | after }
  | { kind: 'cardNeverWinsTrick'; suit; rank }
  | { kind: 'rankNeverWinsTrick'; rank }
  | { kind: 'seatNeverWinsTrick'; seatIndex }

LevelDefinition = { level: 1-50; taskCount: number; constraints: LevelConstraint[] }
```

`cardNeverWinsTrick` / `rankNeverWinsTrick` / `seatNeverWinsTrick` cover
mission types the rulebook itself illustrates or that were specifically
requested (e.g. "won without a 9 ever winning a trick"; "this crew member
must not win any trick") without needing task cards at all. The union is
deliberately small and extensible: a real mission's unusual rule, once the
full logbook is available, is a new variant plus one small pure checker
function — never a reshape of this type or of the game's phases/moves.

### Radio communication

- Each seat has exactly one radio communication token, usable once per
  match (see "Resolved design decisions" on why "per match" is the right
  scope here).
- Usable only during the `trickConfirm` window (see feature 025's
  `spec.md` for the client-visible shape of this) — before trick 1, or
  between any two tricks, never mid-trick.
- Communicating flags one non-rocket card from hand as truthfully the
  highest, only, or lowest card of its suit currently in that hand — the
  server validates the claim against the real hand rather than trusting
  the client. The marker stays visible (and the card remains an ordinary,
  playable card) until that exact card is played, at which point the
  marker clears; the token itself stays spent for the rest of the match
  either way.

## Resolved design decisions

- **One boardgame.io match = one mission attempt.** The physical game's
  own "if you lose, reshuffle and redeal, tracking an attempt count" is
  modeled as: a loss ends the match (`ctx.gameover`, no winner); the
  room's *existing*, unmodified Rematch action redeals a fresh attempt at
  the same level (same seats, same `gameSettings`) with zero new code.
  "Win → next level, same players" is a small, generic extension of that
  same primitive (feature 026), not a Crew-specific code path. This also
  means the radio token's "once per mission attempt" is simply "once per
  match" — there is no in-match re-attempt loop to reset it across.
- **The 3-player extra/unplayed card is dealt into a hand, not set
  aside.** `totalTricks` is derived as the MINIMUM hand size across active
  seats; the seat(s) holding one extra card simply never get to play it,
  since the mission's fixed trick count runs out first. No legality
  exception is needed to keep it un-playable.
- **`taskIndex` refers to fixed draft-layout position, not pick order.**
  Matches the rulebook's own token-to-card mapping (tokens are placed
  before the cards are drawn, matched left-to-right); a task's owner and
  the moment it's picked never affect which token, if any, applies to it.
- **No `settingsSchema` numeric bounds enforcement** for `level` — modeled
  as an `enum` of 1-50 instead (see feature 026's `spec.md` for why, and
  the platform bugfix that made this reliable).
- **Distress signal, dead zone, disruption, and commander's
  decision/distribution** (all real rulebook mechanics) are explicitly
  deferred — see Non-goals. The engine's phase/move shape does not need to
  change to add them later; they slot in as: a pre-trick-1 negotiation
  step (distress signal), additional `LevelConstraint` variants gating
  *when* `communicateCard` is legal (dead zone/disruption), and alternate
  task-draft move sequences (commander's decision/distribution).
- **The 5-player mission-25+ task-handover rule** is likewise deferred —
  it is a capability available generically at (5 active seats AND
  level ≥ 25), not per-level data, so it can be added later as one new
  move gated on that condition, without touching `LevelDefinition`.

## User stories

### 1. Drafting tasks, commander first

As a seated player, once the deck is dealt, the commander (holder of the
rocket-4) chooses first from the face-up task cards, then each of us
chooses in clockwise order, repeating until every task card is claimed.

### 2. Playing a trick and having it resolve correctly

As a seated player, I play a card following suit if I have one; once
everyone has played, the trick is won by the highest rocket in play, or
(if none) the highest card of the led suit — and whoever wins takes every
card played in that trick, fulfilling any of my tasks whose target card
was among them.

### 3. Losing immediately on a wrong-owner capture

As any seated player, if a task's target card ends up in a trick won by
someone other than that task's owner, the mission fails immediately, no
matter how the rest of the deal would have played out.

### 4. Losing immediately on an order violation

As any seated player, if my mission has task order tokens and one of my
tokened tasks is fulfilled out of its required order, the mission fails
immediately, even though no wrong-owner capture happened.

### 5. Winning as soon as every task is fulfilled

As a seated player, the instant the last outstanding task resolves
correctly, the mission is won — we don't need to play out the rest of the
tricks.

### 6. A constraint-only mission with no tasks at all

As a seated player, on a mission with zero task cards, we win by reaching
the last trick without triggering whatever the mission's own forbidden
outcome is (e.g. a specific rank never winning a trick).

### 7. Communicating one card between tricks

As a seated player, once per match, I can flag one non-rocket card in my
hand as the highest, only, or lowest of its suit — but only during the
window between tricks (or before the first one), and only if the claim is
actually true of my current hand.

## Acceptance criteria

`[unit]` denotes a headless-`Client` test against this feature's `Game`
definition. `[conformance]` denotes the shared conformance suite.

1. `[unit]` `setup` at 3, 4, and 5 active seats deals the correct
   `totalTricks` (13/10/8) and, at 3 seats specifically, leaves exactly
   one seat with one extra, otherwise-ordinary card.
2. `[unit]` Whoever holds the rocket-4 after dealing is recorded as
   commander and leads both the mission draft and the first trick.
3. `[unit]` The mission draft phase deals exactly `level.taskCount` task
   cards face-up; the commander picks first, then clockwise, repeating
   until the pool is empty; a 0-task level transitions straight through
   with no draft moves at all.
4. `[unit]` `isLegalTrickPlay` (and the `playCard` move enforcing it)
   requires following the led suit (color or rocket) whenever the hand
   holds one; any card, including a rocket, is legal once it doesn't.
5. `[unit]` `resolveTrick`: the highest rocket wins outright over any
   color card regardless of led suit, including when multiple rockets are
   in the same trick; otherwise only the led suit's highest card can win.
6. `[unit]` A task is fulfilled when its owner wins the trick containing
   its target card, even when that target card is not itself the trick's
   winning card; ending the trick still marks fulfillment correctly when
   several of the owner's tasks resolve in the same trick.
7. `[unit]` A task's target card ending up in a trick won by a different
   seat than its owner ends the match immediately in a loss
   (`ctx.gameover`, no winner), with no further moves legal.
8. `[unit]` `checkTaskOrderViolations`: a `position` token fulfilled before
   all lower-numbered position tokens have resolved is a violation; two or
   more tokened tasks resolving in the very same trick satisfy each
   other's order requirement regardless of resolution order within that
   trick; `before`/`after` are satisfied by an earlier-or-same-trick /
   later-or-same-trick resolution respectively, violated otherwise.
9. `[unit]` `checkTrickOutcomeViolations`: `cardNeverWinsTrick`,
   `rankNeverWinsTrick`, and `seatNeverWinsTrick` each fire exactly when
   their specific forbidden outcome is the resolved trick's own winner,
   and never otherwise.
10. `[unit]` The mission ends in a win the instant every drafted task is
    fulfilled with no violation ever having fired, even mid-mission with
    tricks remaining; a 0-task mission ends in a win only upon reaching
    its last trick unscathed, and in a loss the instant any constraint
    fires.
11. `[unit]` `communicateCard` is rejected unless the named card is
    genuinely the highest, only, or lowest of its suit in the caller's own
    hand (server-validated, not client-trusted); is always rejected for a
    rocket; is rejected on a second attempt by the same seat in the same
    match; and clears its own marker (but not the spent token) once that
    exact card is later played.
12. `[unit]` The `trickConfirm` phase (reusing feature 021's shared
    `roundConfirm` mechanism) is entered both before trick 1 (nothing to
    show yet) and after every non-terminal trick (showing the just-
    resolved trick); no move besides `confirmRoundReady`/
    `forceAdvanceRound`/`communicateCard` is legal while it's pending. A
    match-ending win or loss skips this wait entirely — mirrors Regicide's
    own "no roundConfirm on the match-ending defeat" precedent.
13. `[conformance]` `testGameModuleConformance(crewModule)` passes at both
    `minPlayers` (3) and `maxPlayers` (5), including determinism under a
    fixed seed and that `playerView` never leaks a seat's hand to another
    seat or to a spectator (`playerID: undefined`).

## Non-goals

- Distress signal, dead zone, disruption, commander's decision/commander's
  distribution — real rulebook mechanics, deferred per "Resolved design
  decisions" above.
- The 5-player mission-25+ task-handover rule — deferred, same reasoning.
- `crew-2p-v1` (the JARVIS virtual-seat variant) — a future, fully
  independent catalog entry per the versioning classification above.
- Authoring all 50 missions — only a handful of placeholder levels ship
  with this feature; the rest is explicit future content work once the
  logbook is available.
- Any in-match "attempt counter" mirroring the physical logbook's tally of
  how many tries a level took — each attempt is now a whole separate
  match; a counter, if ever wanted, would live at the Room level, not in
  `G`.
- Any client/UI concern — all of that is feature 025.
