import type { BoardProps } from '../../types.js';
import type { TicTacToeG } from './gameDef.js';
import styles from './BoardComponent.module.css';

const MARK: Record<string, string> = { '0': 'X', '1': 'O' };

/**
 * Renders ONLY the 3x3 grid -- no player list, seat controls, or presence
 * indicators. The platform's chrome (RoomShell) owns everything else, per
 * tech-stack.md's chrome/board split.
 */
export const TicTacToeBoard: React.FC<BoardProps<TicTacToeG>> = ({
  G,
  ctx,
  moves,
  isActive,
}) => {
  const canPlay = (cellIndex: number): boolean =>
    isActive && G.cells[cellIndex] === null && !ctx.gameover;

  return (
    <div className={styles.board} role="grid">
      {G.cells.map((cell, i) => (
        <button
          key={i}
          type="button"
          role="gridcell"
          className={styles.cell}
          disabled={!canPlay(i)}
          onClick={() => moves.play?.(i)}
        >
          {cell !== null ? (MARK[cell] ?? cell) : ''}
        </button>
      ))}
    </div>
  );
};
