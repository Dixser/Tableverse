import { useTranslation } from 'react-i18next';
import { isContraband, type ItemId } from './cards.js';
import { poolChance } from './balconing.js';
import type { MagalufPlayer } from './state.js';
import type { MagalufSettings } from './settings.js';
import { IntoxMeter } from './IntoxMeter.js';
import styles from './PlayerPanel.module.css';

export interface PlayerPanelProps {
  seatID: string;
  name: string;
  player: MagalufPlayer;
  day: number;
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
  day,
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
        day={day}
        limitShift={settings.limitShift}
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

      <ul className={styles.items}>
        {player.items.map((item: ItemId, index) => (
          <li
            key={`${item}-${index}`}
            className={isContraband(item) ? styles.contraband : styles.item}
            data-testid={`item-${seatID}-${item}`}
          >
            {t(`magaluf.item.${item}`)}
          </li>
        ))}
      </ul>
    </section>
  );
}
