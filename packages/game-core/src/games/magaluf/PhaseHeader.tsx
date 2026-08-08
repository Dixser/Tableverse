import { useTranslation } from 'react-i18next';
import { DAY_IDS, PHASE_IDS } from './cards.js';
import { limitRange } from './limitScale.js';
import styles from './PhaseHeader.module.css';

export interface PhaseHeaderProps {
  day: number;
  phase: number;
  dayMultiplier: number;
  limitShift: number;
  /** The real limit, or null while it is still face-down for this viewer. */
  limit: number | null;
}

export function PhaseHeader({ day, phase, dayMultiplier, limitShift, limit }: PhaseHeaderProps) {
  const { t } = useTranslation();
  const band = limitRange(day, limitShift);

  return (
    <header className={styles.header}>
      <span className={styles.chip}>{t(`magaluf.day.${DAY_IDS[day]}`)}</span>
      <span className={styles.chip}>{t(`magaluf.phase.${PHASE_IDS[phase]}`)}</span>
      <span className={styles.chip}>
        {t('magaluf.board.dayMultiplier', { multiplier: dayMultiplier })}
      </span>

      {limit === null ? (
        // The band, not the number. Public information either way: the day's
        // deck is fixed and the shift is a visible room setting.
        <span className={styles.limitHidden} data-testid="limit-chip-hidden">
          {t('magaluf.board.limitBetween', { min: band.min, max: band.max })}
        </span>
      ) : (
        <span className={styles.limit} data-testid="limit-chip-known">
          {t('magaluf.board.limit')} <b>{limit}</b>
        </span>
      )}
    </header>
  );
}
