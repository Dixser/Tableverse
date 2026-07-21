import { useTranslation } from 'react-i18next';
import { taskTargetCardId, parseCardId, type TaskCard } from './deck.js';
import { CardTile } from './CardTile.js';
import { playerLabel } from './playerLabel.js';
import styles from './TaskDraftPanel.module.css';

export interface TaskDraftPanelProps {
  taskLayout: TaskCard[];
  unclaimedTaskCardIds: string[];
  isActive: boolean;
  currentPlayerID: string;
  playerNames?: Record<string, string>;
  onPick: (taskCardId: string) => void;
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
}: TaskDraftPanelProps) {
  const { t } = useTranslation();
  const unclaimed = taskLayout.filter((t) => unclaimedTaskCardIds.includes(t.id));
  return (
    <div className={styles.panel}>
      <h3 className={styles.title}>
        {t('crew.draft.title', { name: playerLabel(currentPlayerID, playerNames, t) })}
      </h3>
      <div className={styles.pool}>
        {unclaimed.map((task) => (
          <CardTile
            key={task.id}
            card={parseCardId(taskTargetCardId(task))}
            onClick={isActive ? () => onPick(task.id) : undefined}
          />
        ))}
      </div>
    </div>
  );
}
