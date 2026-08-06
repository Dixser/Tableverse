import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './HandSortControls.module.css';

export interface HandSortPreset<TCard> {
  /** Stable key, for React and for tests. */
  id: string;
  /** i18n key in the shared `handSort.*` namespace, e.g. 'handSort.bySuit'. */
  labelKey: string;
  comparator: (a: TCard, b: TCard) => number;
}

export interface HandSortControlsProps<TCard> {
  presets: HandSortPreset<TCard>[];
  onSort: (comparator: (a: TCard, b: TCard) => number) => void;
  onReset: () => void;
  /** Disables Reset while the hand is still in raw dealt order. */
  isCustomised: boolean;
  /** Renders nothing below 2 cards -- there is nothing to arrange. */
  cardCount: number;
}

/**
 * The one-click half of feature 031's hand arrangement, shared by all three
 * card games (the drag half is SortableCardSlot).
 *
 * Never disabled by turn state. Organising your hand while you wait for your
 * turn is the main thing players want this for, so the only gates are "you
 * have a hand" (the board doesn't render this for a spectator) and "there is
 * more than one card in it".
 */
export function HandSortControls<TCard>({
  presets,
  onSort,
  onReset,
  isCustomised,
  cardCount,
}: HandSortControlsProps<TCard>) {
  const { t } = useTranslation();
  // A sort is otherwise completely silent to a screen reader: the cards
  // rearrange visually with no focus change and no announcement.
  const [announcement, setAnnouncement] = useState('');

  if (cardCount < 2) return null;

  return (
    <div className={styles.controls} role="group" aria-label={t('handSort.groupAriaLabel')}>
      {presets.map((preset) => (
        <button
          key={preset.id}
          type="button"
          className={styles.button}
          onClick={() => {
            onSort(preset.comparator);
            setAnnouncement(t('handSort.applied', { preset: t(preset.labelKey) }));
          }}
        >
          {t(preset.labelKey)}
        </button>
      ))}
      <button
        type="button"
        className={styles.button}
        onClick={() => {
          onReset();
          setAnnouncement(t('handSort.applied', { preset: t('handSort.reset') }));
        }}
        disabled={!isCustomised}
      >
        {t('handSort.reset')}
      </button>
      <span className={styles.srOnly} role="status" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}
