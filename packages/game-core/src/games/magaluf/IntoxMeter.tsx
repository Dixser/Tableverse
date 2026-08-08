import { useTranslation } from 'react-i18next';
import { limitRange, meterPercent } from './limitScale.js';
import styles from './IntoxMeter.module.css';

export interface IntoxMeterProps {
  intox: number;
  resaca: number;
  day: number;
  limitShift: number;
  /** The real limit, or null while it is still face-down for this viewer. */
  limit: number | null;
}

/**
 * Three values on one bar: where this morning's hangover put you, where you
 * are now, and where the limit sits.
 *
 * The scale comes from `limitScale.ts` and never from `limit`, so the geometry
 * is identical whichever card the day actually drew — see that module for why
 * that matters. While the limit is face-down the bar shows the *band* it could
 * fall in; once known, the band is replaced by a single hard marker.
 */
export function IntoxMeter({ intox, resaca, day, limitShift, limit }: IntoxMeterProps) {
  const { t } = useTranslation();
  const pct = (value: number) => `${meterPercent(value, day, limitShift)}%`;
  const band = limitRange(day, limitShift);
  const over = limit !== null && intox > limit;

  return (
    <div className={styles.meter}>
      <div
        className={styles.track}
        role="img"
        aria-label={t('magaluf.board.meterAria', { intox, resaca })}
      >
        {limit === null ? (
          <div
            className={styles.band}
            data-testid="limit-band"
            style={{ left: pct(band.min), width: `calc(${pct(band.max)} - ${pct(band.min)})` }}
          />
        ) : (
          <div className={styles.marker} data-testid="limit-marker" style={{ left: pct(limit) }} />
        )}
        {resaca > 0 && (
          <div className={styles.resaca} data-testid="resaca-floor" style={{ width: pct(resaca) }} />
        )}
        <div
          className={over ? styles.fillOver : styles.fill}
          data-testid="intox-fill"
          style={{ width: pct(intox) }}
        />
      </div>
      <div className={styles.labels}>
        <span>
          {t('magaluf.board.intoxication')} <b>{intox}</b>
          {resaca > 0 && (
            <span className={styles.resacaLabel}>
              {' '}
              · {t('magaluf.board.resaca')} {resaca}
            </span>
          )}
        </span>
        {limit !== null && (
          <span data-testid="limit-value">
            {t('magaluf.board.limit')} <b>{limit}</b>
          </span>
        )}
      </div>
    </div>
  );
}
