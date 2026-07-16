import { useTranslation } from 'react-i18next';
import { playerLabel } from './playerLabel.js';
import styles from './HandCountBadges.module.css';

export interface HandCountBadgesProps {
  activeSeatIDs: string[];
  /** playerView's public `handCounts` field -- a SIZE per seat, never the
   * hand contents themselves (spec.md AC7). This component must never be
   * given (or read) a `hands` record, so a broken/leaking fixture can't
   * accidentally surface another seat's cards through it. */
  handCounts: Record<string, number>;
  playerNames?: Record<string, string>;
}

/**
 * Every seated player's hand count -- visible to every viewer, seated or
 * spectator, identically (spec.md story 4/7). Mirrors The Mind's
 * PlayerStatusList in shape/intent, sourced purely from `handCounts`
 * rather than deriving a length from `hands` itself.
 */
export function HandCountBadges({ activeSeatIDs, handCounts, playerNames }: HandCountBadgesProps) {
  const { t } = useTranslation();
  return (
    <ul className={styles.list} aria-label={t('regicide.handCounts.title')}>
      {activeSeatIDs.map((seatID) => (
        <li key={seatID}>
          {playerLabel(seatID, playerNames, t)}:{' '}
          {t('regicide.handCounts.cardsLeft', { count: handCounts[seatID] ?? 0 })}
        </li>
      ))}
    </ul>
  );
}
