import { useTranslation } from 'react-i18next';
import type { TheMindShurikenVote } from './gameDef.js';
import { playerLabel } from './playerLabel.js';
import styles from './ShurikenPanel.module.css';

export interface ShurikenPanelProps {
  stars: number;
  activeSeatIDs: string[];
  playerID: string | null;
  vote: TheMindShurikenVote | null;
  playerNames?: Record<string, string>;
  onPropose: () => void;
  onVote: (agree: boolean) => void;
  onCancel: () => void;
}

/**
 * Propose/vote UI for a shuriken -- spec.md story 4. With no vote pending,
 * this is just a propose button (disabled with no star available or no
 * seat to act as). Once a vote is pending, every active seat's yes/no
 * status is shown live, and a not-yet-voted seat gets agree/decline
 * controls; the original proposer alone may cancel it outright.
 */
export function ShurikenPanel({
  stars,
  activeSeatIDs,
  playerID,
  vote,
  playerNames,
  onPropose,
  onVote,
  onCancel,
}: ShurikenPanelProps) {
  const { t } = useTranslation();

  if (!vote) {
    return (
      <div className={styles.panel}>
        <button type="button" onClick={onPropose} disabled={playerID == null || stars <= 0}>
          {t('theMind.shuriken.propose', { count: stars })}
        </button>
      </div>
    );
  }

  const hasVoted = playerID != null && vote.votes[playerID] === true;
  const isProposer = playerID === vote.proposerID;

  return (
    <div className={styles.panel} role="group" aria-label={t('theMind.shuriken.voteTitle')}>
      <p>
        {t('theMind.shuriken.voteProposedBy', {
          proposer: playerLabel(vote.proposerID, playerNames, t),
        })}
      </p>
      <ul className={styles.votes}>
        {activeSeatIDs.map((seatID) => (
          <li key={seatID}>
            {playerLabel(seatID, playerNames, t)}:{' '}
            {vote.votes[seatID] ? t('theMind.shuriken.agreed') : t('theMind.shuriken.waiting')}
          </li>
        ))}
      </ul>
      {playerID != null && !hasVoted && (
        <div className={styles.actions}>
          <button type="button" onClick={() => onVote(true)}>
            {t('theMind.shuriken.agree')}
          </button>
          <button type="button" onClick={() => onVote(false)}>
            {t('theMind.shuriken.decline')}
          </button>
        </div>
      )}
      {isProposer && (
        <button type="button" onClick={onCancel}>
          {t('theMind.shuriken.cancel')}
        </button>
      )}
    </div>
  );
}
