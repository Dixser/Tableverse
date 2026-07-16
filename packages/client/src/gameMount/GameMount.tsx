import { useTranslation } from 'react-i18next';
import { getGameModule, type BoardProps } from '@tableverse/game-core';
import { boardComponents } from '../boardRegistry.js';
import { GameoverBanner } from './GameoverBanner.js';
import { RoundConfirmBanner } from './RoundConfirmBanner.js';

export interface GameMountProps {
  selectedGameID: string | null;
  /** The active seat's running Client() state, or null if this browser holds no seat (spectator). */
  boardProps: BoardProps | null;
  /** playerID -> display name, from useSeatClients; passed through to GameoverBanner. */
  playerNames: Record<string, string>;
}

/**
 * The chrome/board seam from tech-stack.md: looks up the GameModule for
 * the room's selected game and renders ONLY its BoardComponent, passing
 * nothing about rooms, seats, or presence -- standard board props for the
 * active seat's Client() only. This is the sole place in the client that
 * imports a BoardComponent (via boardRegistry.ts, not GameModule itself --
 * see game-core/src/types.ts's doc comment for why the two are separate).
 */
export function GameMount({ selectedGameID, boardProps, playerNames }: GameMountProps) {
  const { t } = useTranslation();
  if (!selectedGameID) {
    return <div>{t('gameMount.noGameSelected')}</div>;
  }
  const module = getGameModule(selectedGameID);
  const BoardComponent = boardComponents[selectedGameID];
  if (!module || !BoardComponent) {
    return <div>{t('gameMount.unknownGame', { gameID: selectedGameID })}</div>;
  }
  if (!boardProps) {
    return <div>{t('gameMount.waitingForMatch')}</div>;
  }
  const G = boardProps.G as { roundConfirm?: unknown; hostPlayerID?: unknown };
  return (
    <div data-testid="game-mount">
      <GameoverBanner
        gameover={boardProps.ctx.gameover}
        playerID={boardProps.playerID}
        playerNames={playerNames}
      />
      {!module.ownRoundConfirmUI && (
        <RoundConfirmBanner
          roundConfirm={G.roundConfirm}
          hostPlayerID={G.hostPlayerID}
          playerID={boardProps.playerID}
          playerNames={playerNames}
          onConfirm={() => boardProps.moves.confirmRoundReady?.()}
          onForceAdvance={() => boardProps.moves.forceAdvanceRound?.()}
        />
      )}
      <BoardComponent {...boardProps} playerNames={playerNames} />
    </div>
  );
}
