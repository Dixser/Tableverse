import { useTranslation } from 'react-i18next';
import { isContraband, type ItemId } from './cards.js';
import { poolChance } from './balconing.js';
import type { MagalufPlayer } from './state.js';
import type { MagalufSettings } from './settings.js';
import { IntoxMeter } from './IntoxMeter.js';
import { limitRange } from './limitScale.js';
import styles from './PlayerPanel.module.css';

export interface PlayerPanelProps {
  seatID: string;
  name: string;
  player: MagalufPlayer;
  settings: MagalufSettings;
  /** The real limit, or null while face-down for this viewer. */
  limit: number | null;
  isTurn: boolean;
  isSelf: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  withdrawn: 'magaluf.board.statusOut',
  arrested: 'magaluf.board.statusJail',
  dead: 'magaluf.board.statusDead',
};

export function PlayerPanel({
  seatID,
  name,
  player,
  settings,
  limit,
  isTurn,
  isSelf,
}: PlayerPanelProps) {
  const { t } = useTranslation();

  // Only computable when this viewer can already see the limit -- the board
  // must never reconstruct it, so with a face-down card there is simply no
  // badge to show.
  const over = limit !== null ? player.intox - limit : 0;
  const risk = limit !== null && over >= 1 ? poolChance(over, settings) : null;

  const statusKey = STATUS_LABEL[player.status];

  return (
    <section
      className={[
        styles.panel,
        isTurn ? styles.active : '',
        player.status === 'dead' ? styles.dead : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid={`player-panel-${seatID}`}
      aria-current={isTurn ? 'true' : undefined}
    >
      <header className={styles.head}>
        <span className={styles.name}>{isSelf ? t('magaluf.board.you', { name }) : name}</span>
        {statusKey && (
          <span className={styles.status} data-testid={`status-${seatID}`}>
            {t(statusKey)}
          </span>
        )}
        {risk !== null && (
          <span className={styles.risk} data-testid={`risk-${seatID}`}>
            {t('magaluf.board.balconyRisk', { percent: Math.round(risk * 100) })}
          </span>
        )}
      </header>

      <IntoxMeter
        intox={player.intox}
        resaca={player.resaca}
        band={limitRange(settings)}
        limit={limit}
      />

      <div className={styles.scores}>
        <span>
          {t('magaluf.board.banked')} <b data-testid={`banked-${seatID}`}>{player.bankedVP}</b>
        </span>
        <span>
          {t('magaluf.board.atRisk')} <b data-testid={`atrisk-${seatID}`}>{player.roundVP}</b>
        </span>
        <span className={styles.drinks}>
          {t('magaluf.board.drinks', { count: player.drinksThisPhase })}
        </span>
      </div>

      {/*
        Every chip carries its own rules text. The items are the only part of
        the board whose effect is not written on something the table can read
        -- the alcohol and the events both arrive as a card with their numbers
        on it, and an item just sits here as a noun until you use it.

        The chip is a button purely so the description can be reached: hover
        covers a mouse, `:focus-within` covers the keyboard, and a tap focuses
        the button, which is the only hover a phone has.
      */}
      <ul className={styles.items}>
        {player.items.map((item: ItemId, index) => {
          const tipID = `item-tip-${seatID}-${item}-${index}`;
          return (
            <li key={`${item}-${index}`} className={styles.itemSlot}>
              <button
                type="button"
                className={isContraband(item) ? styles.contraband : styles.item}
                data-testid={`item-${seatID}-${item}`}
                aria-describedby={tipID}
              >
                {t(`magaluf.item.${item}`)}
              </button>
              <span role="tooltip" id={tipID} className={styles.tip}>
                {t(`magaluf.itemDesc.${item}`)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
