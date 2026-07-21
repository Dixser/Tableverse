# Feature 025 — The Crew: Board UI Implementation Plan

## Component breakdown

Mirrors Regicide's own file-per-concern breakdown:

- **`BoardComponent.tsx`** (`CrewBoard`) — top-level layout: commander
  badge + trick-progress count, `TaskBoard` (always), `TaskDraftPanel`
  (only during `missionDraft`), `TrickZone` (from `currentTrick ??
  lastTrick`), `HandView` + `CommunicationPanel` (only outside the draft
  phase, and only for a seated viewer). Computes `ledSuit` from
  `currentTrick.plays[0]?.card.suit` for `HandView`'s legality check, and
  `canPlay = isActive && phase === 'trick' && roundConfirm === null`.
- **`CardTile.tsx`** — suit emoji (from i18n, `crew.suits.*`) + rank,
  same "text/placeholder only" convention as `regicide/CardTile.tsx`, with
  a `faded` variant (used for the seat's own communicated card marker,
  since Crew cards have no natural "disabled but still meaningful" state
  Regicide's `disabled` prop already covers).
- **`HandView.tsx`** — one `CardTile` per hand card, legality via
  feature 024's `isLegalTrickPlay`, click-to-play (no selection state,
  unlike Regicide's toggle-then-Play).
- **`TrickZone.tsx`** — renders a `TrickPlay[]` list plus an optional
  resolved winner/winning-card pair; the same component serves both the
  live in-progress trick and the frozen last-trick view, distinguished
  only by whether a winner is passed in.
- **`TaskBoard.tsx`** — groups `G.tasks` by `activeSeatIDs`, rendering
  each task's target card (reconstructed via `deck.ts`'s `parseCardId`,
  since `Task` only stores the target's card id, not the full `Card`)
  dimmed once fulfilled.
- **`TaskDraftPanel.tsx`** — renders `taskLayout` filtered to
  `unclaimedTaskCardIds`, wiring `onPick` only when `isActive`.
- **`CommunicationPanel.tsx`** — for each non-rocket hand card, computes
  which of highest/only/lowest are truthful (reusing `communication.ts`'s
  three checkers directly, never a re-implementation) and renders a button
  per truthful claim; renders an "already used" message once `used`.
- **`CommanderBadge.tsx`**, **`playerLabel.ts`** — thin, same convention
  as every other game's copy of these.

## i18n

New `crew.*` namespace added to both `en.json`/`es.json` (suits, card
label, hand aria-label, commander badge, trick-progress, trick zone
titles/empty-state/winner line, task board titles/fulfilled/pending,
draft-panel title, communication panel title/none/used/position labels,
and `G.log` message templates for chat). No existing namespace touched.

## Files

```
packages/game-core/src/games/crew/
  BoardComponent.tsx (+ .module.css)
  CardTile.tsx (+ .module.css)
  HandView.tsx (+ .module.css)
  TrickZone.tsx (+ .module.css)
  TaskBoard.tsx (+ .module.css)
  TaskDraftPanel.tsx (+ .module.css)
  CommunicationPanel.tsx (+ .module.css)
  CommanderBadge.tsx (+ .module.css)
  playerLabel.ts
packages/client/src/i18n/locales/{en,es}.json  # new "crew" key
```

Registration: `CrewBoard` re-exported from `packages/game-core/src/boards
.ts`; `'crew-v1': CrewBoard` added to `packages/client/src/boardRegistry
.ts` — the two client-only wiring points, alongside `crewModule` in
`gamesCatalog.ts` (feature 024).

## Non-goals (implementation-level)

- Component-level `.test.tsx` files with a dedicated i18n test fixture
  (the convention every other game's board components follow) were not
  written for this pass, given the scope of shipping the full rules
  engine + board together — verified instead via full-monorepo
  typechecking and the manual browser playthrough (spec.md AC9). Adding
  the per-component test fixture is reasonable, well-scoped follow-up
  work, not a redesign.
- A shared board-UI kit extraction — per roadmap.md's existing precedent.
