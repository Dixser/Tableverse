import { useTranslation } from 'react-i18next';
import { DAY_IDS, PHASE_IDS } from './cards.js';
import { PHASE_RULES } from './constants.js';
import type { LimitBand } from './limitScale.js';
import styles from './PhaseHeader.module.css';

export interface PhaseHeaderProps {
  day: number;
  phase: number;
  dayMultiplier: number;
  /** The public band the limit is drawn from. Never the drawn limit itself. */
  band: LimitBand;
  /** The real limit, or null while it is still face-down for this viewer. */
  limit: number | null;
}

export function PhaseHeader({ day, phase, dayMultiplier, band, limit }: PhaseHeaderProps) {
  const { t } = useTranslation();
  // The two numbers that decide when you may leave and when the venue throws
  // you out. They are printed on the phase table in the rules and were the one
  // thing a player had to remember rather than read.
  const rules = PHASE_RULES[PHASE_IDS[phase] ?? 'tardeo'];

  return (
    <header className={styles.header}>
      <span className={styles.chip}>{t(`magaluf.day.${DAY_IDS[day]}`)}</span>
      {/* One colour per venue, warming through the night, so the phase is
          readable at a glance rather than by reading the word. */}
      <span
        className={`${styles.chip} ${styles.phase}`}
        data-phase={PHASE_IDS[phase]}
        data-testid="phase-chip"
      >
        <span>{t(`magaluf.phase.${PHASE_IDS[phase]}`)}</span>
        <span className={styles.drinks} data-testid="phase-drinks-chip">
          ({t('magaluf.board.phaseDrinks', { min: rules.minDrinks, max: rules.maxDrinks })})
        </span>
      </span>

      {limit === null ? (
        // The band, not the number. Public information either way: the two
        // ends of the band are a visible room setting, and every integer
        // between them is a card.
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
