import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { enemyAttack, enemyHealth, type Card } from './deck.js';
import styles from './CardTile.module.css';

/**
 * The physical Regicide print-and-play deck uses each suit's Ace card to
 * represent its Animal Companion -- so a companion card renders exactly
 * like a number/face card (suit icon + rank), with a fixed "A" rank.
 * Deliberately NOT translated: "A" is the universal abbreviation for Ace
 * regardless of locale (same category as the raw digit ranks, which are
 * never translated either), not language-specific copy.
 */
const ACE_RANK = 'A';

/**
 * Translated rank/suit label for any of the four card kinds -- exported
 * separately so a test (or another component, e.g. a future log-message
 * renderer) can assert on it without mounting CardTile. Regicide cards
 * always need a suit alongside a rank (unlike Love Letter's plain numeric
 * rank), so this can't reuse Love Letter's own `loveLetter.cards.*` keys.
 * Also used as the CardTile button's `aria-label` -- the visible content
 * for a number/face/companion card is split into separate suit-icon/rank
 * elements (see CardTile below), so this single combined string is what
 * actually carries the card's accessible name (and is what tests query
 * by).
 */
export function cardLabel(card: Card, t: TFunction): string {
  switch (card.kind) {
    case 'number':
      return t('regicide.cardLabel.number', {
        rank: card.rank,
        suit: t(`regicide.suits.${card.suit}`),
      });
    case 'companion':
      return t('regicide.cardLabel.number', { rank: ACE_RANK, suit: t(`regicide.suits.${card.suit}`) });
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
 * One card's placeholder rendering -- suit icon + rank, no artwork, same
 * "text/label only" convention Love Letter's CardTile established
 * (spec.md Non-goals). A number/face/companion card renders its suit icon
 * (small, muted) above its rank (large, fixed at 2rem) so a 1-digit and
 * 2-digit rank never change the card's footprint -- both are laid out
 * inside a fixed-size card, not sized to content. Only a Jester (no suit,
 * no rank at all) falls back to its full text label. Doubles as the
 * interactive hand/discard-selection card (onClick supplied) and a
 * static badge (enemy card, cards in play, discard-pile count) -- inert
 * whenever onClick is omitted.
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

  const suitIcon = card.kind === 'jester' ? null : t(`regicide.suits.${card.suit}`);
  const rank =
    card.kind === 'number'
      ? String(card.rank)
      : card.kind === 'face'
        ? t(`regicide.faceRanks.${card.rank}`)
        : card.kind === 'companion'
          ? ACE_RANK
          : null;

  return (
    <button
      type="button"
      className={selected ? `${base} ${styles.selected}` : base}
      onClick={onClick}
      disabled={disabled || !onClick}
      title={disabledReason}
      aria-pressed={selected}
      aria-label={label}
    >
      {suitIcon !== null && rank !== null ? (
        <>
          <span className={styles.suit} aria-hidden="true">
            {suitIcon}
          </span>
          <span className={styles.rank} aria-hidden="true">
            {rank}
          </span>
        </>
      ) : (
        <span className={styles.label} aria-hidden="true">
          {label}
        </span>
      )}
      {stats && (
        <span className={styles.stats} aria-hidden="true">
          {stats}
        </span>
      )}
    </button>
  );
}
