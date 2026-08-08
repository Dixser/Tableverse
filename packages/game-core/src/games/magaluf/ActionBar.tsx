import { useTranslation } from 'react-i18next';
import { isContraband, type ItemId } from './cards.js';
import type { MagalufPlayer } from './state.js';
import styles from './ActionBar.module.css';

export interface ActionBarProps {
  player: MagalufPlayer;
  /** True while this player owes an event reveal. */
  eventPending: boolean;
  onDrink: () => void;
  onReveal: () => void;
  onWithdraw: () => void;
  onUseItem: (item: ItemId) => void;
}

/**
 * The whole move surface: drink, withdraw, and one button per item held.
 *
 * There is no hand to manage and nothing to select first, which is why this
 * game needs neither @dnd-kit nor feature 031's hand sorting.
 */
export function ActionBar({
  player,
  eventPending,
  onDrink,
  onReveal,
  onWithdraw,
  onUseItem,
}: ActionBarProps) {
  const { t } = useTranslation();
  // One item per turn. Disabled rather than hidden so the cost of having
  // already used one is visible instead of the buttons silently vanishing.
  const itemsSpent = player.itemUsedThisTurn;

  // While an event is face-down there is exactly one thing to do, and showing
  // the other buttons greyed out would only invite clicking them.
  if (eventPending) {
    return (
      <div className={styles.bar} data-testid="action-bar">
        <button type="button" className={styles.drink} data-testid="reveal-event" onClick={onReveal}>
          {t('magaluf.board.revealEvent')}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.bar} data-testid="action-bar">
      <button type="button" className={styles.drink} onClick={onDrink}>
        {t('magaluf.board.drink')}
      </button>
      <button type="button" className={styles.withdraw} onClick={onWithdraw}>
        {t('magaluf.board.withdraw')}
      </button>

      {player.items.map((item, index) => (
        <button
          key={`${item}-${index}`}
          type="button"
          className={isContraband(item) ? styles.contraband : styles.item}
          disabled={itemsSpent}
          data-testid={`use-${item}`}
          onClick={() => onUseItem(item)}
        >
          {t('magaluf.board.use', { item: t(`magaluf.item.${item}`) })}
        </button>
      ))}
    </div>
  );
}
