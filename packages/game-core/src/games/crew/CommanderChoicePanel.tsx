import { useTranslation } from 'react-i18next';
import { playerLabel } from './playerLabel.js';
import styles from './CommanderChoicePanel.module.css';

export interface CommanderChoicePanelProps {
  activeSeatIDs: string[];
  commanderSeatID: string;
  /** The seat the commander has already chosen, or null if the choice hasn't been made yet. */
  chosenSeatID: string | null;
  /** True only for the commander's own view, while the choice is still open. */
  canChoose: boolean;
  /** True for every OTHER seat while the commander hasn't chosen yet -- shows a waiting indicator instead of the picker. */
  choicePending: boolean;
  playerNames?: Record<string, string>;
  onChoose: (seatID: string) => void;
  /** Already-translated copy -- plain strings/functions rather than i18n keys, since this component serves several unrelated mechanics (missions 5, 11, 20) without needing to know their translation namespaces. */
  promptText: string;
  statusText: (name: string) => string;
  waitingText: (commanderName: string) => string;
}

/**
 * Generic "the commander publicly picks one other seat for a mission-
 * specific effect" panel -- shared by mission 5's sick crewmate, mission
 * 11's muted crewmate, and mission 20's blind task recipient. Once made,
 * the choice is public state everyone needs to see for the rest of the
 * mission -- rendered as a persistent status label, not tucked away in a
 * picker only the commander ever saw.
 */
export function CommanderChoicePanel({
  activeSeatIDs,
  commanderSeatID,
  chosenSeatID,
  canChoose,
  choicePending,
  playerNames,
  onChoose,
  promptText,
  statusText,
  waitingText,
}: CommanderChoicePanelProps) {
  const { t } = useTranslation();

  if (chosenSeatID !== null) {
    return <div className={styles.panel}>{statusText(playerLabel(chosenSeatID, playerNames, t))}</div>;
  }

  if (canChoose) {
    return (
      <div className={styles.panel}>
        <p className={styles.prompt}>{promptText}</p>
        <div className={styles.choices}>
          {activeSeatIDs
            .filter((seatID) => seatID !== commanderSeatID)
            .map((seatID) => (
              <button key={seatID} type="button" onClick={() => onChoose(seatID)}>
                {playerLabel(seatID, playerNames, t)}
              </button>
            ))}
        </div>
      </div>
    );
  }

  if (choicePending) {
    return <div className={styles.panel}>{waitingText(playerLabel(commanderSeatID, playerNames, t))}</div>;
  }

  return null;
}
