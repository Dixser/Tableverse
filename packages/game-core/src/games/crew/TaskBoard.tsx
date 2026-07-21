import { useTranslation } from 'react-i18next';
import type { Task } from './constraints.js';
import { parseCardId } from './deck.js';
import { CardTile } from './CardTile.js';
import { playerLabel } from './playerLabel.js';
import styles from './TaskBoard.module.css';

export interface TaskBoardProps {
  tasks: Task[];
  activeSeatIDs: string[];
  playerNames?: Record<string, string>;
}

/**
 * Every drafted task, grouped by owner -- fully public per the rulebook
 * (task cards are laid face-up and stay visible to the whole crew once
 * assigned). Renders nothing extra for a 0-task, constraint-only mission
 * beyond the empty-state message.
 */
export function TaskBoard({ tasks, activeSeatIDs, playerNames }: TaskBoardProps) {
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
                {owned.map((task) => (
                  <span
                    key={task.taskCardId}
                    className={task.fulfilled ? styles.chipFulfilled : styles.chipPending}
                    title={task.fulfilled ? t('crew.tasks.fulfilled') : t('crew.tasks.pending')}
                  >
                    <CardTile card={parseCardId(task.targetCardId)} compact />
                  </span>
                ))}
              </span>
            </li>
          ))}
      </ul>
    </div>
  );
}
