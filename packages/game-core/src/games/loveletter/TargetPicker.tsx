import { useTranslation } from 'react-i18next';
import { playerLabel } from './playerLabel.js';
import styles from './TargetPicker.module.css';

export interface TargetPickerProps {
  eligiblePlayerIDs: string[];
  selfID: string;
  onSelect: (playerID: string) => void;
  onCancel: () => void;
  /** playerID -> username, for a real name instead of "Seat N" where known. */
  playerNames?: Record<string, string>;
}

/**
 * Lists eligibleTargets' output for a just-clicked targeted card (Guard,
 * Priest, Baron, Prince, King) -- spec.md AC2. For the Prince, `selfID`
 * may itself appear in `eligiblePlayerIDs` (story 6); every other card's
 * caller never includes it there in the first place.
 */
export function TargetPicker({
  eligiblePlayerIDs,
  selfID,
  onSelect,
  onCancel,
  playerNames,
}: TargetPickerProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.picker} role="group" aria-label={t('loveLetter.target.pickTitle')}>
      <p>{t('loveLetter.target.pickTitle')}</p>
      {eligiblePlayerIDs.map((playerID) => (
        <button key={playerID} type="button" onClick={() => onSelect(playerID)}>
          {playerID === selfID
            ? t('loveLetter.target.self')
            : playerLabel(playerID, playerNames, t)}
        </button>
      ))}
      <button type="button" onClick={onCancel}>
        {t('loveLetter.target.cancel')}
      </button>
    </div>
  );
}
