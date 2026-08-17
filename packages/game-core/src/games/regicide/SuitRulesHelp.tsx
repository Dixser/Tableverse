import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { SUITS } from './deck.js';
import styles from './SuitRulesHelp.module.css';

/**
 * The four suit powers, folded behind a `?`.
 *
 * They used to be printed out in full inside the enemy panel, which cost
 * four permanent lines of vertical space on every board. On a phone that
 * was enough to push the hand below the fold, so every turn opened with a
 * scroll. The powers are reference material -- read once or twice a match,
 * then never again -- so they belong in an overlay that costs no layout
 * height at all rather than in the always-on board.
 *
 * The `?` is a button purely so the text can be reached: hover covers a
 * mouse, `:focus-within` covers the keyboard, and a tap focuses the button,
 * which is the only hover a phone has. Same mechanism as Magaluf's item
 * chips (magaluf/PlayerPanel.tsx) -- deliberately not a click-to-toggle
 * with its own open state, since that needs an outside-click/Escape
 * dismissal path that focus already gives us for free.
 */
export function SuitRulesHelp() {
  const { t } = useTranslation();
  // Unique per instance: the board renders one of these today, but an id
  // colliding with a second copy would point both triggers' descriptions at
  // whichever element won.
  const tipID = `suit-rules-tip-${useId()}`;

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.trigger}
        aria-label={t('regicide.suitsRules.help')}
        aria-describedby={tipID}
        data-testid="suit-rules-help"
      >
        ?
      </button>
      <dl role="tooltip" id={tipID} className={styles.tip}>
        {SUITS.map((suit) => (
          <div key={suit} className={styles.row}>
            <dt className={styles.suit}>{t(`regicide.suits.${suit}`)}</dt>
            <dd className={styles.rule}>{t(`regicide.suitsRules.${suit}`)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
