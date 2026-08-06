import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DndContext, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import type { BoardProps } from '../../types.js';
import type { CahootsView } from './gameDef.js';
import { isLegalPlacement, type Card } from './deck.js';
import { resolveDragTarget } from './dragTarget.js';
import { HandView } from './HandView.js';
import { PileZone } from './PileZone.js';
import { GoalBoard } from './GoalBoard.js';
import { PlayerStatusList } from './PlayerStatusList.js';
import { DeckStack } from './DeckStack.js';
import { cardLabel } from './CardTile.js';
import { useHandOrder } from '../../ui/useHandOrder.js';
import { useHandSortSensors } from '../../ui/useHandSortSensors.js';
import { handSortAccessibility } from '../../ui/handSortA11y.js';
import styles from './BoardComponent.module.css';

/**
 * Renders ONLY this game's play surface -- no player list, seat controls,
 * or presence indicators (tech-stack.md's chrome/board split). Unlike
 * Crew/Love Letter, there is no RoundConfirmBanner concern here: Cahoots
 * has no phase machinery and no confirm-wait step at all (see feature
 * 028's "Resolved design decisions"). Win/loss is entirely the platform's
 * existing generic GameoverBanner -- nothing custom is rendered for it here.
 *
 * First real @dnd-kit consumer (feature 027 was plumbing-only): dragging
 * a hand card onto a pile calls moves.playCard directly from this
 * component's own onDragEnd, the only place that decides a move actually
 * happens -- PileZone's highlighting is a pure visual aid computed from
 * the same isLegalPlacement, never a second source of truth.
 *
 * Since feature 031 this single DndContext serves TWO gestures: a card
 * dropped on a pile is played, a card dropped on another hand card is just
 * rearranged. resolveDragTarget owns that decision (and is unit-tested
 * separately, since jsdom cannot produce a real `over`).
 */
export const CahootsBoard: React.FC<BoardProps<CahootsView>> = ({ G, ctx, moves, playerID, isActive, playerNames }) => {
  const { t } = useTranslation();
  const [draggedCard, setDraggedCard] = useState<Card | null>(null);
  const serverHand = playerID != null ? (G.hands[playerID] ?? []) : [];
  const { orderedHand: ownHand, itemIds, moveCard, applySort, resetOrder, isCustomised } =
    useHandOrder(serverHand);
  const sensors = useHandSortSensors();
  const canPlay = isActive;

  const handleDragStart = (event: DragStartEvent) => {
    const card = ownHand.find((c) => c.id === event.active.id) ?? null;
    // Only light up the piles when a drop there could actually land a move.
    // Off-turn a drag is a reorder, and highlighting all four piles for it
    // would be a false promise.
    setDraggedCard(canPlay ? card : null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggedCard(null);
    const target = resolveDragTarget(event.over?.id, itemIds);

    // Reordering is handled FIRST and deliberately outside the canPlay gate:
    // rearranging your own hand is cosmetic and has to work while you wait
    // for your turn, which is the whole point of feature 031.
    if (target.kind === 'reorder') {
      moveCard(String(event.active.id), target.overCardId);
      return;
    }

    if (target.kind !== 'pile' || !canPlay) return;
    const pile = G.piles[target.pileIndex];
    const top = pile?.[pile.length - 1];
    const card = ownHand.find((c) => c.id === event.active.id);
    if (!card || !top || !isLegalPlacement(card, top)) return;
    moves.playCard?.(target.pileIndex, card.id);
  };

  /** Card labels for the drag announcements; a pile id falls back to its own label. */
  const labelFor = (id: string) => {
    const card = ownHand.find((c) => c.id === id);
    if (card) return cardLabel(card, t);
    const match = /^pile-(\d+)$/.exec(id);
    return match ? t('cahoots.pile.label', { index: Number(match[1]) + 1 }) : id;
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDraggedCard(null)}
      accessibility={handSortAccessibility(t, labelFor)}
    >
      <div className={styles.board}>
        <div className={styles.topRow}>
          <DeckStack
            count={G.drawPile.length}
            ariaLabel={t('cahoots.drawPile.ariaLabel', { count: G.drawPile.length })}
            variant="draw"
          />
          <PlayerStatusList
            activeSeatIDs={G.activeSeatIDs}
            handCounts={G.handCounts}
            playerID={playerID}
            playerNames={playerNames}
            currentPlayerID={ctx.currentPlayer}
          />
        </div>

        <GoalBoard activeGoals={G.activeGoals} remainingCount={G.goalDeck.length} />

        <div className={styles.piles}>
          {G.piles.map((pile, index) => (
            <PileZone key={index} pileIndex={index} pile={pile} draggedCard={draggedCard} />
          ))}
        </div>

        {playerID != null && (
          <HandView
            hand={ownHand}
            interactive={canPlay}
            itemIds={itemIds}
            onSort={applySort}
            onResetOrder={resetOrder}
            isCustomised={isCustomised}
          />
        )}
      </div>
    </DndContext>
  );
};
