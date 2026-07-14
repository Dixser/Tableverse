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
 * own hand contents.
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
      {activeSeatIDs.map((seatID) => (
        <li key={seatID} className={seatID === playerID ? styles.self : undefined}>
          <span>{playerLabel(seatID, playerNames, t)}</span>
          <span>{t('theMind.playerStatus.cardsLeft', { count: handCounts[seatID] ?? 0 })}</span>
        </li>
      ))}
    </ul>
  );
}
