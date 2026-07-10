import { getGameModule, type BoardProps } from '@tableverse/game-core';

export interface GameMountProps {
  selectedGameID: string | null;
  /** The active seat's running Client() state, or null if this browser holds no seat (spectator). */
  boardProps: BoardProps | null;
}

/**
 * The chrome/board seam from tech-stack.md: looks up the GameModule for
 * the room's selected game and renders ONLY its BoardComponent, passing
 * nothing about rooms, seats, or presence -- standard board props for the
 * active seat's Client() only. This is the sole place in the client that
 * imports a BoardComponent by way of the catalog lookup.
 */
export function GameMount({ selectedGameID, boardProps }: GameMountProps) {
  if (!selectedGameID) {
    return <div>No game selected yet.</div>;
  }
  const module = getGameModule(selectedGameID);
  if (!module) {
    return <div>Unknown game: {selectedGameID}</div>;
  }
  if (!boardProps) {
    return <div>Spectating {module.displayName} (no seat claimed).</div>;
  }
  const { BoardComponent } = module;
  return (
    <div data-testid="game-mount">
      <BoardComponent {...boardProps} />
    </div>
  );
}
