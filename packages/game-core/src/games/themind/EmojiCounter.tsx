import styles from './EmojiCounter.module.css';

export interface EmojiCounterProps {
  /** Repeated once per unit of `count` -- e.g. one rabbit per remaining life. */
  emoji: string;
  count: number;
  /** Screen-reader-only accessible name (e.g. "Lives: 2") -- the emoji
   * themselves carry no text for a11y tooling to read. */
  ariaLabel: string;
}

/**
 * Renders `count` copies of `emoji` in a row -- the visual replacement for
 * a numeric "Lives: 2" / "Stars: 1" label (spec: loop a count into repeated
 * icons rather than showing the number as text). `ariaLabel` keeps the
 * count available to assistive tech even though no digit is ever painted.
 */
export function EmojiCounter({ emoji, count, ariaLabel }: EmojiCounterProps) {
  return (
    <span className={styles.counter} aria-label={ariaLabel} title={ariaLabel}>
      {Array.from({ length: count }, (_, index) => (
        <span key={index} aria-hidden="true">
          {emoji}
        </span>
      ))}
    </span>
  );
}
