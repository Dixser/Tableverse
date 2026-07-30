import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DndContext, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import type { BoardProps } from '../../types.js';
import type { CahootsView } from './gameDef.js';
import { isLegalPlacement, type Card } from './deck.js';
import { HandView } from './HandView.js';
import { PileZone } from './PileZone.js';
import { GoalBoard } from './GoalBoard.js';
import { PlayerStatusList } from './PlayerStatusList.js';
import { DeckStack } from './DeckStack.js';
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
 */
export const CahootsBoard: React.FC<BoardProps<CahootsView>> = ({ G, ctx, moves, playerID, isActive, playerNames }) => {
  const { t } = useTranslation();
  const [draggedCard, setDraggedCard] = useState<Card | null>(null);
  const ownHand = playerID != null ? (G.hands[playerID] ?? []) : [];
  const canPlay = isActive;

  const handleDragStart = (event: DragStartEvent) => {
    const card = ownHand.find((c) => c.id === event.active.id) ?? null;
    setDraggedCard(card);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggedCard(null);
    if (!canPlay) return;
    const overID = event.over?.id;
    if (typeof overID !== 'string' || !overID.startsWith('pile-')) return;
    const pileIndex = Number(overID.slice('pile-'.length));
    const pile = G.piles[pileIndex];
    const top = pile?.[pile.length - 1];
    const card = ownHand.find((c) => c.id === event.active.id);
    if (!card || !top || !isLegalPlacement(card, top)) return;
    moves.playCard?.(pileIndex, card.id);
  };

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setDraggedCard(null)}>
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

        {playerID != null && <HandView hand={ownHand} interactive={canPlay} />}
      </div>
    </DndContext>
  );
};
