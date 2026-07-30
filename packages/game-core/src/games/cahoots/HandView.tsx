import { useTranslation } from 'react-i18next';
import { useDraggable } from '@dnd-kit/core';
import type { Card } from './deck.js';
import { CardTile } from './CardTile.js';
import styles from './HandView.module.css';

interface DraggableCardProps {
  card: Card;
  interactive: boolean;
}

/**
 * The one dnd-kit draggable in this board -- `disabled` (not simply
 * omitting listeners) is what keeps a non-interactive card from ever
 * starting a drag at all, rather than merely rejecting the resulting
 * move server-side.
 */
function DraggableCard({ card, interactive }: DraggableCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    disabled: !interactive,
  });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const className = [styles.cardSlot, isDragging ? styles.dragging : null].filter(Boolean).join(' ');
  return (
    <div ref={setNodeRef} style={style} className={className} {...(interactive ? listeners : {})} {...(interactive ? attributes : {})}>
      <CardTile card={card} />
    </div>
  );
}

export interface HandViewProps {
  hand: Card[];
  /** False outside the acting seat's own turn -- a non-interactive card renders but cannot be picked up at all. */
  interactive: boolean;
}

/**
 * The acting player's own hand -- each card is draggable directly onto a
 * pile (see BoardComponent's DndContext), replacing the click-to-select
 * pattern every earlier game in this codebase uses (feature 029 is the
 * first real @dnd-kit consumer).
 */
export function HandView({ hand, interactive }: HandViewProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.hand} role="group" aria-label={t('cahoots.hand.ariaLabel')}>
      {hand.map((card) => (
        <DraggableCard key={card.id} card={card} interactive={interactive} />
      ))}
    </div>
  );
}
