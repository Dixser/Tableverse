import { useTranslation } from 'react-i18next';
import type { RoundConfirmState } from '../../roundConfirm.js';
import { enemyAttack, enemyHealth, type FaceCard } from './deck.js';
import { CardTile } from './CardTile.js';
import { resolveRoundConfirmDisplay } from './roundConfirmDisplay.js';
import styles from './EnemyPanel.module.css';

export interface EnemyPanelProps {
  /** Null only for the instant between the 12th defeat and match end --
   * GameoverBanner takes over by then, so this panel simply renders
   * nothing enemy-specific for that instant. */
  currentEnemy: FaceCard | null;
  /** 1-indexed position in the 12-card Castle deck (playerView's own
   * `enemyNumber`). */
  enemyNumber: number;
  damageDealt: number;
  /** Raw, immunity-unaware cumulative total -- shown as its own indicator
   * (spec.md AC6), and also what "damage you'll take" is derived from
   * (attack - shield, floored at 0), matching AC6's own literal formula
   * rather than a second, immunity-aware number the board can't derive
   * without duplicating enterStep4's own isImmune check. */
  spadeShieldTotal: number;
  tavernCount: number;
  discardCount: number;
  roundConfirm: RoundConfirmState | null;
  hostPlayerID: string | null;
  playerID: string | null;
  playerNames?: Record<string, string>;
  onConfirm: () => void;
  onForceAdvance: () => void;
}

/**
 * The current enemy's stats (AC6), deck/discard counts (AC9), and --
 * uniquely for this game -- the round-defeat confirmation panel (AC9a),
 * since story 6 wants the frozen enemy's final state shown alongside the
 * confirm controls in one place. See spec/features/023-regicide-board/
 * plan.md for why this duplicates (rather than reuses) GameMount's
 * generic RoundConfirmBanner.
 */
export function EnemyPanel({
  currentEnemy,
  enemyNumber,
  damageDealt,
  spadeShieldTotal,
  tavernCount,
  discardCount,
  roundConfirm,
  hostPlayerID,
  playerID,
  playerNames,
  onConfirm,
  onForceAdvance,
}: EnemyPanelProps) {
  const { t } = useTranslation();
  const confirmDisplay = resolveRoundConfirmDisplay(roundConfirm, hostPlayerID, playerID, playerNames, t);

  const attack = currentEnemy ? enemyAttack(currentEnemy) : 0;
  const health = currentEnemy ? enemyHealth(currentEnemy) : 0;
  const remaining = Math.max(0, health - damageDealt);
  const damageYouWillTake = Math.max(0, attack - spadeShieldTotal);

  return (
    <div className={styles.panel} aria-label={t('regicide.enemy.title')}>
      {currentEnemy && (
        <div className={styles.enemy}>
          {confirmDisplay && <span className={styles.badge}>{t('regicide.roundConfirm.defeatedBadge')}</span>}
          <CardTile card={currentEnemy} />
          <span>{t('regicide.enemy.number', { number: enemyNumber })}</span>
          <span>{t('regicide.enemy.attack', { value: attack })}</span>
          <span>{t('regicide.enemy.health', { remaining, max: health })}</span>
          <span>{t('regicide.enemy.damageDealt', { value: damageDealt })}</span>
          <span>{t('regicide.enemy.shieldTotal', { value: spadeShieldTotal })}</span>
          <span>{t('regicide.enemy.damageYouWillTake', { value: damageYouWillTake })}</span>
        </div>
      )}

      <div className={styles.decks}>
        <span>{t('regicide.decks.tavernCount', { count: tavernCount })}</span>
        <span>{t('regicide.decks.discardCount', { count: discardCount })}</span>
      </div>

      {confirmDisplay && (
        <div className={styles.roundConfirm} role="status">
          <p className={styles.title}>{t('roundConfirm.title')}</p>
          <p>{t('roundConfirm.progress', { confirmed: confirmDisplay.confirmedCount, total: confirmDisplay.totalCount })}</p>
          <div className={styles.actions}>
            {playerID != null && (
              <button type="button" disabled={!confirmDisplay.canConfirm} onClick={onConfirm}>
                {t('roundConfirm.confirmButton')}
              </button>
            )}
            {confirmDisplay.canForceAdvance && (
              <button type="button" onClick={onForceAdvance}>
                {t('roundConfirm.forceAdvanceButton')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
