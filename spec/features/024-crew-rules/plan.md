# Feature 024 — The Crew: Rules Engine Implementation Plan

## Turn/phase architecture

Three phases, cycling `trickConfirm` ⇄ `trick` after an initial
`missionDraft`:

- **`missionDraft`** (`start: true`) — turn-based, `turn.order.first` =
  commander, `next` = plain clockwise among active seats (looping through
  multiple passes when `taskCount > activeSeatCount`). One move,
  `pickTask`. `endIf: unclaimedTaskCardIds.length === 0` — true
  immediately for a 0-task level, so it transitions with no move ever
  called. `onEnd` calls `beginRoundConfirm`, handing off into
  `trickConfirm` for the pre-trick-1 communication window.
- **`trickConfirm`** — reuses feature 021's shared `roundConfirm.ts`
  directly (`beginRoundConfirm`/`confirmRoundReadyMove`/
  `forceAdvanceRoundMove`), `turn: { activePlayers: ActivePlayers.ALL }`.
  Deliberately used in two contexts with one phase: before trick 1
  (`lastTrick` is null — nothing to show yet, purely the pre-game
  communication window) and between every subsequent trick (showing the
  just-resolved `lastTrick`). Adds one move beyond the two reused ones:
  `communicateCard`. `onEnd` clears `roundConfirm`/`lastTrick`, increments
  `trickNumber`, and deals the next `currentTrick` from
  `nextTrickLeaderSeatID`.
- **`trick`** — turn-based, `turn.order.first` =
  `currentTrick.leaderSeatID`, `next` = plain clockwise (every active seat
  plays exactly once). One move, `playCard`. `endIf: roundConfirm !==
  null` — stays false (no transition) on a match-ending win/loss, mirroring
  Regicide's own "no roundConfirm on the match-ending defeat" precedent;
  the top-level `endIf` ends the match on its own next check instead.

## Trick resolution happens inside the move, not a phase hook

Same reasoning as Regicide's `resolveEnemyDefeat`: a win/loss must be able
to skip the `trickConfirm` wait entirely, which only works if reaching
that decision happens *before* `endIf` is evaluated, i.e. inside the move
itself.

```ts
function resolveCompletedTrick(G: CrewG): void {
  const trick = G.currentTrick!;
  const { winnerSeatID, winningCard } = resolveTrick(trick.plays);
  const level = getLevel(G.level);

  const { violated: taskViolated, fulfilledDraftIndexes } =
    applyTaskFulfillment(G.tasks, { winnerSeatID, plays: trick.plays });

  let violated = taskViolated;
  if (!violated) {
    const tokenedFulfilled = fulfilledDraftIndexes.filter((idx) =>
      level.constraints.some((c) => c.kind === 'taskOrder' && c.taskIndex === idx));
    if (tokenedFulfilled.length > 0) G.tokenFulfillmentBatches.push(tokenedFulfilled);
    if (checkTaskOrderViolations(level.constraints, G.tokenFulfillmentBatches)) violated = true;
  }
  if (!violated && checkTrickOutcomeViolations(level.constraints, { winnerSeatID, winningCard }, G.activeSeatIDs)) {
    violated = true;
  }
  if (violated) { G.matchResult = 'lost'; return; }

  if (G.tasks.length > 0 && G.tasks.every((t) => t.fulfilled)) { G.matchResult = 'won'; return; }

  const isLastTrick = G.trickNumber >= G.totalTricks;
  if (isLastTrick) {
    // A task-based mission still short a task here can only mean its
    // target was the 3-player deal's permanently-unplayed extra card.
    G.matchResult = G.tasks.length === 0 ? 'won' : 'lost';
    return;
  }

  G.lastTrick = { plays: trick.plays, winnerSeatID, winningCard };
  G.currentTrick = null;
  G.nextTrickLeaderSeatID = winnerSeatID;
  beginRoundConfirm(G, G.activeSeatIDs);
}
```

