export type RoomRole = 'host' | 'member';

export type RoomAction =
  | 'changeGame'
  | 'kickPlayer'
  | 'manageSeats'
  | 'startMatch'
  | 'endMatch'
  | 'rematch'
  | 'editRoomSettings'
  | 'claimSeat'
  | 'leaveSeat'
  | 'leaveRoom';

export const ROOM_PERMISSIONS: Record<RoomRole, Set<RoomAction>> = {
  host: new Set<RoomAction>([
    'changeGame',
    'kickPlayer',
    'manageSeats',
    'startMatch',
    'endMatch',
    'rematch',
    'editRoomSettings',
    // Host is also always a room member and must be able to play,
    // including solo play (claiming every seat) — see spec.md user
    // stories 1 and 4, and plan.md's "Resolved architectural decisions".
    'claimSeat',
    'leaveSeat',
    // Deliberately NOT 'leaveRoom' -- feature 007's resolved decision:
    // the host cannot leave the room (no succession logic exists). This
    // is the one action a member can do that a host cannot; enforced
    // purely as data here, same "permissions are data, not branches"
    // principle as everything else in this map.
  ]),
  member: new Set<RoomAction>(['claimSeat', 'leaveSeat', 'leaveRoom']),
};

export function canPerform(role: RoomRole, action: RoomAction): boolean {
  return ROOM_PERMISSIONS[role]?.has(action) ?? false;
}
