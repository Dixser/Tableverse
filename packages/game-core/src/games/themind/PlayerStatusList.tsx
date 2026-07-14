import { useTranslation } from 'react-i18next';
import { playerLabel } from './playerLabel.js';
import styles from './PlayerStatusList.module.css';

export interface PlayerStatusListProps {
  activeSeatIDs: string[];
  /** playerID -> hand size. Public -- never card values. */
  handCounts: Record<string, number>;
  playerID: string | null;
  playerNames?: Record<string, string>;
}

/**
 * Every active seat's hand SIZE (never values) -- spec.md story 2. Always
 * visible to every viewer, seated or spectator, unlike the acting player's
 * own hand contents. Rendered as one face-down card icon per held card
 * (looped, no digit) rather than a "Cards left: N" number, so nothing
 * about a card's VALUE is ever implied by the count's presentation either.
 */
export function PlayerStatusList({
  activeSeatIDs,
  handCounts,
  playerID,
  playerNames,
}: PlayerStatusListProps) {
  const { t } = useTranslation();
  return (
    <ul className={styles.list} aria-label={t('theMind.playerStatus.title')}>
      {activeSeatIDs.map((seatID) => {
        const count = handCounts[seatID] ?? 0;
        return (
          <li key={seatID} className={seatID === playerID ? styles.self : undefined}>
            <span>{playerLabel(seatID, playerNames, t)}</span>
            <span
              className={styles.cardBacks}
              aria-label={t('theMind.playerStatus.cardsLeft', { count })}
              title={t('theMind.playerStatus.cardsLeft', { count })}
            >
              {Array.from({ length: count }, (_, index) => (
                <span key={index} className={styles.cardBack} aria-hidden="true" />
              ))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