`playCard` calls this only once `trick.plays.length === activeSeatIDs
.length`; otherwise it just appends the play and calls `events.endTurn()`.

## Task order-token checking

`constraints.ts`'s `checkTaskOrderViolations` is re-derived from scratch
each call against `G.tokenFulfillmentBatches` (a chronological list of
*which trick* fulfilled which tokened tasks, batched — a trick can
fulfill more than one). This keeps the "consecutive tokens in the same
trick both count regardless of order" rule (spec.md AC8) a matter of
"same batch index," not bespoke sequencing logic, and makes the checker
trivially re-runnable rather than needing incremental state.

## Dealing and the 3-player extra card

`deck.ts`'s `dealHands` deals round-robin from a shuffled 40-card deck
until it's empty — no special-cased "leftover pile." `totalTricks =
Math.floor(40 / activeSeatIDs.length)` (the MINIMUM hand size), so the
seat(s) that land a 40-mod-n extra card simply have one card left in hand
forever; nothing needs to actively prevent it from being played; the
mission's fixed trick count just runs out first. Only 3-player deals ever
have this (40 mod 3 = 1; 40 mod 4 = 40 mod 5 = 0).

## `CrewG` shape

```ts
interface CrewG extends RoundConfirmG {
  activeSeatIDs: string[];
  level: number;
  commanderSeatID: string;
  hands: Record<string, Card[]>;              // secret
  taskLayout: TaskCard[];                       // public, fixed draft-layout order = taskIndex
  unclaimedTaskCardIds: string[];               // public
  tasks: Task[];                                 // public
  communications: Record<string, CommunicationState>; // public
  currentTrick: { leaderSeatID: string; plays: TrickPlay[] } | null;
  lastTrick: { plays: TrickPlay[]; winnerSeatID: string; winningCard: Card } | null;
  tokenFulfillmentBatches: number[][];
  trickNumber: number;
  totalTricks: number;
  nextTrickLeaderSeatID: string | null;
  log: GameLogEntry[];
  matchResult: 'won' | 'lost' | null;
}
```

`playerView` strips `hands` to the viewer's own seat plus `handCounts`
(sizes only) for everyone — the same shape as `RegicideView`.

## Files

```
packages/game-core/src/games/crew/
  deck.ts               # Card/Suit/TaskCard types, buildPlayingDeck (40), buildTaskDeck (36), dealHands, parseCardId
  trickResolution.ts    # isLegalTrickPlay, resolveTrick -- pure, reused by the board for card-disabling
  communication.ts       # isHighestOfSuit/isOnlyOfSuit/isLowestOfSuit -- pure, server-validated claims
  levels.ts              # LevelDefinition/LevelConstraint types + the placeholder level set (1-5)
  constraints.ts         # Task type, applyTaskFulfillment, checkTaskOrderViolations, checkTrickOutcomeViolations
  gameDef.ts             # CrewG/CrewView/CrewSetupData, the 3-phase Game<CrewG>, all moves
  index.ts               # crewModule: GameModule (id: 'crew-v1', settingsSchema: level 1-50 enum)
  *.test.ts               # unit coverage for every file above
  crewModule.conformance.test.ts
```

Board UI (feature 025): `BoardComponent.tsx`, `CardTile.tsx`,
`HandView.tsx`, `TrickZone.tsx`, `TaskBoard.tsx`, `TaskDraftPanel.tsx`,
`CommunicationPanel.tsx`, `CommanderBadge.tsx`, `playerLabel.ts`.

## Implementation-level non-goals

- Distress signal, dead zone, disruption, commander's decision/
  distribution, the 5-player mission-25+ handover — see spec.md's Non-goals.
- `crew-2p-v1` — a future, independent catalog entry.
- Any in-match reattempt loop or attempt counter — one match is one
  attempt; retry/next-level both happen at the Room level (feature 026).
