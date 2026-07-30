import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDroppable } from '@dnd-kit/core';
import { isLegalPlacement, type Card } from './deck.js';
import { CardTile } from './CardTile.js';
import styles from './PileZone.module.css';

export interface PileZoneProps {
  pileIndex: number;
  /** Full stack, bottom to top -- not just the current top card (rulebook: a pile may be looked through at any time). */
  pile: Card[];
  /** The hand card currently being dragged, if any -- drives legal/illegal highlighting. Null when nothing is being dragged. */
  draggedCard: Card | null;
}

/**
 * A droppable pile. `useDroppable`'s id is `pile-{index}`, parsed back by
 * BoardComponent's onDragEnd -- the only place that actually calls
 * moves.playCard, so legality is never independently re-decided here
 * beyond the highlight, which reuses feature 028's own isLegalPlacement.
 */
export function PileZone({ pileIndex, pile, draggedCard }: PileZoneProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const { setNodeRef, isOver } = useDroppable({ id: `pile-${pileIndex}` });
  const top = pile[pile.length - 1];
  const legalTarget = draggedCard != null && top != null && isLegalPlacement(draggedCard, top);

  const className = [
    styles.pile,
    draggedCard != null ? (legalTarget ? styles.legalTarget : styles.illegalTarget) : null,
    isOver && legalTarget ? styles.over : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={setNodeRef} className={className}>
      <div className={styles.label}>{t('cahoots.pile.label', { index: pileIndex + 1 })}</div>
      {top && <CardTile card={top} />}
      <button type="button" className={styles.expandButton} onClick={() => setExpanded((prev) => !prev)}>
        {expanded ? t('cahoots.pile.collapse') : t('cahoots.pile.expand', { cardsCount: pile.length })}
      </button>
      {expanded && (
        <div className={styles.stack} aria-label={t('cahoots.pile.historyAriaLabel', { index: pileIndex + 1 })}>
          {pile.map((card) => (
            <CardTile key={card.id} card={card} compact />
          ))}
        </div>
      )}
    </div>
  );
}
