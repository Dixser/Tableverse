import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { Card } from './deck.js';
import styles from './CardTile.module.css';

/** Color + number label -- same "text/placeholder art only" convention as regicide/crew's CardTile.tsx. */
export function cardLabel(card: Card, t: TFunction): string {
  return t('cahoots.cardLabel', { color: t(`cahoots.colors.${card.color}`), number: card.number });
}

export interface CardTileProps {
  card: Card;
  compact?: boolean;
  /** Dims the tile -- purely visual, not used for interactivity (dragging/legality live in HandView/PileZone). */
  faded?: boolean;
}

export function CardTile({ card, compact, faded }: CardTileProps) {
  const { t } = useTranslation();
  const label = cardLabel(card, t);
  const base = compact ? styles.cardCompact : styles.card;
  const classNames = [base, styles[card.color], faded ? styles.faded : null].filter(Boolean).join(' ');
  return (
    <div className={classNames} aria-label={label} title={label}>
      <span className={styles.number} aria-hidden="true">
        {card.number}
      </span>
    </div>
  );
}
