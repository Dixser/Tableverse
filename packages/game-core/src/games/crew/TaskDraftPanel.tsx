import { useTranslation } from 'react-i18next';
import { taskTargetCardId, parseCardId, type TaskCard } from './deck.js';
import { findTaskOrderRule } from './constraints.js';
import type { LevelConstraint } from './levels.js';
import { CardTile } from './CardTile.js';
import { TaskOrderToken } from './TaskOrderToken.js';
import { playerLabel } from './playerLabel.js';
import styles from './TaskDraftPanel.module.css';

export interface TaskDraftPanelProps {
  taskLayout: TaskCard[];
  unclaimedTaskCardIds: string[];
  isActive: boolean;
  currentPlayerID: string;
  playerNames?: Record<string, string>;
  onPick: (taskCardId: string) => void;
  /** This mission's constraints -- only `taskOrder` ones are read, to render each tokened task's order token above its card. */
  constraints?: LevelConstraint[];
}

/**
 * Mission draft: the commander picks first, then clockwise, one task card
 * at a time, until every face-up task card has been claimed (rulebook
 * pp.8-9). Every task card is publicly visible the whole time -- there's
 * no hidden information in this phase at all.
 */
export function TaskDraftPanel({
  taskLayout,
  unclaimedTaskCardIds,
  isActive,
  currentPlayerID,
  playerNames,
  onPick,
  constraints = [],
}: TaskDraftPanelProps) {
  const { t } = useTranslation();
  // `taskIndex` is the task's fixed position in `taskLayout` (see
  // gameDef.ts's own doc comment on that field) -- must be captured here,
  // before filtering down to the still-unclaimed subset, or a constraint
  // referencing a later, already-claimed task would silently mismatch.
  const unclaimed = taskLayout
    .map((task, taskIndex) => ({ task, taskIndex }))
    .filter(({ task }) => unclaimedTaskCardIds.includes(task.id));
  return (
    <div className={styles.panel}>
      <h3 className={styles.title}>
        {t('crew.draft.title', { name: playerLabel(currentPlayerID, playerNames, t) })}
      </h3>
      <div className={styles.pool}>
        {unclaimed.map(({ task, taskIndex }) => {
          const orderRule = findTaskOrderRule(constraints, taskIndex);
          return (
            <div key={task.id} className={styles.card}>
              {orderRule && <TaskOrderToken rule={orderRule} />}
              <CardTile
                card={parseCardId(taskTargetCardId(task))}
                onClick={isActive ? () => onPick(task.id) : undefined}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
