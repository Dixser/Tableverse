import { useTranslation } from 'react-i18next';
import { playerLabel } from './playerLabel.js';
import { MAX_HAND_SIZE } from './deck.js';
import styles from './PlayerStatusList.module.css';

export interface PlayerStatusListProps {
  activeSeatIDs: string[];
  /** playerView's public `handCounts` field -- a SIZE per seat, never the
   * hand contents themselves (spec.md AC7). This component must never be
   * given (or read) a `hands` record, so a broken/leaking fixture can't
   * accidentally surface another seat's cards through it. */
  handCounts: Record<string, number>;
  playerID: string | null;
  playerNames?: Record<string, string>;
}

/**
 * Every seated player's hand SIZE (never values) -- spec.md story 4/7.
 * Mirrors The Mind's own PlayerStatusList: one face-down card slot per
 * held card, rather than a bare "N cards" count, so nothing about a
 * card's VALUE is ever implied. Unlike The Mind, Regicide has a fixed max
 * hand size per seated player count (deck.ts's MAX_HAND_SIZE), so the
 * remaining, not-yet-drawn capacity up to that max is also shown, as a
 * dimmed placeholder slot -- e.g. a seat holding 5 of a 7-card max shows
 * 5 filled slots + 2 dimmed ones, not just "5".
 */
export function PlayerStatusList({ activeSeatIDs, handCounts, playerID, playerNames }: PlayerStatusListProps) {
  const { t } = useTranslation();
  const maxHandSize = MAX_HAND_SIZE[activeSeatIDs.length] ?? 0;
  return (
    <ul className={styles.list} aria-label={t('regicide.handCounts.title')}>
      {activeSeatIDs.map((seatID) => {
        const count = handCounts[seatID] ?? 0;
        const empty = Math.max(0, maxHandSize - count);
        return (
          <li key={seatID} className={seatID === playerID ? styles.self : undefined}>
            <span className={styles.name}>{playerLabel(seatID, playerNames, t)}</span>
            <span
              className={styles.cards}
              aria-label={t('regicide.handCounts.cardsLeft', { count })}
              title={t('regicide.handCounts.cardsLeft', { count })}
            >
              {Array.from({ length: count }, (_, index) => (
                <span key={`held-${index}`} className={styles.cardHeld} aria-hidden="true" />
              ))}
              {Array.from({ length: empty }, (_, index) => (
                <span key={`empty-${index}`} className={styles.cardEmpty} aria-hidden="true" />
              ))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
