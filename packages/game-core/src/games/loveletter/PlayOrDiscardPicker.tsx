import { useTranslation } from 'react-i18next';
import type { CardRank } from './deck.js';
import { CardTile } from './CardTile.js';
import styles from './TargetPicker.module.css';

export interface PlayOrDiscardPickerProps {
  cardRank: CardRank;
  onPlay: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

/**
 * The first step after clicking any hand card -- house rule (not part of
 * the official rulebook): a card may be played for its full effect, or
 * discarded, revealed publicly the same way but with the effect skipped
 * entirely. Shown for every rank uniformly, even ones where play/discard
 * behave identically server-side (Spy, Countess), for a single consistent
 * interaction rather than special-casing which ranks "need" the choice.
 */
export function PlayOrDiscardPicker({
  cardRank,
  onPlay,
  onDiscard,
  onCancel,
}: PlayOrDiscardPickerProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.picker} role="group" aria-label={t('loveLetter.playOrDiscard.title')}>
      <p>{t('loveLetter.playOrDiscard.title')}</p>
      <CardTile rank={cardRank} />
      <button type="button" onClick={onPlay}>
        {t('loveLetter.playOrDiscard.play')}
      </button>
      <button type="button" onClick={onDiscard}>
        {t('loveLetter.playOrDiscard.discard')}
      </button>
      <button type="button" onClick={onCancel}>
        {t('loveLetter.target.cancel')}
      </button>
    </div>
  );
}
