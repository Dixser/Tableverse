import { useTranslation } from 'react-i18next';
import { isLegalSelection } from './legalPlay.js';
import type { Card } from './deck.js';
import { CardTile } from './CardTile.js';
import styles from './HandView.module.css';

export interface HandViewProps {
  hand: Card[];
  /** The player's own in-progress selection (never written to G -- see
   * BoardComponent's own draft state doc comment). */
  selectedCardIds: string[];
  /** False outside the acting player's own turn, or while a picker
   * (Jester next-player) is already open. */
  interactive: boolean;
  onCardClicked: (cardID: string) => void;
}

/**
 * The acting player's own hand -- toggle-select multiple cards into a
 * combo before Play is pressed (spec.md story 1). A card already part of
 * the selection can always be clicked again to deselect it; every other
 * card is disabled (with a reason) the instant adding it would make the
 * selection illegal, computed via feature 022's own `isLegalSelection`
 * rather than a locally reimplemented legality check (spec.md AC1-3).
 */
export function HandView({ hand, selectedCardIds, interactive, onCardClicked }: HandViewProps) {
  const { t } = useTranslation();
  const selectedCards = hand.filter((c) => selectedCardIds.includes(c.id));

  return (
    <div className={styles.hand} role="group" aria-label={t('regicide.hand.ariaLabel')}>
      {hand.map((card) => {
        const isSelected = selectedCardIds.includes(card.id);
        const legal = isSelected || isLegalSelection([...selectedCards, card]);
        const clickable = interactive && legal;
        return (
          <CardTile
            key={card.id}
            card={card}
            selected={isSelected}
            onClick={clickable ? () => onCardClicked(card.id) : undefined}
            disabled={interactive && !legal}
            disabledReason={interactive && !legal ? t('regicide.cardIllegalReason') : undefined}
          />
        );
      })}
    </div>
  );
}
