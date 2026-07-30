import { useTranslation } from 'react-i18next';
import { playerLabel } from './playerLabel.js';
import styles from './PlayerStatusList.module.css';

export interface PlayerStatusListProps {
  activeSeatIDs: string[];
  /** playerView's public `handCounts` field -- a SIZE per seat, never the hand contents themselves. */
  handCounts: Record<string, number>;
  playerID: string | null;
  playerNames?: Record<string, string>;
  /** ctx.currentPlayer -- whose seat gets the active-turn highlight. */
  currentPlayerID: string;
}

/**
 * Every active seat, in turn order, with the current seat's name colored
 * (same `.active .name { color: var(--color-accent) }` convention as
 * Regicide's own PlayerStatusList) -- replaces a single "X's turn" sentence
 * so every seat's hand size is visible at a glance too, not just whoever's
 * up. No fixed max hand size to show empty capacity against (unlike
 * Regicide, Cahoots' hand size just fluctuates as the draw pile depletes),
 * so each seat's count renders as one face-down card-back icon per held
 * card, same visual language as The Mind's own PlayerStatusList.
 */
export function PlayerStatusList({
  activeSeatIDs,
  handCounts,
  playerID,
  playerNames,
  currentPlayerID,
}: PlayerStatusListProps) {
  const { t } = useTranslation();
  return (
    <ul className={styles.list} aria-label={t('cahoots.playerStatus.title')}>
      {activeSeatIDs.map((seatID) => {
        const count = handCounts[seatID] ?? 0;
        const isActive = seatID === currentPlayerID;
        const className = [seatID === playerID ? styles.self : null, isActive ? styles.active : null]
          .filter(Boolean)
          .join(' ');
        return (
          <li key={seatID} className={className || undefined}>
            <span className={styles.name}>{playerLabel(seatID, playerNames, t)}</span>
            <span
              className={styles.cardBacks}
              aria-label={t('cahoots.playerStatus.cardsLeft', { count })}
              title={t('cahoots.playerStatus.cardsLeft', { count })}
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
