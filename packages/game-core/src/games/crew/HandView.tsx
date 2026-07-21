import { useTranslation } from 'react-i18next';
import type { Card, Suit } from './deck.js';
import { isLegalTrickPlay } from './trickResolution.js';
import { CardTile } from './CardTile.js';
import styles from './HandView.module.css';

export interface HandViewProps {
  hand: Card[];
  /** null when leading (or not in the trick phase at all) -- see trickResolution.ts's isLegalTrickPlay. */
  ledSuit: Suit | null;
  /** False outside the acting player's own turn, or whenever it isn't legal to play at all right now (drafting, trickConfirm wait). */
  interactive: boolean;
  onCardClicked: (cardID: string) => void;
  /** The seat's own currently-communicated card id, if any -- rendered dimmed as a reminder it's still un-played, per the rulebook's reminder-card convention. */
  communicatedCardID?: string | null;
}

/**
 * The acting player's own hand -- clicking a legal card plays it
 * immediately (a trick play is always a single card, unlike Regicide's
 * multi-card combo selection). Legality is computed via trickResolution's
 * own isLegalTrickPlay rather than a locally reimplemented follow-suit
 * check, same reuse convention as regicide/HandView.tsx.
 */
export function HandView({ hand, ledSuit, interactive, onCardClicked, communicatedCardID }: HandViewProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.hand} role="group" aria-label={t('crew.hand.ariaLabel')}>
      {hand.map((card) => {
        const legal = isLegalTrickPlay(hand, ledSuit, card);
        const clickable = interactive && legal;
        return (
          <CardTile
            key={card.id}
            card={card}
            onClick={clickable ? () => onCardClicked(card.id) : undefined}
            disabled={interactive && !legal}
            disabledReason={interactive && !legal ? t('crew.cardIllegalReason') : undefined}
            faded={communicatedCardID === card.id}
          />
        );
      })}
    </div>
  );
}
