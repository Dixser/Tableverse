import { useTranslation } from 'react-i18next';
import { poolChance } from './balconing.js';
import type { MagalufSettings } from './settings.js';
import type { JumpRecord } from './state.js';
import styles from './BalconyOverlay.module.css';

export interface BalconyOverlayProps {
  jump: JumpRecord;
  jumperName: string;
  settings: MagalufSettings;
  /** From `G.balcony`, so every viewer is on the same beat of the same jump. */
  revealed: boolean;
  /** True when this viewer is the one on the rail. */
  mine: boolean;
  /** True for the host, who alone gets the escape hatch. */
  canSkip: boolean;
  onJump: () => void;
  onContinue: () => void;
  onSkip: () => void;
}

/**
 * The balcony, in two beats: the odds, then the outcome.
 *
 * The engine already rolled — the result is sitting in `G.jumps` before any
 * client renders — so this controls only when the table learns it. Showing the
 * percentage first and the landing second is the entire reason the mechanic is
 * worth having; a number resolving silently into the chat log is not a moment.
 *
 * **Which beat is on screen is `G.balcony`, not local state.** It has to be:
 * when each viewer stepped through the night at their own pace, everyone else
 * could read the whole death toll while the jumpers were still deciding to
 * click. The buttons belong to the jumper for the same reason the reveal is
 * shared — it is their roll to turn over, and everybody else is watching them
 * do it. The waiting line is the same idea EventChoicePanel already applies to
 * a face-up choice card.
 *
 * Which jump is shown, and whether one is shown at all, is the engine's
 * decision, not this component's.
 */
export function BalconyOverlay({
  jump,
  jumperName,
  settings,
  revealed,
  mine,
  canSkip,
  onJump,
  onContinue,
  onSkip,
}: BalconyOverlayProps) {
  const { t } = useTranslation();
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
                the number you went over by. Past `d = die` no roll can do
                that and only the top face clears, so "you need more than 49"
                would read as a death sentence next to a 17% badge. Same rule,
                stated the way it actually applies. */}
            <p className={styles.numbers} data-testid="balcony-target">
              {jump.d >= jump.die
                ? t('magaluf.board.balconyTargetMax', { die: jump.die })
                : t('magaluf.board.balconyTarget', { die: jump.die, over: jump.d })}
            </p>
            {/* What is riding on the roll, not what is already gone: the pool
                is only forfeited by the concrete. */}
            {jump.poolVP > 0 && (
              <p className={styles.lost}>
                {t('magaluf.board.balconyAtRisk', { vp: jump.poolVP })}
              </p>
            )}
            {mine ? (
              <button
                type="button"
                className={styles.jump}
                data-testid="balcony-jump"
                onClick={onJump}
              >
                {t('magaluf.board.balconyJump')}
              </button>
            ) : (
              <p className={styles.waiting} data-testid="balcony-waiting">
                {t('magaluf.board.balconyWaitingJump', { name: jumperName })}
              </p>
            )}
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
            {/* The night itself: banked by a survivor, gone with the drowned. */}
            {jump.survived
              ? jump.bankedVP > 0 && (
                  <p className={styles.numbers} data-testid="balcony-banked">
                    {t('magaluf.board.balconyBanked', { vp: jump.bankedVP })}
                  </p>
                )
              : jump.lostVP > 0 && (
                  <p className={styles.lost} data-testid="balcony-lost">
                    {t('magaluf.board.balconyLost', { vp: jump.lostVP })}
                  </p>
                )}
            {mine ? (
              <button
                type="button"
                className={styles.jump}
                data-testid="balcony-continue"
                onClick={onContinue}
              >
                {t('magaluf.board.balconyContinue')}
              </button>
            ) : (
              <p className={styles.waiting} data-testid="balcony-waiting">
                {t('magaluf.board.balconyWaitingContinue', { name: jumperName })}
              </p>
            )}
          </>
        )}

        {/* Only the host, and only because a jumper who has gone home would
            otherwise hold the table on this balcony indefinitely. */}
        {canSkip && (
          <button type="button" className={styles.skip} data-testid="balcony-skip" onClick={onSkip}>
            {t('magaluf.board.balconySkip')}
          </button>
        )}
      </div>
    </div>
  );
}
