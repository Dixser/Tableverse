import { useTranslation } from 'react-i18next';
import type { CardRank } from './deck.js';
import styles from './TargetPicker.module.css';

const ALL_RANKS: CardRank[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const GUESSABLE_RANKS = ALL_RANKS.filter((rank) => rank !== 1);

export interface GuardGuessPickerProps {
  onGuess: (rank: CardRank) => void;
  onCancel: () => void;
}

/** Chained after TargetPicker for the Guard only -- every rank except Guard itself (spec.md AC4). */
export function GuardGuessPicker({ onGuess, onCancel }: GuardGuessPickerProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.picker} role="group" aria-label={t('loveLetter.target.guessTitle')}>
      <p>{t('loveLetter.target.guessTitle')}</p>
      {GUESSABLE_RANKS.map((rank) => (
        <button key={rank} type="button" onClick={() => onGuess(rank)}>
          {t(`loveLetter.cards.${rank}.name`)}
        </button>
      ))}
      <button type="button" onClick={onCancel}>
        {t('loveLetter.target.cancel')}
      </button>
    </div>
  );
}
