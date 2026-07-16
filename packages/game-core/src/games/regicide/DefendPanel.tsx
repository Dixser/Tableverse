import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cardValue, type Card } from './deck.js';
import { CardTile } from './CardTile.js';
import styles from './DefendPanel.module.css';

export interface DefendPanelProps {
  hand: Card[];
  requiredTotal: number;
  onDiscard: (cardIDs: string[]) => void;
}

/**
 * The `defend` stage's discard UI -- required for the game to be
 * playable at all whenever Step 4 triggers, even though no numbered
 * acceptance criterion in spec.md enumerates it (see plan.md). Same
 * toggle-then-submit shape as HandView/BoardComponent's own Play flow,
 * but self-contained: `discardCards` has no combo-shape legality check
 * (only a running-total minimum), so there's no per-card disabling to
 * compute, and this owns its own selection state rather than sharing
 * BoardComponent's draft (Play/Yield/HandView aren't shown at all while
 * this stage is active -- see BoardComponent.tsx).
 */
export function DefendPanel({ hand, requiredTotal, onDiscard }: DefendPanelProps) {
  const { t } = useTranslation();
  const [selectedCardIDs, setSelectedCardIDs] = useState<string[]>([]);

  function toggle(cardID: string) {
    setSelectedCardIDs((prev) =>
      prev.includes(cardID) ? prev.filter((id) => id !== cardID) : [...prev, cardID],
    );
  }

  const selectedTotal = hand
    .filter((c) => selectedCardIDs.includes(c.id))
    .reduce((sum, c) => sum + cardValue(c), 0);
  const canDiscard = selectedTotal >= requiredTotal;

  return (
    <div className={styles.panel} role="group" aria-label={t('regicide.defend.title', { required: requiredTotal })}>
      <p>{t('regicide.defend.title', { required: requiredTotal })}</p>
      <p>{t('regicide.defend.progress', { selected: selectedTotal, required: requiredTotal })}</p>
      <div className={styles.hand}>
        {hand.map((card) => (
          <CardTile
            key={card.id}
            card={card}
            selected={selectedCardIDs.includes(card.id)}
            onClick={() => toggle(card.id)}
          />
        ))}
      </div>
      <button
        type="button"
        className={styles.discardButton}
        disabled={!canDiscard}
        onClick={() => {
          onDiscard(selectedCardIDs);
          setSelectedCardIDs([]);
        }}
      >
        {t('regicide.discardButton')}
      </button>
    </div>
  );
}
