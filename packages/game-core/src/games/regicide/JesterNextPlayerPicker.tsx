import { useTranslation } from 'react-i18next';
import { playerLabel } from './playerLabel.js';
import styles from './JesterNextPlayerPicker.module.css';

export interface JesterNextPlayerPickerProps {
  /** Every other currently seated player -- the acting seat itself is
   * never included (story 5: "which OTHER seated player takes the next
   * turn"). */
  eligiblePlayerIDs: string[];
  onSelect: (playerID: string) => void;
  /** Backs out to the idle draft state -- the Jester itself stays
   * selected in the hand, same "cancel returns to the previous step,
   * doesn't touch G" convention as Love Letter's TargetPicker. */
  onCancel: () => void;
  playerNames?: Record<string, string>;
}

/**
 * Lists seated players for the Jester's next-player choice (spec.md
 * story 5 / AC8). Only ever rendered for the acting seat's own client --
 * the choice must be finalized locally before `playCards` is even called
 * (its `jesterNextPlayerID` param is validated synchronously inside the
 * same move), so no other viewer can see this picker open. Mirrors Love
 * Letter's TargetPicker.
 */
export function JesterNextPlayerPicker({
  eligiblePlayerIDs,
  onSelect,
  onCancel,
  playerNames,
}: JesterNextPlayerPickerProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.picker} role="group" aria-label={t('regicide.jester.pickTitle')}>
      <p>{t('regicide.jester.pickTitle')}</p>
      {eligiblePlayerIDs.map((playerID) => (
        <button key={playerID} type="button" onClick={() => onSelect(playerID)}>
          {playerLabel(playerID, playerNames, t)}
        </button>
      ))}
      <button type="button" onClick={onCancel}>
        {t('regicide.jester.cancel')}
      </button>
    </div>
  );
}
