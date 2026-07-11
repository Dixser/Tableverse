import { useTranslation } from 'react-i18next';
import styles from './SeatSwitcher.module.css';

export interface SeatSwitcherProps {
  seatIDs: string[];
  activeSeatID: string | null;
  onSelect: (playerID: string) => void;
}

/**
 * Lets a user controlling multiple seats (multi-seat claiming / solo play)
 * choose which claimed seat's board is currently shown. Never renders more
 * than one seat's state at once -- switching just changes which
 * background Client() feeds GameMount.
 */
export function SeatSwitcher({ seatIDs, activeSeatID, onSelect }: SeatSwitcherProps) {
  const { t } = useTranslation();
  if (seatIDs.length <= 1) return null;
  return (
    <div className={styles.tabs} role="tablist" aria-label={t('seatSwitcher.ariaLabel')}>
      {seatIDs.map((playerID) => (
        <button
          key={playerID}
          type="button"
          role="tab"
          className={playerID === activeSeatID ? styles.tabActive : styles.tab}
          aria-selected={playerID === activeSeatID}
          onClick={() => onSelect(playerID)}
        >
          {t('seatSwitcher.seatTab', { playerID })}
        </button>
      ))}
    </div>
  );
}
