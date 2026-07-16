import { useTranslation } from 'react-i18next';
import type { Card } from './deck.js';
import { CardTile } from './CardTile.js';
import styles from './PlayedCardsZone.module.css';

export interface PlayedCardsZoneProps {
  /** `G.cardsInPlay` -- cards played against the current enemy so far
   * this round, not yet moved to the discard pile (that only happens once
   * the enemy is defeated and the roundConfirm wait resolves -- see
   * gameDef.ts's resolveEnemyDefeat/onEnd). Without rendering this, a
   * played card simply vanishes from the board's own view the instant
   * it's played, even though it's sitting in public state the whole
   * round. Resets to empty the moment a new enemy is revealed. */
  cardsInPlay: Card[];
}

/**
 * This round's played-cards pile -- public, identical for every viewer
 * (seated or spectator). Mirrors The Mind's own PlayedCardsZone in
 * name/intent (a per-round public pile that isn't the discard pile).
 */
export function PlayedCardsZone({ cardsInPlay }: PlayedCardsZoneProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.zone}>
      <p>{t('regicide.playedCards.title')}</p>
      <div className={styles.cards} aria-label={t('regicide.playedCards.title')}>
        {cardsInPlay.length === 0 && (
          <span className={styles.placeholder}>{t('regicide.playedCards.empty')}</span>
        )}
        {cardsInPlay.map((card) => (
          <CardTile key={card.id} card={card} compact />
        ))}
      </div>
    </div>
  );
}
