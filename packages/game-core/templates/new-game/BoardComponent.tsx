import type { BoardProps } from '../../types.js';
import type { __PASCAL_NAME__G } from './gameDef.js';
import styles from './BoardComponent.module.css';

/**
 * Renders ONLY this game's play surface -- no player list, seat controls,
 * or presence indicators. See tech-stack.md's chrome/board split.
 */
export const __PASCAL_NAME__Board: React.FC<BoardProps<__PASCAL_NAME__G>> = ({
  G,
  isActive,
  moves,
}) => (
  <div className={styles.board}>
    {/* TODO: replace with the real board. */}
    <button type="button" disabled={!isActive} onClick={() => moves.noop?.()}>
      placeholder: {String(G.placeholder)}
    </button>
  </div>
);
