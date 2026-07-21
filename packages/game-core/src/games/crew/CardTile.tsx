import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { Card } from './deck.js';
import styles from './CardTile.module.css';

/** Suit icon + rank label -- same "text/placeholder art only" convention as regicide/CardTile.tsx. */
export function cardLabel(card: Card, t: TFunction): string {
  return t('crew.cardLabel', { suit: t(`crew.suits.${card.suit}`), rank: card.rank });
}

export interface CardTileProps {
  card: Card;
  onClick?: () => void;
  disabled?: boolean;
  disabledReason?: string;
  compact?: boolean;
  selected?: boolean;
  /** Dims the tile (still shows suit/rank) without disabling it as a click target -- used for the communicated-card marker. */
  faded?: boolean;
}

export function CardTile({ card, onClick, disabled, disabledReason, compact, selected, faded }: CardTileProps) {
  const { t } = useTranslation();
  const label = cardLabel(card, t);
  const base = compact ? styles.cardCompact : styles.card;
  const classNames = [base, selected ? styles.selected : null, faded ? styles.faded : null]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      className={`${classNames} ${styles[card.suit]}`}
      onClick={onClick}
      disabled={disabled || !onClick}
      title={disabledReason}
      aria-pressed={selected}
      aria-label={label}
    >
      <span className={styles.rank} aria-hidden="true">
        {card.rank}
      </span>
    </button>
  );
}
