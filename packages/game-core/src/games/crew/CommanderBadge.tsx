import { useTranslation } from 'react-i18next';
import { playerLabel } from './playerLabel.js';
import styles from './CommanderBadge.module.css';

export interface CommanderBadgeProps {
  commanderSeatID: string;
  playerNames?: Record<string, string>;
}

/** Whoever held the rocket 4 after dealing -- rulebook's commander, shown as a persistent badge. */
export function CommanderBadge({ commanderSeatID, playerNames }: CommanderBadgeProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.badge}>{t('crew.commander', { name: playerLabel(commanderSeatID, playerNames, t) })}</div>
  );
}
