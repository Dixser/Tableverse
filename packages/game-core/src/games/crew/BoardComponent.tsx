import { useTranslation } from 'react-i18next';
import type { BoardProps } from '../../types.js';
import type { CrewView, CommunicationPosition } from './gameDef.js';
import { CommanderBadge } from './CommanderBadge.js';
import { TaskBoard } from './TaskBoard.js';
import { TaskDraftPanel } from './TaskDraftPanel.js';
import { TrickZone } from './TrickZone.js';
import { HandView } from './HandView.js';
import { CommunicationPanel } from './CommunicationPanel.js';
import { CommunicatedCards } from './CommunicatedCards.js';
import { CommanderChoicePanel } from './CommanderChoicePanel.js';
import { CommanderDistributionPanel } from './CommanderDistributionPanel.js';
import { TaskHandoverPanel } from './TaskHandoverPanel.js';
import { getLevel } from './levels.js';
import styles from './BoardComponent.module.css';

/**
 * Renders ONLY this game's play surface -- no player list, seat controls,
 * or presence indicators (tech-stack.md's chrome/board split). The
 * generic RoundConfirmBanner (rendered by GameMount above this component)
 * already owns the "N of M confirmed" UI for the trickConfirm wait; this
 * board only renders the frozen last-trick state and the one extra
 * game-specific action available during that wait (radio communication),
 * never a second confirm affordance of its own.
 */
