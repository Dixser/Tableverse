import styles from './GameoverBanner.module.css';

export interface GameoverBannerProps {
  /** Raw ctx.gameover -- unknown, not GameoverResult, because a
   * non-conforming future game must not crash the banner. */
  gameover: unknown;
  /** The currently active seat's playerID, or null for a spectator --
   * exactly BoardProps['playerID']. */
  playerID: string | null;
  /** playerID -> display name, from useSeatClients. A playerID missing
   * here falls back to a seat-number label, not blank text. */
  playerNames: Record<string, string>;
}

function nameFor(id: string, playerNames: Record<string, string>): string {
  return playerNames[id] ?? `Seat ${id}`;
}

/** "Alice" / "Alice and Bob" / "Alice, Bob and Carol" */
function formatNameList(names: string[]): string {
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Resolves ctx.gameover + the viewer's perspective into display text.
 * Exported separately from the component so every branch (including
 * multi-winner cases no real game exercises yet) is unit-testable without
 * mounting React.
 */
export function resolveGameoverMessage(
  gameover: unknown,
  playerID: string | null,
  playerNames: Record<string, string>,
): string | null {
  if (!gameover || typeof gameover !== 'object') return null;
  const g = gameover as { winner?: string | string[]; draw?: boolean };
  if (g.draw === true) return "It's a draw.";
  if (g.winner !== undefined) {
    const winnerIDs = Array.isArray(g.winner) ? g.winner : [g.winner];
    const iAmWinner = playerID !== null && winnerIDs.includes(playerID);
    const others = winnerIDs
      .filter((id) => id !== playerID)
      .map((id) => nameFor(id, playerNames));
    if (iAmWinner) {
      return others.length === 0 ? 'You win!' : `You and ${formatNameList(others)} win!`;
    }
    const verb = winnerIDs.length > 1 ? 'win' : 'wins';
    return `${formatNameList(others)} ${verb}!`;
  }
  return 'Game over.';
}

/**
 * Platform-wide gameover/victory message, rendered by GameMount (never by a
 * BoardComponent) so every game gets it for free -- see
 * spec/features/009-gameover-banner. Renders nothing while the match is
 * still in progress (ctx.gameover is undefined).
 */
export function GameoverBanner({ gameover, playerID, playerNames }: GameoverBannerProps) {
  const message = resolveGameoverMessage(gameover, playerID, playerNames);
  if (message === null) return null;
  return (
    <div className={styles.banner} role="status">
      {message}
    </div>
  );
}
