import { useTranslation } from 'react-i18next';
import styles from './HandView.module.css';

export interface HandViewProps {
  /** Sorted ascending. */
  hand: number[];
  /** False once it's not this seat's turn to act (e.g. a shuriken vote is pending, or the match ended). */
  interactive: boolean;
  /** The rulebook requires the lowest held card be played first -- there is no card choice to report. */
  onPlayLowest: () => void;
}

/**
 * The acting player's own hand. Only the lowest card is ever clickable --
 * playing any other card is not a legal choice (spec.md's "no card-choice
 * parameter" decision, gameDef.ts's playCard).
 */
export function HandView({ hand, interactive, onPlayLowest }: HandViewProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.hand} role="group" aria-label={t('theMind.hand.ariaLabel')}>
      {hand.length === 0 && <p className={styles.empty}>{t('theMind.hand.empty')}</p>}
      {hand.map((card, index) => {
        const isLowest = index === 0;
        const clickable = isLowest && interactive;
        return (
          <button
            key={index}
            type="button"
            className={isLowest ? styles.cardLowest : styles.card}
            disabled={!clickable}
            onClick={clickable ? onPlayLowest : undefined}
          >
            {card}
          </button>
        );
      })}
    </div>
  );
}
