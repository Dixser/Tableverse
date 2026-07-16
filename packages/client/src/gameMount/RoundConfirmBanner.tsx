import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { nameFor } from './GameoverBanner.js';
import styles from './RoundConfirmBanner.module.css';

export interface RoundConfirmBannerProps {
  /** Raw G.roundConfirm -- unknown, not RoundConfirmState, same defensive
   * posture as GameoverBanner's `gameover` prop (a non-conforming game
   * must not crash the banner). */
  roundConfirm: unknown;
  /** Raw G.hostPlayerID -- unknown for the same reason. */
  hostPlayerID: unknown;
  /** The currently active seat's playerID, or null for a spectator --
   * exactly BoardProps['playerID']. */
  playerID: string | null;
  /** playerID -> display name, from useSeatClients. */
  playerNames: Record<string, string>;
  /** Calls boardProps.moves.confirmRoundReady(). */
  onConfirm: () => void;
  /** Calls boardProps.moves.forceAdvanceRound(). */
  onForceAdvance: () => void;
}

export interface RoundConfirmDisplay {
  confirmedCount: number;
  totalCount: number;
  /** Display names of seats still waited on -- round-result context (who
   * won, what happened) is intentionally not repeated here; it's already
   * visible live in the chat panel's G.log entries alongside the board. */
  pendingNames: string[];
  /** True if the viewer's own seat is one of the still-pending ones. */
  canConfirm: boolean;
  /** True if the viewer's own seat is the match's host seat and at least
   * one seat (possibly including their own) is still pending. */
  canForceAdvance: boolean;
}

/**
 * Resolves G.roundConfirm/G.hostPlayerID + the viewer's perspective into
 * display state. Exported separately from the component so it's
 * unit-testable without mounting React -- same convention as
 * GameoverBanner's resolveGameoverMessage.
 */
export function resolveRoundConfirmDisplay(
  roundConfirm: unknown,
  hostPlayerID: unknown,
  playerID: string | null,
  playerNames: Record<string, string>,
  t: TFunction,
): RoundConfirmDisplay | null {
  if (!roundConfirm || typeof roundConfirm !== 'object') return null;
  const state = roundConfirm as { pendingSeatIDs?: unknown; confirmedSeatIDs?: unknown };
  if (!Array.isArray(state.pendingSeatIDs) || !Array.isArray(state.confirmedSeatIDs)) {
    return null;
  }
  const pendingSeatIDs = state.pendingSeatIDs as string[];
  const confirmedSeatIDs = state.confirmedSeatIDs as string[];
  const stillPending = pendingSeatIDs.filter((id) => !confirmedSeatIDs.includes(id));

  return {
    confirmedCount: confirmedSeatIDs.length,
    totalCount: pendingSeatIDs.length,
    pendingNames: stillPending.map((id) => nameFor(id, playerNames, t)),
    canConfirm: playerID !== null && stillPending.includes(playerID),
    canForceAdvance:
      playerID !== null && typeof hostPlayerID === 'string' && playerID === hostPlayerID && stillPending.length > 0,
  };
}

/**
 * Platform-wide "wait for everyone before the next round" banner, rendered
 * by GameMount (never by a BoardComponent) so any game embedding the
 * shared roundConfirm.ts contract (packages/game-core/src/roundConfirm.ts)
 * gets this UI for free, without reimplementing it -- see
 * spec/021-rematch-round-confirm. Renders nothing while no wait is
 * pending (G.roundConfirm is null). GameMount skips rendering this
 * entirely for a game whose GameModule sets `ownRoundConfirmUI` (e.g.
 * Regicide -- spec/023-regicide-board's EnemyPanel embeds the same
 * controls alongside its own frozen-enemy display instead).
 */
export function RoundConfirmBanner({
  roundConfirm,
  hostPlayerID,
  playerID,
  playerNames,
  onConfirm,
  onForceAdvance,
}: RoundConfirmBannerProps) {
  const { t } = useTranslation();
  const display = resolveRoundConfirmDisplay(roundConfirm, hostPlayerID, playerID, playerNames, t);
  if (display === null) return null;

  return (
    <div className={styles.banner} role="status">
      <p className={styles.title}>{t('roundConfirm.title')}</p>
      <p className={styles.progress}>
        {t('roundConfirm.progress', { confirmed: display.confirmedCount, total: display.totalCount })}
      </p>
      <div className={styles.actions}>
        {display.canConfirm && (
          <button type="button" className={styles.confirmButton} onClick={onConfirm}>
            {t('roundConfirm.confirmButton')}
          </button>
        )}
        {display.canForceAdvance && (
          <button type="button" className={styles.forceAdvanceButton} onClick={onForceAdvance}>
            {t('roundConfirm.forceAdvanceButton')}
          </button>
        )}
      </div>
    </div>
  );
}
