import { useState } from 'react';
import { cardArt } from './cards.js';
import styles from './CardArt.module.css';

export interface CardArtProps {
  id: string;
  variant: number;
  /** Title of the card, used as the alt text and as the placeholder's label. */
  title: string;
}

/**
 * The picture on one printed card, or a labelled hole where it will go.
 *
 * No artwork ships yet, so in practice every one of these 404s and every card
 * renders the placeholder. That is the intended state, not a bug being
 * tolerated: the placeholder names the exact file it is waiting for, so the
 * art can be dropped into `public/cards/magaluf/` a card at a time and each
 * one lights up on the next reload with no code change.
 *
 * `onError` rather than a build-time manifest because the two halves of this
 * are produced by different people at different times — a manifest would have
 * to be regenerated every time a file landed, and would be wrong in between.
 */
export function CardArt({ id, variant, title }: CardArtProps) {
  const file = cardArt(id, variant);
  const [missing, setMissing] = useState(false);

  if (missing) {
    // Only the filename. The title is rendered directly above this by
    // `GameCard`, and until artwork ships every card is in this state -- a
    // placeholder that repeated the title would print it twice on every card
    // on the board.
    return (
      <div className={styles.placeholder} data-testid={`card-art-missing-${id}-${variant}`}>
        <code className={styles.placeholderFile}>{file}</code>
      </div>
    );
  }

  return (
    <img
      className={styles.art}
      src={`/cards/magaluf/${file}`}
      alt={title}
      data-testid={`card-art-${id}-${variant}`}
      onError={() => setMissing(true)}
    />
  );
}
