# Feature 015 — Love Letter: Board UI, Round Tracking & Private Reveals

## Description

The `packages/client` half of Love Letter — `LoveLetterBoard`, the
`BoardComponent` for `loveletter-v1` (feature 014). Depends on feature
014's `G`/`playerView` shape existing first, since this feature's props
are that shape, not a speculative one. Per explicit user requirements for
this game:

- Cards render as **placeholders**: rank number, card name, and its
  effect text — no artwork, and none planned (see Non-goals).
- Every card-use's public fact (who played what, on whom) is visible to
  everyone via feature 012's chat, fed from feature 014's `G.log` — this
  feature does not duplicate that display on the board itself. What this
  feature *does* own is the **private half** a targeted card like the
  Baron or Priest produces (the actual compared/viewed card), which must
  never appear in chat (feature 012's spec.md) and is rendered here,
  to the acting player only, straight from `G`'s already-filtered
  `privateReveals`.
- Each player's cumulative favor-token count (rounds won so far) must be
  visible to every player at any time, not just at match end.

## User stories

### 1. Seeing your own hand and playing a card

As a seated player on my turn, I see both cards in my hand, each rendered
as its rank, name, and effect text; choosing one that needs a target
(everything except Spy and Countess) prompts me to pick a valid opponent
before the move is sent, so I can't accidentally submit an incomplete
move.

### 2. The Countess's forced-play rule is surfaced before I try an illegal move

As a player holding the Countess alongside the King or a Prince, the King/
Prince card in my hand is shown disabled with an explanation, rather than
letting me click it and only then learn the move was rejected.

### 3. Seeing a private reveal

As the player who just used the Baron or Priest, I see the actual result
(the compared rank, or the viewed card) in a clearly private-looking
element (e.g. a toast only I can see) distinct from the public chat
message everyone else also sees announcing that I used the card.

### 4. Tracking round wins at a glance

As any seated player or spectator, I can see every player's current
favor-token count at any point during the match — during a round in
progress, not only at round or match end — without needing to check chat
history for prior round-result messages.

### 5. Choosing a legal target only

As a player playing the Guard, Priest, Baron, or King, only currently
eligible opponents (not eliminated, not Handmaid-protected) are
selectable; if every other player is currently protected, the card plays
immediately with no effect and no target prompt, per feature 014's rules.

### 6. Playing the Prince on myself

As a player playing the Prince, I can choose myself as the target, in
addition to any eligible opponent — including the special case where
every opponent is protected and I am the only legal choice.

### 7. A spectator sees the same public information a seated player sees

As a spectator (no seat claimed), I see every player's play area, round
wins, and elimination/protection status identically to a seated player —
but no player's hand contents and no player's `privateReveals`, matching
feature 014's `playerView` guarantee for `playerID: null`.

## Acceptance criteria

`[component]` denotes a client-side test of `LoveLetterBoard` (and its
sub-components) mounted with a fixture `G`/`playerView` shape, no real
server. `[manual]` denotes verification via the real dev server.

1. `[component]` A card in hand renders its rank, translated name, and
   translated effect text (i18next keys, per feature 010's convention,
   under a `loveLetter.cards.<rank>.*` namespace) — no image element, no
   `<img>`/background-image reference anywhere in the rendered output.
2. `[component]` Clicking a card that needs a target (Guard, Priest,
   Baron, King, Prince) opens a target picker listing only currently
   eligible players (not eliminated, not Handmaid-protected, per the
   current `G` fixture) before calling any move.
3. `[component]` Clicking a card that needs no target (Spy, Countess)
   calls the `playCard` move immediately, no picker shown.
4. `[component]` Selecting the Guard additionally prompts for a rank
   guess, restricted to every rank except Guard itself, before the move
   is sent.
5. `[component]` With the Countess in hand alongside the King or the
   Prince, that other card renders disabled with an explanatory label
   (story 2); with the Countess alongside neither, both cards are
   enabled.
6. `[component]` When every other non-eliminated player is
   Handmaid-protected, clicking the Guard/Priest/Baron/King calls
   `playCard` immediately with no target picker (story 5's fallback);
   clicking the Prince still opens a picker, offering only the acting
   player themselves.
7. `[component]` A `privateReveals` entry present in the active player's
   `G` view renders as a distinctly-styled private element (story 3),
   and is never rendered from any other player's or the spectator's
   fixture — trivially true by construction, since `privateReveals` in
   those fixtures is empty per feature 014's `playerView`, but asserted
   directly rather than assumed.
8. `[component]` The round-wins display renders every seated player's
   current token count (story 4), sourced from `G.roundWins`, and updates
   between fixture snapshots representing a round-end transition.
9. `[component]` A spectator-shaped fixture (`playerID: null`) renders
   play areas, round wins, and elimination/protection status identically
   to a seated fixture with the same public `G` — and renders no hand for
   any player, confirming story 7.
10. `[component]` `LoveLetterBoard` renders no player list, seat controls,
    presence badges, or chat — confirms the chrome/board split holds for
    this game too (mirrors Tic-Tac-Toe's own AC8 in feature 002).
11. `[manual]` A full match played across two real browser sessions
    (solo-claiming both seats is acceptable) from start to a match win:
    hand display, targeting, the Countess forced-play block, a private
    Baron/Priest reveal, and the round-wins counter incrementing across
    at least two rounds are all observed directly, plus confirming
    feature 012's chat shows the corresponding public status messages
    (from feature 014's `G.log`) alongside free-text chat in the same
    feed.

## Non-goals

- Card artwork, or any hook/placeholder asset path reserved for adding it
  later — explicitly out of scope per the user's own request; the
  placeholder text rendering is the intended final state for this
  feature, not a stand-in for art to be added afterward.
- A shared board-UI kit (hand tray, opponent card-count badge components)
  extracted for reuse by future games — per roadmap.md, this feature is
  the *trigger point* for that extraction, not the extraction itself; a
  follow-up feature (unnumbered, not yet planned) would be the one to
  actually generalize `LoveLetterBoard`'s hand/target-picker pieces once
  a third game exists to validate the generalization against.
- Rendering `G.log` on the board itself — that's feature 012's `ChatPanel`
  (platform chrome), fed from the same field; this feature never reads
  `G.log` at all.
- Animations/transitions for card plays, eliminations, or round changes —
  plain, immediate re-renders only.
- Any accessibility work beyond what's already a baseline expectation
  elsewhere in this codebase (e.g. Tic-Tac-Toe's `role="grid"` usage) —
  no new a11y pattern introduced specifically for this feature.