export const CrewBoard: React.FC<BoardProps<CrewView>> = ({ G, ctx, moves, playerID, isActive, playerNames }) => {
  const { t } = useTranslation();
  const ownHand = playerID != null ? (G.hands[playerID] ?? []) : [];
  const roundConfirmActive = G.roundConfirm !== null;
  const isDraftPhase = ctx.phase === 'missionDraft';
  const isTrickPhase = ctx.phase === 'trick';
  const ledSuit = isTrickPhase ? (G.currentTrick?.plays[0]?.card.suit ?? null) : null;
  const canPlay = isActive && isTrickPhase && !roundConfirmActive;
  const ownComm = playerID != null ? G.communications[playerID] : undefined;

  const displayedTrick = G.currentTrick ?? G.lastTrick;

  const level = getLevel(G.level);
  const constraints = level.constraints;
  const requiresSickChoice = constraints.some((c) => c.kind === 'commanderChoosesSick');
  const requiresMutedChoice = constraints.some((c) => c.kind === 'commanderChoosesMuted');
  const requiresTaskRecipientChoice = constraints.some((c) => c.kind === 'commanderAssignsTasks');
  const preTrick1Window = ctx.phase === 'trickConfirm' && G.trickNumber === 0;
  const isCommander = playerID === G.commanderSeatID;
  const taskRecipientChoicePending = requiresTaskRecipientChoice && G.unclaimedTaskCardIds.length > 0;
  const disruptionActive = level.disruptionResumesAtTrick !== undefined && G.trickNumber < level.disruptionResumesAtTrick;
  const usesCommanderDistribution = level.commanderDistribution === true;
  const myTasks = playerID != null ? G.tasks.filter((task) => task.ownerSeatID === playerID) : [];
  const handoverAvailable =
    level.handoverAllowed === true && G.activeSeatIDs.length === 5 && !G.handoverUsed && preTrick1Window;

  return (
    <div className={styles.board}>
      <div className={styles.status}>
        <CommanderBadge commanderSeatID={G.commanderSeatID} playerNames={playerNames} />
        <span>{t('crew.trickProgress', { current: G.trickNumber, total: G.totalTricks })}</span>
      </div>

      <TaskBoard tasks={G.tasks} activeSeatIDs={G.activeSeatIDs} playerNames={playerNames} constraints={constraints} />

      <CommunicatedCards
        activeSeatIDs={G.activeSeatIDs}
        communications={G.communications}
        playerNames={playerNames}
      />

      {requiresSickChoice && (
        <CommanderChoicePanel
          activeSeatIDs={G.activeSeatIDs}
          commanderSeatID={G.commanderSeatID}
          chosenSeatID={G.sickSeatID}
          canChoose={isCommander && preTrick1Window}
          choicePending={!isCommander && preTrick1Window}
          playerNames={playerNames}
          onChoose={(seatID) => moves.chooseSickSeat?.(seatID)}
          promptText={t('crew.sickSeat.choosePrompt')}
          statusText={(name) => t('crew.sickSeat.status', { name })}
          waitingText={(name) => t('crew.sickSeat.waiting', { name })}
        />
      )}

      {requiresMutedChoice && (
        <CommanderChoicePanel
          activeSeatIDs={G.activeSeatIDs}
          commanderSeatID={G.commanderSeatID}
          chosenSeatID={G.mutedSeatID}
          canChoose={isCommander && preTrick1Window}
          choicePending={!isCommander && preTrick1Window}
          playerNames={playerNames}
          onChoose={(seatID) => moves.chooseMutedSeat?.(seatID)}
          promptText={t('crew.mutedSeat.choosePrompt')}
          statusText={(name) => t('crew.mutedSeat.status', { name })}
          waitingText={(name) => t('crew.mutedSeat.waiting', { name })}
        />
      )}

      {isDraftPhase && requiresTaskRecipientChoice && (
        <CommanderChoicePanel
          activeSeatIDs={G.activeSeatIDs}
          commanderSeatID={G.commanderSeatID}
          chosenSeatID={G.tasks[0]?.ownerSeatID ?? null}
          canChoose={isCommander && taskRecipientChoicePending}
          choicePending={!isCommander && taskRecipientChoicePending}
          playerNames={playerNames}
          onChoose={(seatID) => moves.chooseTaskRecipient?.(seatID)}
          promptText={t('crew.taskRecipient.choosePrompt')}
          statusText={(name) => t('crew.taskRecipient.status', { name })}
          waitingText={(name) => t('crew.taskRecipient.waiting', { name })}
        />
      )}

      {isDraftPhase && usesCommanderDistribution && (
        <CommanderDistributionPanel
          taskLayout={G.taskLayout}
          unclaimedTaskCardIds={G.unclaimedTaskCardIds}
          tasks={G.tasks}
          activeSeatIDs={G.activeSeatIDs}
          isCommander={isCommander}
          playerNames={playerNames}
          onDistribute={(seatID) => moves.distributeTask?.(seatID)}
        />
      )}

      {isDraftPhase && !requiresTaskRecipientChoice && !usesCommanderDistribution && (
        <TaskDraftPanel
          taskLayout={G.taskLayout}
          unclaimedTaskCardIds={G.unclaimedTaskCardIds}
          isActive={isActive}
          currentPlayerID={ctx.currentPlayer}
          playerNames={playerNames}
          onPick={(taskCardId) => moves.pickTask?.(taskCardId)}
          constraints={constraints}
        />
      )}

      {!isDraftPhase && displayedTrick && (
        <TrickZone
          activeSeatIDs={G.activeSeatIDs}
          plays={displayedTrick.plays}
          winnerSeatID={'winnerSeatID' in displayedTrick ? displayedTrick.winnerSeatID : undefined}
          winningCard={'winningCard' in displayedTrick ? displayedTrick.winningCard : undefined}
          playerNames={playerNames}
          playerID={playerID}
          currentPlayerID={ctx.currentPlayer}
        />
      )}

      {playerID != null && (
        <>
          <HandView
            hand={ownHand}
            ledSuit={ledSuit}
            interactive={canPlay}
            onCardClicked={(cardId) => moves.playCard?.(cardId)}
            communicatedCardID={ownComm?.cardId}
          />
          {roundConfirmActive && ownComm && (
            <CommunicationPanel
              hand={ownHand}
              used={ownComm.used}
              onCommunicate={(cardId: string, position: CommunicationPosition) =>
                moves.communicateCard?.(cardId, position)
              }
              disruptedUntilTrick={disruptionActive ? level.disruptionResumesAtTrick : undefined}
              deadZone={level.deadZone === true}
            />
          )}
          {handoverAvailable && (
            <TaskHandoverPanel
              myTasks={myTasks}
              activeSeatIDs={G.activeSeatIDs}
              playerID={playerID}
              playerNames={playerNames}
              onHandover={(taskCardId, toSeatID) => moves.handoverTask?.(taskCardId, toSeatID)}
            />
          )}
        </>
      )}
    </div>
  );
};
