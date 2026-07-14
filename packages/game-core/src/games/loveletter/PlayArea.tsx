import { useTranslation } from 'react-i18next';
import type { CardRank } from './deck.js';
import { CardTile } from './CardTile.js';
import { playerLabel } from './playerLabel.js';
import styles from './PlayArea.module.css';

export interface PlayAreaProps {
  playedCards: Record<string, CardRank[]>;
  eliminated: Record<string, boolean>;
  handmaidProtected: Record<string, boolean>;
  /** playerID -> username, for a real name instead of "Seat N" where known. */
  playerNames?: Record<string, string>;
}

/**
 * Every seat's discard pile + elimination/protection status -- public
 * information, identical for every viewer (seated or spectator), always
 * visible. Never reads hands or privateReveals.
 */
export function PlayArea({ playedCards, eliminated, handmaidProtected, playerNames }: PlayAreaProps) {
  const { t } = useTranslation();
  const seats = Object.keys(playedCards);
  return (
    <div className={styles.playArea} aria-label={t('loveLetter.playArea.title')}>
      {seats.map((seatID) => (
        <div key={seatID} className={styles.seat}>
          <div className={styles.seatHeader}>
            <span>{playerLabel(seatID, playerNames, t)}</span>
            {eliminated[seatID] && (
              <span className={styles.badge}>{t('loveLetter.playArea.eliminated')}</span>
            )}
            {handmaidProtected[seatID] && (
              <span className={styles.badge}>{t('loveLetter.playArea.protected')}</span>
            )}
          </div>
          <div className={styles.cards}>
            {playedCards[seatID]!.map((rank, index) => (
              <CardTile key={index} rank={rank} compact />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
