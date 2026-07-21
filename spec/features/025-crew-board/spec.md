# Feature 025 — The Crew: Board UI

## Description

The `packages/client`-visible half of Crew — `CrewBoard`, the
`BoardComponent` for `crew-v1` (feature 024). Depends on feature 024's
`G`/`playerView` shape existing first. Cards render as **placeholders**
(suit emoji + rank, no artwork), matching this codebase's existing
convention (Love Letter, Regicide).

Unlike Regicide's two-step select-then-Play interaction, playing a trick
card is **click-to-play**: a trick play is always exactly one card, so
there is no combo to build before committing. Clicking a legal card in
hand submits `playCard` immediately; an illegal card (doesn't follow the
led suit when the hand holds it) renders disabled with a reason, computed
via feature 024's own `isLegalTrickPlay`, not a second, independently
written copy of that check.

Per the resolved lesson from feature 023's own plan.md: this board does
**not** build its own "N of M confirmed" UI for the `trickConfirm` wait —
`GameMount` already renders the generic `RoundConfirmBanner` above every
board. `CrewBoard`'s own job during that wait is only to (a) render the
frozen `lastTrick` state so everyone can review what just happened, and
(b) offer the one extra game-specific action available during that
window: radio communication, which has nothing to do with the confirm
count and is not a duplicate of it.

## User stories

### 1. Playing a card

As the active player during the `trick` phase, I see my hand with every
card that doesn't follow the led suit (when I hold one that does) rendered
disabled; clicking any enabled card plays it immediately.

### 2. Watching a trick unfold, and reviewing the one just finished

As any seated player or spectator, I see the trick currently in progress
(each play labeled by whose card it is) update live as each seat plays;
once a trick resolves, its final state — every card played and who won —
stays visible through the `trickConfirm` wait, replaced by an empty "no
cards yet" state only once the next trick actually starts.

### 3. Seeing every drafted task and its status

As any seated player or spectator, I see every task card drafted so far,
grouped by owner, each visually marked fulfilled or still pending — fully
public information, matching the rulebook's own face-up task cards.

### 4. Drafting a task

As the seat whose turn it is during `missionDraft`, I see every
still-unclaimed task card face-up and can click one to claim it; every
other seat sees the same pool, but only the current picker's clicks are
enabled.

### 5. Communicating a card between tricks

As any seated player, during the `trickConfirm` window (before trick 1 or
between any two tricks), I see which of my own hand's non-rocket cards
can currently be truthfully flagged as highest/only/lowest of their suit,
and can choose one such card and claim; once used, the panel shows I've
already spent my token this match instead of offering the choice again.
The communicated card itself renders visibly dimmed in my hand as a
reminder it's still un-played, clearing automatically once I play it.

### 6. Knowing who the commander is

As any seated player or spectator, I see a persistent badge naming whoever
holds the commander role for this mission.

### 7. A spectator sees the same public information a seated player sees

As a spectator (no seat claimed), I see the task board, the current/last
trick, the commander badge, and trick-progress count identically to a
seated player, but no seated player's actual hand contents — matching
feature 024's `playerView` guarantee for `playerID: undefined`.

## Acceptance criteria

`[component]` denotes a client-side concern verified by reading the
component source against feature 024's `BoardProps`/`CrewView` shape.
`[manual]` denotes verification via the real dev server.

1. `[component]` `HandView` disables exactly the cards `isLegalTrickPlay`
   (feature 024) rejects given the current led suit, with a translated
   disabled reason shown only while disabled.
2. `[component]` Clicking an enabled hand card calls `moves.playCard` with
   exactly that card's id; the hand is not interactive at all outside the
   `trick` phase or while `isActive` is false or a `trickConfirm` wait is
   pending.
3. `[component]` `TrickZone` renders the in-progress trick's plays live
   during the `trick` phase, and the just-resolved trick (including its
   winner, visually distinguished) during `trickConfirm`, from `G
   .currentTrick`/`G.lastTrick` respectively — never both, never neither
   once a trick exists.
4. `[component]` `TaskBoard` groups every task in `G.tasks` by
   `ownerSeatID`, rendering each as its target card with a visually
   distinct fulfilled/pending state, entirely from public `G` fields (no
   `hands` access).
5. `[component]` `TaskDraftPanel` renders every card in `G.taskLayout`
   still present in `G.unclaimedTaskCardIds`; its picks are only wired to
   `moves.pickTask` while `isActive` is true.
6. `[component]` `CommunicationPanel` offers only the hand cards/positions
   that are actually truthful (per feature 024's `isHighestOfSuit`/
   `isOnlyOfSuit`/`isLowestOfSuit`), excludes every rocket, and renders a
   "already used" state instead of any picker once `G.communications
   [seat].used` is true.
7. `[component]` `HandView` renders the seat's own currently-communicated
   card (if any) visually dimmed, independent of whether it's otherwise
   legal to play.
8. `[component]` `CrewBoard` renders no player list, seat controls,
   presence badges, or chat, and renders no confirm/force-advance control
   of its own (that's `GameMount`'s generic `RoundConfirmBanner`) —
   confirms the chrome/board split and feature 023's resolved
   "don't duplicate the generic confirm UI" lesson both hold here too.
9. `[manual]` A full mission played across 3-5 real browser sessions (or
   solo multi-seat claiming) from mission draft through either a win or an
   engineered loss (a wrong-owner capture or, for a tokened level, an
   order violation): drafting tasks in commander-then-clockwise order,
   playing a full trick including a rocket cutting a color-suited trick,
   confirming through the `trickConfirm` wait before trick 1 and between
   subsequent tricks, using radio communication and observing the
   dimmed-marker/clear-on-play behavior, and confirming the Rematch and
   Next Level buttons (feature 026) both work from the resulting
   `GameoverBanner` state.

## Non-goals

- Card artwork — placeholder rendering only, matching existing convention.
- A shared board-UI kit extraction — per roadmap.md's existing precedent.
- Any UI for distress signal, dead zone, disruption, or commander's
  decision/distribution — deferred alongside feature 024's own Non-goals.
- Rendering per-seat won-trick piles as visible card stacks — the
  rulebook keeps them face-down/opaque (only the last trick is
  reviewable), which `lastTrick` already covers; no separate component.
- Animations/transitions for card plays or trick resolution.
