import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CardRank } from './deck.js';
import { CardTile } from './CardTile.js';
import styles from './ChancellorPicker.module.css';

export interface ChancellorPickerProps {
  /** G.chancellorDraw[selfID] -- the original held card plus 0-2 fresh draws. */
  candidates: CardRank[];
  /**
   * `returnOrder` is every non-kept candidate index, in the order the
   * player chose for them to return to the bottom of the deck -- see
   * gameDef.ts's chancellorKeep. `returnOrder[0]` ends up deepest.
   */
  onKeep: (keepIndex: number, returnOrder: number[]) => void;
}

/**
 * Not part of spec 015's original plan -- added because the Chancellor
 * (rank 6, Normal edition) has no UI otherwise, which would soft-lock a
 * player's turn the moment they drew one. Mirrors gameDef.ts's own
 * two-move split (playCard opens this choice, chancellorKeep resolves it):
 * no cancel affordance, since the draw has already happened server-side by
 * the time this renders -- one of `candidates` must be kept.
 *
 * Two internal steps when there's a real order to choose (a full 3-card
 * draw): which card to keep, then which of the other two returns to the
 * deck first. With 0 or 1 remaining candidates there's nothing to order,
 * so `onKeep` fires the moment "keep" is chosen.
 */
export function ChancellorPicker({ candidates, onKeep }: ChancellorPickerProps) {
  const { t } = useTranslation();
  const [keepIndex, setKeepIndex] = useState<number | null>(null);

  function handleChooseKeep(index: number) {
    const remaining = candidates.map((_, i) => i).filter((i) => i !== index);
    if (remaining.length <= 1) {
      onKeep(index, remaining); // 0 or 1 other card -- no real order choice.
      return;
    }
    setKeepIndex(index);
  }

  if (keepIndex === null) {
    return (
      <div className={styles.picker} role="group" aria-label={t('loveLetter.chancellor.title')}>
        <p>{t('loveLetter.chancellor.title')}</p>
        <div className={styles.candidates}>
          {candidates.map((rank, index) => (
            <CardTile key={index} rank={rank} onClick={() => handleChooseKeep(index)} />
          ))}
        </div>
      </div>
    );
  }

  const remaining = candidates.map((_, i) => i).filter((i) => i !== keepIndex);
  return (
    <div className={styles.picker} role="group" aria-label={t('loveLetter.chancellor.orderTitle')}>
      <p>{t('loveLetter.chancellor.orderTitle')}</p>
      <div className={styles.candidates}>
        {remaining.map((index) => (
          <CardTile
            key={index}
            rank={candidates[index] as CardRank}
            onClick={() => onKeep(keepIndex, [index, ...remaining.filter((i) => i !== index)])}
          />
        ))}
      </div>
    </div>
  );
}
