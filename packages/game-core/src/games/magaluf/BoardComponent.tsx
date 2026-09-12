import { useTranslation } from 'react-i18next';
import type { BoardProps } from '../../types.js';
import type { ItemId } from './cards.js';
import { eventOptions } from './cards.js';
import { HIDDEN_LIMIT } from './gameDef.js';
import { dayMultipliers } from './settings.js';
import type { MagalufG } from './state.js';
import { ActionBar } from './ActionBar.js';
import { BalconyOverlay } from './BalconyOverlay.js';
import { CierrabaresBanner } from './CierrabaresBanner.js';
import { DrawnCards } from './DrawnCards.js';
import { DuelPanel } from './DuelPanel.js';
import { EventChoicePanel } from './EventChoicePanel.js';
import { limitRange } from './limitScale.js';
import { PhaseHeader } from './PhaseHeader.js';
import { PlayerPanel } from './PlayerPanel.js';
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
 *   It needs no holding back during the last night's balcony either: the
 *   engine keeps `finished` false until the table has watched every jump, so
 *   the banner cannot arrive early and `onRevealPending` is not used here.
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

  // Which jump the *table* is watching, and which beat of it. Read straight
  // from G rather than paced per-viewer, so nobody is ever a jump ahead of
  // anybody else -- see BalconyOverlay.
  const jump = G.balcony ? G.jumps[G.balcony.index] ?? null : null;

  /**
   * Falls back to the seat, and qualifies a name two people are both using.
   *
   * The same rule the chat feed applies to the identical seat IDs (see
   * ChatPanel's `seatLabel`), because the two now render the same sentences:
   * an event outcome that reads "Alice, Alice, Alice" on the card while the
   * feed says which seats it meant is worse than either alone.
   */
  const nameFor = (seatID: string) => {
    const seat = t('room.seatLabel', { seatNumber: Number(seatID) + 1 });
    const name = playerNames?.[seatID];
    if (!name) return seat;
    const shared = Object.values(playerNames ?? {}).filter((n) => n === name).length > 1;
    return shared ? `${name} (${seat})` : name;
  };

  const owesReveal = playerID != null && G.pendingEvent?.seatID === playerID;
  const choice = G.pendingChoice;
  const owesChoice = playerID != null && choice?.seatID === playerID;
  const myTurn =
    isActive &&
    playerID != null &&
    G.roundConfirm === null &&
    // The night is over and the engine will refuse a party move anyway; the
    // seat that happened to be up when the venue closed must not be left
    // holding a live action bar behind the balcony overlay.
    G.balcony === null &&
    // Either it is your turn, or you owe a reveal -- which is only ever true on
    // your own turn anyway, but stating both keeps the two ideas separate.
    (G.turnSeatID === playerID || owesReveal);
  const me = playerID != null ? G.players[playerID] : undefined;
  const duel = G.pendingDuel;
  // Who a challenger may pick: anyone else still in the room.
  const duelCandidates = duel
    ? G.activeSeatIDs.filter(
        (id) => id !== duel.challengerID && G.players[id]?.status === 'partying',
      )
    : [];

  return (
    <div className={styles.board} data-testid="magaluf-board">
      {/* Only ever set between closing time and the next venue opening. */}
      {G.cierrabares && (
        <CierrabaresBanner
          award={G.cierrabares}
          winnerName={nameFor(G.cierrabares.seatID)}
        />
      )}
      <PhaseHeader
        day={G.day}
        phase={G.phase}
        dayMultiplier={dayMultipliers(G.settings)[G.day] ?? 1}
        band={limitRange(G.settings)}
        limit={limit}
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
              settings={G.settings}
              limit={limit}
              isTurn={G.turnSeatID === seatID && G.roundConfirm === null}
              isSelf={seatID === playerID}
            />
          );
        })}
      </div>

      <DrawnCards
        lastDraw={G.lastDraw}
        drawerName={G.lastDraw ? nameFor(G.lastDraw.seatID) : null}
        eventPending={G.pendingEvent != null}
        nameFor={nameFor}
      />

      {/*
        A face-up choice card owns the move surface outright: the whole table
        sees it, the drawer gets the buttons and everyone else gets a line
        saying who they are waiting on. Spectators land here too, which is the
        right answer -- they can already read the card in DrawnCards above.
      */}
      {/*
        An open Duelo outranks both: the seat it is waiting on is usually not
        the one whose turn it is, so neither the choice panel nor the action
        bar can be the right surface for it.
      */}
      {duel ? (
        <DuelPanel
          duel={duel}
          candidates={duelCandidates}
          playerID={playerID ?? null}
          nameFor={nameFor}
          onPick={(seatID: string) => moves.chooseDuelTarget?.(seatID)}
          onDrink={() => moves.duelDrink?.()}
          onFold={() => moves.duelFold?.()}
        />
      ) : choice ? (
        <EventChoicePanel
          options={eventOptions(choice.eventId) ?? []}
          chooserName={nameFor(choice.seatID)}
          mine={owesChoice}
          onChoose={(index: number) => moves.chooseEventOption?.(index)}
        />
      ) : (
        myTurn &&
        me && (
          <ActionBar
            player={me}
            eventPending={owesReveal}
            onDrink={() => moves.drink?.()}
            onReveal={() => moves.revealEvent?.()}
            onWithdraw={() => moves.withdraw?.()}
            onUseItem={(item: ItemId) => moves.useItem?.(item)}
          />
        )
      )}

      {jump && G.balcony && (
        <BalconyOverlay
          jump={jump}
          jumperName={nameFor(jump.seatID)}
          settings={G.settings}
          revealed={G.balcony.revealed}
          mine={playerID != null && jump.seatID === playerID}
          canSkip={playerID != null && G.hostPlayerID === playerID}
          onJump={() => moves.revealJump?.()}
          onContinue={() => moves.advanceJump?.()}
          onSkip={() => moves.skipBalcony?.()}
        />
      )}
    </div>
  );
};
