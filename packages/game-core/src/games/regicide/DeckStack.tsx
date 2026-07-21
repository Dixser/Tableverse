import styles from './DeckStack.module.css';

/**
 * Background-layer count for a given pile size -- purely a visual depth
 * cue (no card data involved; Tavern/discard contents are never shown,
 * only their size). Thresholds are arbitrary but monotonic: an empty
 * pile reads as an empty slot, and the stack visibly thickens in three
 * steps as it grows, rather than a single fixed silhouette regardless of
 * whether it holds 1 card or 40.
 */
function stackLayers(count: number): number {
  if (count <= 0) return 0;
  if (count < 10) return 1;
  if (count < 20) return 2;
  return 3;
}

/** One entry per `--deck-color` override in DeckStack.module.css. */
export type DeckStackVariant = 'tavern' | 'castle' | 'discard';

const VARIANT_CLASS: Record<DeckStackVariant, string> = {
  tavern: styles.tavern!,
  castle: styles.castle!,
  discard: styles.discard!,
};

export interface DeckStackProps {
  count: number;
  /** Full accessible text (e.g. "Tavern deck: 26") -- the count is also
   * shown visually on the stack's front card, so this doubles as the
   * aria-label and a hover title. */
  ariaLabel: string;
  /** Selects this pile's own --deck-color override (DeckStack.module.css)
   * so each deck can be customized independently rather than every
   * DeckStack instance sharing one color. Omit for .stack's own default
   * tone -- useful for a one-off stack that doesn't need its own variant. */
  variant?: DeckStackVariant;
}

/**
 * A pile rendered as a card stack: the front card always shows the exact
 * count, and 0-3 dimmed background layers behind it (see stackLayers)
 * give an at-a-glance sense of "thin" vs. "thick" without requiring the
 * viewer to read the number. Used for the Tavern deck (genuinely hidden
 * contents -- its remaining draw order is real hidden information) and,
 * alongside `DiscardPileZone`'s own per-card rendering, the discard pile's
 * count (public contents too, since spec.md story 8 -- nothing in this
 * game ever reshuffles the discard pile back into play, so there was no
 * hidden-information reason to keep it opaque; this component itself
 * still only ever renders a bare count either way, never the cards).
 */
export function DeckStack({ count, ariaLabel, variant }: DeckStackProps) {
  const layers = stackLayers(count);
  const layerClasses = [styles.layer1, styles.layer2, styles.layer3].slice(0, layers);
  const stackClassName = variant ? `${styles.stack} ${VARIANT_CLASS[variant]}` : styles.stack;

  return (
    <div className={stackClassName} aria-label={ariaLabel} title={ariaLabel}>
      {layerClasses.map((layerClass, index) => (
        <div key={index} className={layerClass} aria-hidden="true" />
      ))}
      <div className={count === 0 ? `${styles.top} ${styles.empty}` : styles.top} aria-hidden="true">
        <span className={styles.count}>{count}</span>
      </div>
    </div>
  );
}
