import { useTranslation } from 'react-i18next';
import { duelPot } from './events.js';
import type { PendingDuel } from './state.js';
import styles from './DuelPanel.module.css';

export interface DuelPanelProps {
  duel: PendingDuel;
  /** Who the challenger may pick: every other seat still partying. */
  candidates: readonly string[];
  /** The viewing seat; null for a spectator. */
  playerID: string | null;
  nameFor: (seatID: string) => string;
  onPick: (seatID: string) => void;
  onDrink: () => void;
  onFold: () => void;
}

/**
 * The move surface while a Duelo is open, in both of its steps.
 *
 * Replaces the ActionBar for EventChoicePanel's reason: while a decision is
 * owed there is exactly one thing to do. Unlike that panel, the seat being
 * asked is usually *not* the one whose turn it is -- which is the whole reason
 * the duel runs in its own engine phase -- so "mine" is read from the duel,
 * never from the turn.
 *
 * The pot and what one more drink makes it are on screen for everyone: the
 * rising stake is the card, and a duelist deciding whether to drink is really
 * deciding whether to put that second number on the table.
 */
export function DuelPanel({
  duel,
  candidates,
  playerID,
  nameFor,
  onPick,
  onDrink,
  onFold,
}: DuelPanelProps) {
  const { t } = useTranslation();
  const challengerName = nameFor(duel.challengerID);

  if (duel.targetID === null) {
    if (playerID !== duel.challengerID) {
      return (
        <div className={styles.panel} data-testid="duel-panel">
          <span className={styles.waiting} data-testid="duel-waiting-target">
            {t('magaluf.board.duelWaitingTarget', { name: challengerName })}
          </span>
        </div>
      );
    }

    return (
      <div className={styles.panel} data-testid="duel-panel">
        <span className={styles.prompt}>{t('magaluf.board.duelPickTarget')}</span>
        <div className={styles.options}>
          {candidates.map((seatID) => (
            <button
              key={seatID}
              type="button"
              className={styles.option}
              data-testid={`duel-target-${seatID}`}
              onClick={() => onPick(seatID)}
            >
              {nameFor(seatID)}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const toAct = duel.toActID!;
  return (
    <div className={styles.panel} data-testid="duel-panel">
      <span className={styles.prompt} data-testid="duel-vs">
        {t('magaluf.board.duelVs', { challenger: challengerName, target: nameFor(duel.targetID) })}
      </span>
      <div className={styles.stakes}>
        <span>{t('magaluf.board.drinks', { count: duel.drinks })}</span>
        <span className={styles.pot} data-testid="duel-pot">
          {t('magaluf.board.duelPot', { vp: duelPot(duel.eventId, duel.drinks) })}
        </span>
        <span data-testid="duel-next-pot">
          {t('magaluf.board.duelNextPot', { vp: duelPot(duel.eventId, duel.drinks + 1) })}
        </span>
      </div>
      {playerID === toAct ? (
        // Identical buttons on purpose, as on every choice card: the board
        // does not get an opinion on whether you should drink.
        <div className={styles.options}>
          <button type="button" className={styles.option} data-testid="duel-drink" onClick={onDrink}>
            {t('magaluf.board.duelDrink')}
          </button>
          <button type="button" className={styles.option} data-testid="duel-fold" onClick={onFold}>
            {t('magaluf.board.duelFold')}
          </button>
        </div>
      ) : (
        <span className={styles.waiting} data-testid="duel-waiting">
          {t('magaluf.board.duelWaiting', { name: nameFor(toAct) })}
        </span>
      )}
    </div>
  );
}
