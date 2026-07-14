import { useTranslation } from 'react-i18next';
import type { CardRank } from './deck.js';
import { CardTile } from './CardTile.js';
import { countessBlocksOtherCard } from './countessBlocksOtherCard.js';
import styles from './HandView.module.css';

export interface HandViewProps {
  hand: CardRank[];
  /** False outside the acting player's own turn, or while a picker is already open. */
  interactive: boolean;
  /** Reports which card was clicked -- LoveLetterBoard owns the play-vs-discard
   * and targeting decisions from here (plan.md's move-composition flow). */
  onCardClicked: (handIndex: number, cardRank: CardRank) => void;
}

/**
 * The acting player's own hand -- 1-2 CardTile, click-to-select. Owns only
 * the Countess forced-play disabling (spec.md story 2); every decision
 * about what a click actually DOES (play-or-discard, then targeting) lives
 * in `LoveLetterBoard`'s own move-composition state machine, since that's
 * also where the resulting picker chain renders.
 */
export function HandView({ hand, interactive, onCardClicked }: HandViewProps) {
  const { t } = useTranslation();
  const countessBlocks = countessBlocksOtherCard(hand);

  return (
    <div className={styles.hand} role="group" aria-label={t('loveLetter.hand.ariaLabel')}>
      {hand.map((rank, handIndex) => {
        const blocked = countessBlocks && (rank === 5 || rank === 7);
        return (
          <CardTile
            key={handIndex}
            rank={rank}
            onClick={interactive && !blocked ? () => onCardClicked(handIndex, rank) : undefined}
            disabled={blocked}
            disabledReason={blocked ? t('loveLetter.countessForced') : undefined}
          />
        );
      })}
    </div>
  );
}
