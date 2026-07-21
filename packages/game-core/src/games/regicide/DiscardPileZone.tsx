import { useTranslation } from 'react-i18next';
import type { Card } from './deck.js';
import { CardTile } from './CardTile.js';
import styles from './DiscardPileZone.module.css';

export interface DiscardPileZoneProps {
  /** `G.discardPile` -- every card discarded so far (defeated non-exact
   * enemies, cards played to defeat/defend that didn't go to the Tavern,
   * etc). Public state, identical for every viewer. Nothing in this game
   * ever reshuffles the discard pile back into the Tavern deck, so this
   * list only ever grows -- rendering the full contents (not just the
   * DeckStack's count, which stays alongside this) lets a player reason
   * about what's already cycled out of the remaining Tavern deck. */
  discardPile: Card[];
}

/**
 * The discard pile's actual contents, rendered next to its DeckStack count
 * (EnemyPanel) rather than replacing it -- mirrors PlayedCardsZone's own
 * "title + wrapping row of compact CardTiles" shape for a public, per-card
 * pile.
 */
export function DiscardPileZone({ discardPile }: DiscardPileZoneProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.zone}>
      <p>{t('regicide.discardedCards.title')}</p>
      <div className={styles.cards} aria-label={t('regicide.discardedCards.title')}>
        {discardPile.length === 0 && (
          <span className={styles.placeholder}>{t('regicide.discardedCards.empty')}</span>
        )}
        {discardPile.map((card) => (
          <CardTile key={card.id} card={card} compact />
        ))}
      </div>
    </div>
  );
}
