import type { TFunction } from 'i18next';
import type { RoundConfirmState } from '../../roundConfirm.js';
import { playerLabel } from './playerLabel.js';

export interface RoundConfirmDisplay {
  confirmedCount: number;
  totalCount: number;
  /** Display names of seats still waited on. */
  pendingNames: string[];
  /** True if the viewer's own seat is one of the still-pending ones. */
  canConfirm: boolean;
  /** True if the viewer's own seat is the match's host seat and at least
   * one seat (possibly including their own) is still pending. */
  canForceAdvance: boolean;
}

/**
 * Resolves G.roundConfirm/G.hostPlayerID + the viewer's perspective into
 * display state for EnemyPanel's own round-defeat confirmation panel
 * (spec.md AC9a). Mirrors packages/client/src/gameMount/
 * RoundConfirmBanner.tsx's resolveRoundConfirmDisplay -- reimplemented
 * here rather than imported, since `game-core` cannot depend on `client`
 * (the reverse is true: client depends on game-core). Typed directly
 * against RoundConfirmState/string, not `unknown`, since RegicideView's
 * own fields already carry that exact shape -- no defensive re-parsing
 * needed the way the platform-wide banner needs for an arbitrary game.
 */
export function resolveRoundConfirmDisplay(
  roundConfirm: RoundConfirmState | null,
  hostPlayerID: string | null,
  playerID: string | null,
  playerNames: Record<string, string> | undefined,
  t: TFunction,
): RoundConfirmDisplay | null {
  if (!roundConfirm) return null;
  const stillPending = roundConfirm.pendingSeatIDs.filter(
    (id) => !roundConfirm.confirmedSeatIDs.includes(id),
  );
  return {
    confirmedCount: roundConfirm.confirmedSeatIDs.length,
    totalCount: roundConfirm.pendingSeatIDs.length,
    pendingNames: stillPending.map((id) => playerLabel(id, playerNames, t)),
    canConfirm: playerID !== null && stillPending.includes(playerID),
    canForceAdvance:
      playerID !== null && hostPlayerID !== null && playerID === hostPlayerID && stillPending.length > 0,
  };
}
