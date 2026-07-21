import { useTranslation } from 'react-i18next';
import { taskTargetCardId, parseCardId, type TaskCard } from './deck.js';
import type { Task } from './constraints.js';
import { isEvenTaskDistribution } from './constraints.js';
import { CardTile } from './CardTile.js';
import { playerLabel } from './playerLabel.js';
import styles from './CommanderDistributionPanel.module.css';

export interface CommanderDistributionPanelProps {
  taskLayout: TaskCard[];
  unclaimedTaskCardIds: string[];
  tasks: Task[];
  activeSeatIDs: string[];
  isCommander: boolean;
  playerNames?: Record<string, string>;
  onDistribute: (seatID: string) => void;
}

/**
 * The rulebook's "Commander's distribution" symbol: task cards are
 * revealed one at a time (always `unclaimedTaskCardIds[0]` -- see
 * gameDef.ts's `distributeTask` doc comment for why that's always the
 * next lowest-`taskIndex` card) and the commander assigns each one to any
 * seat, including themselves -- a different shape from
 * `CommanderChoicePanel`, which is a single persistent choice that always
 * excludes the commander. Seats already tied for the fewest tasks are the
 * only legal targets (`isEvenTaskDistribution`), so ineligible seat
 * buttons are disabled rather than left to fail server-side.
 */
export function CommanderDistributionPanel({
  taskLayout,
  unclaimedTaskCardIds,
  tasks,
  activeSeatIDs,
  isCommander,
  playerNames,
  onDistribute,
}: CommanderDistributionPanelProps) {
  const { t } = useTranslation();
  if (unclaimedTaskCardIds.length === 0) return null;
  const currentTaskCard = taskLayout.find((task) => task.id === unclaimedTaskCardIds[0]);
  if (!currentTaskCard) return null;

  return (
    <div className={styles.panel}>
      <h3 className={styles.title}>
        {t('crew.distribution.title', { count: unclaimedTaskCardIds.length })}
      </h3>
      <CardTile card={parseCardId(taskTargetCardId(currentTaskCard))} compact />
      {isCommander ? (
        <div className={styles.choices}>
          {activeSeatIDs.map((seatID) => (
            <button
              key={seatID}
              type="button"
              disabled={!isEvenTaskDistribution(tasks, activeSeatIDs, seatID)}
              onClick={() => onDistribute(seatID)}
            >
              {playerLabel(seatID, playerNames, t)}
            </button>
          ))}
        </div>
      ) : (
        <p className={styles.none}>{t('crew.distribution.waiting')}</p>
      )}
    </div>
  );
}
