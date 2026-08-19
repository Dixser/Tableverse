import { useTranslation } from 'react-i18next';
import type { Cierrabares } from './state.js';
import styles from './CierrabaresBanner.module.css';

export interface CierrabaresBannerProps {
  award: Cierrabares;
  winnerName: string;
}

/**
 * Who closed the bar, shown while the table regroups between venues.
 *
 * The rule it announces used to fire mid-phase off lap arithmetic, and the log
 * line was the first anybody knew of it. A bonus worth up to 9 VP should not
 * arrive as a line of history, so it gets the moment the phase boundary was
 * already giving away: `G.cierrabares` is set at closing time and cleared when
 * the next venue opens, which is exactly the window the round-confirm wait
 * holds open. The After has no such wait — it goes to the balcony instead —
 * and the same field simply survives until the next morning, so the banner is
 * still up behind the jump.
 *
 * Nothing renders when the count tied. The award is null in that case and the
 * log carries the explanation, which is the right weight for a non-event.
 */
export function CierrabaresBanner({ award, winnerName }: CierrabaresBannerProps) {
  const { t } = useTranslation();

  return (
    <aside className={styles.banner} data-testid="cierrabares-banner">
      <span className={styles.title}>{t('magaluf.board.cierrabares')}</span>
      <span className={styles.detail}>
        {t('magaluf.board.cierrabaresWon', {
          name: winnerName,
          drinks: award.drinks,
          vp: award.vp,
        })}
      </span>
    </aside>
  );
}
