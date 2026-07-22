import { useTranslation } from 'react-i18next';
import { findTaskOrderRule, taskOrderChevronRank, type Task } from './constraints.js';
import type { LevelConstraint } from './levels.js';
import { parseCardId } from './deck.js';
import { CardTile } from './CardTile.js';
import { TaskOrderToken } from './TaskOrderToken.js';
import { playerLabel } from './playerLabel.js';
import styles from './TaskBoard.module.css';

export interface TaskBoardProps {
  tasks: Task[];
  activeSeatIDs: string[];
  playerNames?: Record<string, string>;
  /** This mission's constraints -- only `taskOrder` ones are read, to render each tokened task's order token above its card. */
  constraints?: LevelConstraint[];
}

/**
 * Every drafted task, grouped by owner -- fully public per the rulebook
 * (task cards are laid face-up and stay visible to the whole crew once
 * assigned). Renders nothing extra for a 0-task, constraint-only mission
 * beyond the empty-state message.
 */
export function TaskBoard({ tasks, activeSeatIDs, playerNames, constraints = [] }: TaskBoardProps) {
  const { t } = useTranslation();
  if (tasks.length === 0) {
    return <div className={styles.board}>{t('crew.tasks.none')}</div>;
  }
  return (
    <div className={styles.board}>
      <h3 className={styles.title}>{t('crew.tasks.title')}</h3>
      <ul className={styles.list}>
        {activeSeatIDs
          .map((seatID) => ({ seatID, owned: tasks.filter((t) => t.ownerSeatID === seatID) }))
          .filter(({ owned }) => owned.length > 0)
          .map(({ seatID, owned }) => (
            <li key={seatID} className={styles.row}>
              <span className={styles.name}>{playerLabel(seatID, playerNames, t)}</span>
              <span className={styles.chips}>
                {owned.map((task) => {
                  const orderRule = findTaskOrderRule(constraints, task.draftIndex);
                  const chevronRank =
                    orderRule?.type === 'before' || orderRule?.type === 'after'
                      ? taskOrderChevronRank(constraints, task.draftIndex)
                      : undefined;
                  return (
                    <span key={task.taskCardId} className={styles.chip}>
                      {orderRule && <TaskOrderToken rule={orderRule} chevronRank={chevronRank} />}
                      <span
                        className={task.fulfilled ? styles.chipFulfilled : styles.chipPending}
                        title={task.fulfilled ? t('crew.tasks.fulfilled') : t('crew.tasks.pending')}
                      >
                        <CardTile card={parseCardId(task.targetCardId)} compact />
                      </span>
                    </span>
                  );
                })}
              </span>
            </li>
          ))}
      </ul>
    </div>
  );
}
