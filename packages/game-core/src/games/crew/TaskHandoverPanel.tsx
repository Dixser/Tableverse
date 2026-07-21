import { useTranslation } from 'react-i18next';
import type { Task } from './constraints.js';
import { parseCardId } from './deck.js';
import { CardTile } from './CardTile.js';
import { playerLabel } from './playerLabel.js';
import styles from './TaskHandoverPanel.module.css';

export interface TaskHandoverPanelProps {
  /** This viewer's own drafted tasks -- always unfulfilled here, since handover only opens before trick 1. */
  myTasks: Task[];
  activeSeatIDs: string[];
  playerID: string;
  playerNames?: Record<string, string>;
  onHandover: (taskCardId: string, toSeatID: string) => void;
}

/**
 * The rulebook's 5-player task-handover rule (p.19): unlike every other
 * mission-specific panel on this board, this one isn't commander-gated --
 * ANY crew member holding at least one task may hand one over to another
 * seat, once for the whole mission. Renders nothing for a seat with no
 * tasks of their own to give away; the "already used this mission" and
 * "before trick 1 only" gating is the parent's job (see BoardComponent.tsx),
 * matching how CommunicationPanel's own used/disrupted states work.
 */
export function TaskHandoverPanel({ myTasks, activeSeatIDs, playerID, playerNames, onHandover }: TaskHandoverPanelProps) {
  const { t } = useTranslation();
  if (myTasks.length === 0) return null;
  const otherSeats = activeSeatIDs.filter((seatID) => seatID !== playerID);

  return (
    <div className={styles.panel}>
      <h3 className={styles.title}>{t('crew.handover.title')}</h3>
      <div className={styles.rows}>
        {myTasks.map((task) => (
          <div key={task.taskCardId} className={styles.row}>
            <CardTile card={parseCardId(task.targetCardId)} compact />
            {otherSeats.map((seatID) => (
              <button key={seatID} type="button" onClick={() => onHandover(task.taskCardId, seatID)}>
                {t('crew.handover.giveTo', { name: playerLabel(seatID, playerNames, t) })}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
