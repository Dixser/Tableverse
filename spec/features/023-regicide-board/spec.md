# Feature 023 — Regicide: Board UI, Card Selection & Combat Indicators

## Description

The `packages/client` half of Regicide — `RegicideBoard`, the
`BoardComponent` for `regicide-v1` (feature 022). Depends on feature 022's
`G`/`playerView` shape existing first, since this feature's props are that
shape, not a speculative one. Per explicit user requirements for this
game:

- Playing a selection of cards is a two-step interaction, not
  click-to-play: the active player taps cards in their hand to build a
  selection (toggle on/off), then presses an explicit **Play** button to
  submit it. A card that would make the current selection illegal (per
  feature 022's "Legal plays" rules) is rendered disabled the moment it
  would break legality, not only after the invalid move is rejected
  server-side.
- **Yield** is its own explicit button, distinct from Play, disabled
  exactly when feature 022's consecutive-yield restriction currently
  forbids it (with a reason shown, not just a greyed-out control with no
  explanation).
- Every seated player and spectator can see, at a glance: every other
  player's hand *count* (not values), the current enemy's total and
  remaining health, the damage the active player is about to take this
  turn (the enemy's printed attack minus the currently accumulated spade
  shield, i.e. what Step 4 would actually cost right now), and the
  accumulated spade-shield total itself as its own indicator, separate
  from the derived "damage you'll take" number.

Cards render as **placeholders**: rank/label and suit, no artwork — same
convention Love Letter (feature 015) already established for this
codebase's card rendering, chosen here for consistency rather than
independently re-litigated (see Non-goals).

## User stories

### 1. Building a multi-card selection before committing it

As the active player, I tap a card to select it (visually marked
selected); tapping a second same-rank card extends the selection into a
combo if the resulting sum would still be ≤ 10, or an Animal Companion
pair if I've selected exactly one Animal Companion plus one other card;
every card in my hand that would make the current selection illegal is
shown disabled the moment my selection would break legality (e.g. after
selecting a 4, every non-4 number card and every face card disables
immediately, since combining ranks is never legal). Pressing **Play**
submits exactly my current selection; I can also deselect a card before
playing to change my mind.

### 2. Yielding when it's not worth playing

As the active player, I can press **Yield** to skip straight to defending
against the enemy's attack, unless doing so is currently forbidden
(feature 022's rule); in that case the Yield button is disabled with a
visible explanation ("every other player yielded last turn") instead of
silently doing nothing or erroring only after I click it.

### 3. Seeing the current threat clearly

As any seated player or spectator, I see the current enemy's rank, its
printed attack and health, the cumulative damage dealt to it so far this
round, the accumulated spade-shield total built against it, and the
resulting "damage the active player will take if this turn ends without
defeating it" number (attack minus shield, floored at 0) — kept visibly
distinct from the raw shield total, so I can tell how much of the
reduction is "banked" versus how much danger remains.

### 4. Seeing everyone's hand size, not contents

As any seated player or spectator, I see every seated player's current
hand count rendered next to their seat, without ever seeing another
seated player's actual card values — including my own view while it is
not my turn.

### 5. Choosing who goes next after a Jester

As the player who just played a Jester, I am prompted to choose which
other seated player takes the next turn (a list of currently seated
players); every other player sees a brief indication that the Jester's
player is choosing, without being able to act themselves until that
choice is made.

### 6. Pausing on a defeated enemy until everyone confirms

As any seated player, when an enemy is defeated, the board holds on that
enemy's final resolved state — its card, the damage dealt, and the spade
shield that helped bring it down — instead of immediately swapping in the
next Castle card. I see a confirmation prompt (mirroring feature 021's
existing round/rematch confirm pattern) and must press **Confirm** before
the game moves on; a "N of M confirmed" count shows how many other seated
players are still looking. The Castle deck's next card, and the reset
shield/damage counters, only appear — and the defeating player's hand
only becomes active for a new turn — once every seated player has
confirmed, or the host force-advances (per feature 022's "Round-defeat
confirmation," reusing feature 021's `roundConfirm` mechanism). This does
not happen on the match-winning 12th defeat, which goes straight to the
existing `GameoverBanner` (feature 009) instead.

### 7. A spectator sees the same public information a seated player sees

As a spectator (no seat claimed), I see the enemy's state, every seated
player's hand count, the Tavern/Castle deck's remaining counts, and the
discard pile size identically to a seated player — but no seated player's
actual hand contents, matching feature 022's `playerView` guarantee for
`playerID: undefined`. (A fuller spectator experience — seeing every
seated player's actual hand, not just counts — was considered but
deferred; see Non-goals. It would require a `playerView` change in
feature 022, and spectator mode isn't a current priority for this game.)

## Acceptance criteria

`[component]` denotes a client-side test of `RegicideBoard` (and its
sub-components) mounted with a fixture `G`/`playerView` shape, no real
server. `[manual]` denotes verification via the real dev server.

1. `[component]` Tapping an unselected, currently-legal card toggles it
   into the selection (visually marked); tapping a selected card
   deselects it; the **Play** button is disabled whenever the current
   selection is empty or does not match one of feature 022's legal-play
   shapes, and enabled exactly when it does.
2. `[component]` After one number card is selected, every other card in
   hand of a different rank (and every face card, and every Jester)
   renders disabled; a second card of the *same* rank re-enables Play
   only if the running sum stays ≤ 10, and itself disables further same-
   rank cards once a 3rd/4th would push the sum over 10 or exceed a
   4-card combo.
3. `[component]` After selecting one Animal Companion, every card except
   exactly one more (of any rank/suit/face-card, but not a Jester and not
   a second Animal-Companion-triggered numeric combo) renders disabled;
   selecting that second card enables Play at the combined total; a
   Jester is always rendered as only selectable alone (selecting it
   deselects and disables everything else).
4. `[component]` Pressing Play calls the move with exactly the currently
   selected card identifiers, and clears the selection once the move is
   accepted (fixture simulates an accepted move).
5. `[component]` The **Yield** button is enabled/disabled strictly
   according to the fixture `G`'s per-seat last-turn-was-yield state
   (feature 022 AC13), with a visible, translated reason string shown
   only while disabled.
6. `[component]` The enemy panel renders rank, printed attack, printed
   health, cumulative damage dealt (and thus remaining health), the
   accumulated spade-shield total, and a separately-labeled "damage you
   will take" value equal to `max(0, attack - shield)`, recomputed
   correctly across fixture snapshots as shield/damage values change.
7. `[component]` Every seated player's hand-count badge renders from
   `playerView`'s public hand-count field (never derived by counting a
   `hands` array a viewer shouldn't have access to, which would silently
   break for a spectator/other-seat fixture); a fixture representing
   another seat's hand values present in `G` (simulating a bug in
   `playerView`) does not leak into this component's rendered output —
   confirms this component itself never reads another seat's hand values
   even if a broken fixture briefly exposed them.
8. `[component]` A fixture where `G` indicates a pending Jester
   next-player choice by the acting seat renders the seat-picker (listing
   only currently seated players) for that seat's own view, and a
   waiting indicator (no picker) for every other seat's view.
9. `[component]` `RegicideBoard` renders the Tavern deck's remaining count
   and the discard pile's count (not contents) and the Castle deck's
   remaining-enemy count (e.g. "enemy 3 of 12"), sourced from
   `playerView`'s public fields, identically for every seated player and
   for a spectator fixture.
9a. `[component]` A fixture with a non-null `G.roundConfirm` renders the
    defeated enemy's final state (not yet replaced by the next enemy) plus
    a "N of M confirmed" count and a **Confirm** button that calls
    `confirmRoundReadyMove`; the acting seat's own confirmation disables
    its Confirm button (already confirmed) while other pending seats'
    remain enabled; the match's host seat additionally sees a force-
    advance control that calls `forceAdvanceRoundMove`, which no
    non-host seat renders; the Play/Yield controls render disabled for
    every seat while `G.roundConfirm` is non-null, re-enabling once a
    fixture snapshot shows it null again with the new enemy in place.
10. `[component]` A spectator-shaped fixture (`playerID: undefined`)
    renders the enemy panel, hand-count badges, and deck/discard counts
    identically to a seated fixture with the same public `G`, and renders
    no hand for any seat — confirms story 7.
11. `[component]` `RegicideBoard` renders no player list, seat controls,
    presence badges, or chat — confirms the chrome/board split holds for
    this game too (mirrors Tic-Tac-Toe's AC8 in feature 002 and Love
    Letter's AC10 in feature 015).
12. `[manual]` A full match played across two real browser sessions
    (solo-claiming both seats is acceptable) from start to either a match
    win or an engineered loss: building and playing a numeric combo, an
    Animal Companion pairing, and a Jester (including choosing the next
    player), yielding when forbidden and confirming the disabled reason,
    watching the enemy panel's health/shield/damage-you'll-take numbers
    update live, defeating at least one non-final enemy and observing the
    round-defeat confirmation pause (both sessions must press Confirm
    before the next enemy appears and either session's hand becomes
    active again), and confirming feature 012's chat shows the
    corresponding public status messages (from feature 022's `G.log`)
    alongside free-text chat in the same feed.

## Non-goals

- Card artwork, or any placeholder asset path reserved for adding it
  later — text/label rendering (rank + suit) is the intended final state,
  matching Love Letter's existing precedent in this codebase rather than
  independently deciding art scope for this feature.
- A shared board-UI kit (hand tray, opponent card-count badge, disabled-
  card-with-reason patterns) extracted for reuse — per roadmap.md's
  existing precedent, this is a candidate *source* for a future
  extraction (now that three real `BoardComponent`s exist: Love Letter,
  The Mind, Regicide), not the extraction itself.
- Rendering `G.log` on the board itself — that remains feature 012's
  `ChatPanel` (platform chrome), fed from the same field.
- Animations/transitions for card plays, enemy defeats, or the
  Jester's next-player handoff — plain, immediate re-renders only.
- Any UI enforcement or reminder of the rulebook's "Communication"
  restrictions — per feature 022's Non-goals, not modeled anywhere in
  this platform.
- The rulebook's 1-player variant UI (bronze/silver/gold victory
  banner). Deferred alongside feature 022's same non-goal.
- A full-visibility spectator mode (seeing every seated player's actual
  hand contents, not just counts). Would require feature 022's
  `playerView` to special-case `playerID: undefined` for this game only,
  diverging from every other catalog entry's spectator-sees-only-public-
  info convention (feature 002/014's own precedent) — deferred since
  spectator mode isn't a current priority for this game; this feature
  keeps the standard convention from feature 015/story 7 instead.
- Any accessibility work beyond this codebase's existing baseline (e.g.
  Tic-Tac-Toe's `role="grid"` usage) — no new a11y pattern introduced
  specifically for this feature.
