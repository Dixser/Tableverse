export interface SeatSwitcherProps {
  seatIDs: string[];
  activeSeatID: string | null;
  onSelect: (playerID: string) => void;
}

/**
 * Lets a user controlling multiple seats (multi-seat claiming / solo play)
 * choose which claimed seat's board is currently shown. Never renders more
 * than one seat's state at once -- switching just changes which
 * background Client() feeds GameMount.
 */
export function SeatSwitcher({ seatIDs, activeSeatID, onSelect }: SeatSwitcherProps) {
  if (seatIDs.length <= 1) return null;
  return (
    <div role="tablist" aria-label="Your seats">
      {seatIDs.map((playerID) => (
        <button
          key={playerID}
          type="button"
          role="tab"
          aria-selected={playerID === activeSeatID}
          onClick={() => onSelect(playerID)}
        >
          Seat {playerID}
        </button>
      ))}
    </div>
  );
}
