# Feature 016 — The Mind

## Versioning classification (per tech-stack.md's heuristic)

New catalog entry (`themind-v1`) — a structurally different turn/phase
structure (no turns at all; every seat is permanently active, simultaneous
play, no phases) and a different win condition (cooperative: the whole team
wins or loses together) from every existing catalog entry.

## Description

Rules: https://www.boardgamecapital.com/game_rules/the-mind.pdf

The Mind (Wolfgang Warsch) is a fully cooperative, turnless card game: 2-4
players share a pool of lives and throwing stars ("shurikens") and must
play a hand of numbered cards (1-100) into one shared, ascending pile
without any communication about card values. Levels 1..N (N depends on
player count) each deal the players one more card than the last; a level
is complete when every hand is empty. The team wins by completing the
final level for its player count and loses immediately if it runs out of
lives.

Per tech-stack.md's "Known engine limitations", this is the canonical
example of a simultaneous-action/turn-less game, built via
`ActivePlayers.ALL` (`{ all: Stage.NULL }`) — every seat stays permanently
active with nothing to yield; there is no `ctx.currentPlayer` turn order to
respect.

Rules and board ship together in one branch/feature (unlike Love Letter's
014/015 split) per explicit direction — this is a smaller rules surface
than Love Letter's, and the board has no complex per-card targeting UI to
warrant splitting the work.

## Rules summary (authoritative numbers, from the rulebook)

| Players | Levels | Starting lives | Starting stars |
|---|---|---|---|
| 2 | 1-12 | 2 | 1 |
| 3 | 1-10 | 3 | 1 |
| 4 | 1-8  | 4 | 1 |

- Deck: 100 cards, numbered 1-100, reshuffled fresh every level.
- A level deals `level` cards to every active seat. Players hold their
  hand privately; nobody may disclose card values.
- Any player, at any time, may play their own **lowest** held card into
  the shared pile (a player never chooses which card to play — the rules
  require the lowest card be played first, so the move takes no
  parameters).
- If any *other* active player is holding a card lower than the one just
  played, the team loses one life, and every such lower card is
  immediately revealed and set aside (removed from hands, shown next to
  the played-cards zone) — the level continues, it does not restart.
- A level completes when every active seat's hand is empty.
- Rewards: completing levels 2, 3, 5, 6, 8, 9 grants one star (2, 5, 8) or
  one life (3, 6, 9), capped at 3 stars / 5 lives total (the physical
  component counts) — a reward that would exceed the cap is simply not
  granted.
- Shuriken (star) vote: any player proposes (implicitly voting yes); every
  other active seat must also vote yes for it to resolve. Any "no" cancels
  the proposal. On unanimous yes, one star is spent and every active
  seat's lowest card (if any) is discarded face-up to a shared reveal
  zone. This can complete the level if it empties every hand.
- Match ends immediately in a loss when lives reach 0. Match ends in a win
  when the final level for the player count is completed.
- Blind mode (bonus round after a full win) is explicitly out of scope for
  this feature — see Non-goals.

## User stories

### 1. Playing cooperatively toward a shared win or loss

As a seated player, I can play my own lowest card at any time (no turn
order), see the team's shared lives/stars/current level, and see the
match end in a shared win (completed the final level) or shared loss (out
of lives) for every player identically — nobody has an individual
win/loss state.

### 2. Seeing the shared played-cards zone and everyone's hand size

As any seated player or spectator, I can see every card played so far
this level, in the order played, plus how many cards remain in every
player's hand (not their values) — enough to reason about the game
without any player disclosing a card value out loud.

### 3. Losing a life on a misplay

As a seated player, when I (or anyone) plays a card while another player
is holding a lower one, I see the team lose a life and see exactly which
lower cards got revealed and set aside, without the game crashing or
silently discarding cards nobody can see.

### 4. Proposing and voting on a shuriken

As a seated player, I can propose using a shuriken; every other seat sees
the pending proposal and can agree or decline. If everyone agrees, each
player's lowest card is revealed to a shared zone and a star is spent. If
anyone declines, the proposal is cancelled and no cards move.

## Acceptance criteria

1. `themind-v1` is registered as a new, independent `GameModule` (per the
   versioning heuristic above) with `minPlayers: 2`, `maxPlayers: 4`.
2. `setup` deals level 1 (one card per active seat) with the correct
   starting lives/stars for the number of **actually claimed** seats
   (`activeSeatIDs`, mirroring Love Letter's phantom-seat handling —
   `numPlayers` passed to boardgame.io is always `gameModule.maxPlayers`
   regardless of real seat count).
3. `playCard` always plays the acting player's lowest held card; a player
   with an empty hand cannot play (`INVALID_MOVE`).
4. Playing a card while any other active seat holds a lower card:
   decrements lives by exactly 1 (regardless of how many lower cards
   exist across however many seats), reveals and removes every such lower
   card from its owner's hand into a public zone, and does not restart
   the level.
5. A level completes (deals the next level, or ends the match in a win if
   it was the final level) exactly when every active seat's hand is
   empty, whether hands emptied via `playCard` or via a resolved shuriken.
6. Lives reaching 0 ends the match in a loss immediately (`ctx.gameover`
   set, no winner) — no further moves are legal afterward.
7. Completing the final level for the player count ends the match in a
   win with every active seat as `winner` (conforms to `GameoverResult`).
8. Rewards trigger only on levels 2/3/5/6/8/9 as specified, clamp at 3
   stars / 5 lives, and never go negative or above the cap.
9. Shuriken proposal/vote: `proposeShuriken` requires `stars > 0` and no
   proposal already pending; `voteShuriken(false)` from any seat cancels
   the pending proposal; `voteShuriken(true)` from every active seat
   resolves it (spend 1 star, discard each active seat's lowest card to a
   public zone, sorted for display).
10. `playerView` never leaks another player's hand values or a
    spectator's hand values (secret key: `hands`); hand **counts** are
    public and derived per-seat for every viewer.
11. `G` is JSON-serializable at every reachable point; setup is
    deterministic under a fixed seed (conformance suite).
12. The board shows: current level / total levels, lives, stars, this
    level's played-cards zone (in play order), the star-discard zone (if
    any), every active seat's hand *count*, the acting player's own hand
    *values* (sorted, only the lowest playable), and a shuriken
    propose/vote control including who has and hasn't voted yet.

## Non-goals

- "Blind mode" (the bonus round after a full team win where cards are
  played face-down). Deferred — the base game's win/loss loop is the
  full scope here.
- The "concentration" ritual (everyone places a hand on the table before
  a level begins, and may call "stop" to pause). Purely a physical/social
  ritual with no rules effect; nothing for the engine to model.
- Any player count above 4 (no expansion content shipped).
- A settings schema — the game has no configurable room-level options
  (level count/lives/stars are derived entirely from player count, not a
  host-chosen setting).
