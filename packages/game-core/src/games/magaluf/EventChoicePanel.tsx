import { useTranslation } from 'react-i18next';
import type { EventOption } from './cards.js';
import styles from './EventChoicePanel.module.css';

export interface EventChoicePanelProps {
  /** The branches printed on the card, in the order the engine indexes them. */
  options: readonly EventOption[];
  /** Name of the seat that has to decide. Only read while `mine` is false. */
  chooserName: string;
  /** True when this viewer is the one being asked. */
  mine: boolean;
  onChoose: (index: number) => void;
}

/**
 * The one thing on the table while a choice card is face-up.
 *
 * It replaces the ActionBar rather than sitting beside it, for the reason that
 * bar already gives for the reveal step: while a card is owed there is exactly
 * one thing to do, and rendering the other buttons greyed out would only
 * invite clicking them.
 *
 * Everyone else gets the waiting line instead of a frozen board — a table that
 * cannot tell "somebody is thinking" from "somebody disconnected" starts
 * talking over the game.
 */
export function EventChoicePanel({
  options,
  chooserName,
  mine,
  onChoose,
}: EventChoicePanelProps) {
  const { t } = useTranslation();

  if (!mine) {
    return (
      <div className={styles.panel} data-testid="event-choice-waiting">
        <span className={styles.waiting}>
          {t('magaluf.board.waitingChoice', { name: chooserName })}
        </span>
      </div>
    );
  }

  return (
    <div className={styles.panel} data-testid="event-choice">
      <span className={styles.prompt}>{t('magaluf.board.chooseOption')}</span>
      <div className={styles.options}>
        {options.map((option, index) => (
          <button
            key={option.id}
            type="button"
            className={styles.option}
            data-testid={`choose-${option.id}`}
            onClick={() => onChoose(index)}
          >
            {t(`magaluf.eventOption.${option.id}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
