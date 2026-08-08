import { useTranslation } from 'react-i18next';
import type { BoardProps } from '../../types.js';
import type { ItemId } from './cards.js';
import { HIDDEN_LIMIT } from './gameDef.js';
import { dayMultipliers } from './settings.js';
import type { MagalufG } from './state.js';
import { ActionBar } from './ActionBar.js';
import { BalconyOverlay } from './BalconyOverlay.js';
import { DrawnCards } from './DrawnCards.js';
import { PhaseHeader } from './PhaseHeader.js';
import { PlayerPanel } from './PlayerPanel.js';
import { useJumpQueue } from './useJumpQueue.js';
import styles from './BoardComponent.module.css';

/**
 * Renders ONLY this game's play surface -- no player list as chrome, no seat
 * controls, no presence, no chat (tech-stack.md's chrome/board split). The
 * per-seat panels here are game state, not the platform's player list: they
 * carry intoxication, points and items, which nothing outside this game knows
 * how to render. Same line Cahoots' own PlayerStatusList walks.
 *
 * Two things this board deliberately does not do:
 *
 * - **No win/loss or standings UI.** The platform's GameoverBanner owns both,
 *   and since feature 033 it renders the final table from `endIf`'s standings.
 * - **No round-confirm UI.** GameMount renders RoundConfirmBanner for every
 *   game; this one just goes quiet behind it while a gate is open.
 *
 * There is no hand, so no @dnd-kit and no hand sorting: the move surface is
 * three kinds of button and nothing is ever selected first.
 */
export const MagalufBoard: React.FC<BoardProps<MagalufG>> = ({
  G,
  moves,
  playerID,
  isActive,
  playerNames,
}) => {
  const { t } = useTranslation();

  // playerView has already stripped the limit if this viewer may not see it.
  // The board treats that as "no information" and never reconstructs it.
  const limit = G.limit === HIDDEN_LIMIT ? null : G.limit;

  const jumps = useJumpQueue(G.jumps);
  const nameFor = (seatID: string) =>
    playerNames?.[seatID] ?? t('room.seatLabel', { seatNumber: Number(seatID) + 1 });

  const owesReveal = playerID != null && G.pendingEvent?.seatID === playerID;
  const myTurn =
    isActive &&
    playerID != null &&
    G.roundConfirm === null &&
    // Either it is your turn, or you owe a reveal -- which is only ever true on
    // your own turn anyway, but stating both keeps the two ideas separate.
    (G.turnSeatID === playerID || owesReveal);
  const me = playerID != null ? G.players[playerID] : undefined;

  return (
    <div className={styles.board} data-testid="magaluf-board">
      <PhaseHeader
        day={G.day}
        phase={G.phase}
        dayMultiplier={dayMultipliers(G.settings)[G.day] ?? 1}
        limitShift={G.settings.limitShift}
        limit={limit}
      />

      <DrawnCards
        lastDraw={G.lastDraw}
        drawerName={G.lastDraw ? nameFor(G.lastDraw.seatID) : null}
        eventPending={G.pendingEvent != null}
      />

      <div className={styles.players}>
        {G.activeSeatIDs.map((seatID) => {
          const player = G.players[seatID];
          if (!player) return null;
          return (
            <PlayerPanel
              key={seatID}
              seatID={seatID}
              name={nameFor(seatID)}
              player={player}
              day={G.day}
              settings={G.settings}
              limit={limit}
              isTurn={G.turnSeatID === seatID && G.roundConfirm === null}
              isSelf={seatID === playerID}
            />
          );
        })}
      </div>

      {myTurn && me && (
        <ActionBar
          player={me}
          eventPending={owesReveal}
          onDrink={() => moves.drink?.()}
          onReveal={() => moves.revealEvent?.()}
          onWithdraw={() => moves.withdraw?.()}
          onUseItem={(item: ItemId) => moves.useItem?.(item)}
        />
      )}

      {jumps.current && (
        <BalconyOverlay
          jump={jumps.current}
          jumperName={nameFor(jumps.current.seatID)}
          settings={G.settings}
          onAdvance={jumps.advance}
          onSkip={jumps.skipAll}
        />
      )}
    </div>
  );
};
