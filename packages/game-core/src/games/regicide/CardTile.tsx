import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { enemyAttack, enemyHealth, type Card } from './deck.js';
import styles from './CardTile.module.css';

/**
 * Translated rank/suit label for any of the four card kinds -- exported
 * separately so a test (or another component, e.g. a future log-message
 * renderer) can assert on it without mounting CardTile. Regicide cards
 * always need a suit alongside a rank (unlike Love Letter's plain numeric
 * rank), so this can't reuse Love Letter's own `loveLetter.cards.*` keys.
 */
export function cardLabel(card: Card, t: TFunction): string {
  switch (card.kind) {
    case 'number':
      return t('regicide.cardLabel.number', {
        rank: card.rank,
        suit: t(`regicide.suits.${card.suit}`),
      });
    case 'companion':
      return t('regicide.cardLabel.companion', { suit: t(`regicide.suits.${card.suit}`) });
    case 'jester':
      return t('regicide.cardLabel.jester');
    case 'face':
      return t('regicide.cardLabel.face', {
        rank: t(`regicide.faceRanks.${card.rank}`),
        suit: t(`regicide.suits.${card.suit}`),
      });
  }
}

export interface CardTileProps {
  card: Card;
  onClick?: () => void;
  disabled?: boolean;
  disabledReason?: string;
  /** Smaller, inert rendering for a passive badge (cards in play, discard
   * pile size) -- same convention as Love Letter's CardTile `compact`. */
  compact?: boolean;
  /** Shows the card's attack/discard value and, for a face card, its
   * printed health -- used by EnemyPanel for the current enemy; every
   * other caller (hand, cards-in-play) omits it. */
  showStats?: boolean;
  /** Visually marks a card as part of the player's in-progress selection
   * (HandView/DefendPanel's two-step select-then-submit flow). */
  selected?: boolean;
}

/**
 * One card's placeholder rendering -- rank + suit, no artwork, same
 * "text/label only" convention Love Letter's CardTile established
 * (spec.md Non-goals). Doubles as the interactive hand/discard-selection
 * card (onClick supplied) and a static badge (enemy card, cards in play,
 * discard-pile count) -- inert whenever onClick is omitted.
 */
export function CardTile({
  card,
  onClick,
  disabled,
  disabledReason,
  compact,
  showStats,
  selected,
}: CardTileProps) {
  const { t } = useTranslation();
  const label = cardLabel(card, t);
  const stats =
    showStats && card.kind === 'face'
      ? t('regicide.cardStats', { attack: enemyAttack(card), health: enemyHealth(card) })
      : undefined;
  const base = compact ? styles.cardCompact : styles.card;

  return (
    <button
      type="button"
      className={selected ? `${base} ${styles.selected}` : base}
      onClick={onClick}
      disabled={disabled || !onClick}
      title={disabledReason}
      aria-pressed={selected}
    >
      <span className={styles.label}>{label}</span>
      {stats && <span className={styles.stats}>{stats}</span>}
    </button>
  );
}
