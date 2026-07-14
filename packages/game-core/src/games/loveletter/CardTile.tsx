import { useTranslation } from 'react-i18next';
import type { CardRank } from './deck.js';
import styles from './CardTile.module.css';

export interface CardTileProps {
  rank: CardRank;
  onClick?: () => void;
  disabled?: boolean;
  disabledReason?: string;
  /** Smaller rendering for a passive played-card badge (PlayArea), so it
   * doesn't visually compete with the player's own, actionable hand. */
  compact?: boolean;
}

/**
 * One card's placeholder rendering -- rank, translated name, translated
 * effect text, no artwork (spec.md Non-goals: "no image element ... none
 * planned"). Doubles as both the interactive hand card (HandView, `onClick`
 * supplied) and a static played-card badge (PlayArea, `onClick` omitted) --
 * same visual/i18n shape either way, just enabled vs. inert.
 */
export function CardTile({ rank, onClick, disabled, disabledReason, compact }: CardTileProps) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className={compact ? styles.cardCompact : styles.card}
      onClick={onClick}
      disabled={disabled || !onClick}
      title={disabledReason}
    >
      <span className={styles.rank}>{rank}</span>
      <span className={styles.name}>{t(`loveLetter.cards.${rank}.name`)}</span>
      <span className={styles.text}>{t(`loveLetter.cards.${rank}.text`)}</span>
    </button>
  );
}
