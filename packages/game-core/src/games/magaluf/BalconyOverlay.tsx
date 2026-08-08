import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { poolChance } from './balconing.js';
import type { MagalufSettings } from './settings.js';
import type { JumpRecord } from './state.js';
import styles from './BalconyOverlay.module.css';

export interface BalconyOverlayProps {
  jump: JumpRecord;
  jumperName: string;
  settings: MagalufSettings;
  onAdvance: () => void;
  onSkip: () => void;
}

/**
 * The balcony, in two beats: the odds, then the outcome.
 *
 * The engine already rolled — the result is sitting in `G.jumps` before any
 * client renders — so this controls only when the viewer learns it. Showing
 * the percentage first and the landing second is the entire reason the
 * mechanic is worth having; a number resolving silently into the chat log is
 * not a moment.
 *
 * Which jump is shown, and whether one is shown at all, is `useJumpQueue`'s
 * decision, not this component's.
 */
export function BalconyOverlay({
  jump,
  jumperName,
  settings,
  onAdvance,
  onSkip,
}: BalconyOverlayProps) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  const percent = Math.round(poolChance(jump.d, settings) * 100);

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" data-testid="balcony-overlay">
      <div className={styles.box}>
        <h2 className={styles.title}>{t('magaluf.board.balconyTitle')}</h2>

        {!revealed ? (
          <>
            <p className={styles.body}>
              {t('magaluf.board.balconyBody', { name: jumperName, over: jump.d })}
            </p>
            <p className={styles.numbers}>
              {t('magaluf.board.balconyNumbers', {
                intox: jump.limit + jump.d,
                limit: jump.limit,
              })}
            </p>
            <p className={styles.odds} data-testid="balcony-odds">
              {t('magaluf.board.balconyOdds', { percent })}
            </p>
            {/* The rule, spelled out, because it is the whole tension: beat
                the number you went over by. */}
            <p className={styles.numbers} data-testid="balcony-target">
              {t('magaluf.board.balconyTarget', { die: jump.die, over: jump.d })}
            </p>
            {jump.lostVP > 0 && (
              <p className={styles.lost}>
                {t('magaluf.board.balconyLost', { vp: jump.lostVP })}
              </p>
            )}
            <button
              type="button"
              className={styles.jump}
              data-testid="balcony-jump"
              onClick={() => setRevealed(true)}
            >
              {t('magaluf.board.balconyJump')}
            </button>
          </>
        ) : (
          <>
            <p className={styles.odds} data-testid="balcony-roll">
              {t('magaluf.board.balconyRolled', { roll: jump.roll, die: jump.die })}
            </p>
            <p
              className={jump.survived ? styles.pool : styles.concrete}
              data-testid="balcony-outcome"
            >
              {t(jump.survived ? 'magaluf.board.balconyPool' : 'magaluf.board.balconyConcrete')}
            </p>
            <p className={styles.body}>
              {jump.survived
                ? t('magaluf.board.balconyPoolBody', { name: jumperName, vp: jump.legendVP })
                : t('magaluf.board.balconyConcreteBody', { name: jumperName })}
            </p>
            <button
              type="button"
              className={styles.jump}
              data-testid="balcony-continue"
              onClick={() => {
                setRevealed(false);
                onAdvance();
              }}
            >
              {t('magaluf.board.balconyContinue')}
            </button>
          </>
        )}

        <button type="button" className={styles.skip} data-testid="balcony-skip" onClick={onSkip}>
          {t('magaluf.board.balconySkip')}
        </button>
      </div>
    </div>
  );
}
