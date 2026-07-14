import { useTranslation } from 'react-i18next';
import { playerLabel } from './playerLabel.js';
import styles from './RoundWinsTracker.module.css';

export interface RoundWinsTrackerProps {
  roundWins: Record<string, number>;
  /** playerID -> username, for a real name instead of "Seat N" where known. */
  playerNames?: Record<string, string>;
}

/**
 * Every seat's cumulative favor-token count, rendered unconditionally --
 * spec.md story 4 explicitly requires this visible mid-round, not only at
 * round/match end.
 */
export function RoundWinsTracker({ roundWins, playerNames }: RoundWinsTrackerProps) {
  const { t } = useTranslation();
  const seats = Object.keys(roundWins);
  return (
    <div className={styles.tracker} aria-label={t('loveLetter.roundWins.title')}>
      <p>{t('loveLetter.roundWins.title')}</p>
      <ul>
        {seats.map((seatID) => (
          <li key={seatID}>
            {playerLabel(seatID, playerNames, t)}: {roundWins[seatID]}
          </li>
        ))}
      </ul>
    </div>
  );
}
