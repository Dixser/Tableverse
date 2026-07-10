export type RoomRole = 'host' | 'member';

export type RoomAction =
  | 'changeGame'
  | 'kickPlayer'
  | 'manageSeats'
  | 'startMatch'
  | 'endMatch'
  | 'editRoomSettings'
  | 'claimSeat'
  | 'leaveSeat';

export const ROOM_PERMISSIONS: Record<RoomRole, Set<RoomAction>> = {
  host: new Set<RoomAction>([
    'changeGame',
    'kickPlayer',
    'manageSeats',
    'startMatch',
    'endMatch',
    'editRoomSettings',
    // Host is also always a room member and must be able to play,
    // including solo play (claiming every seat) — see spec.md user
    // stories 1 and 4, and plan.md's "Resolved architectural decisions".
    'claimSeat',
    'leaveSeat',
  ]),
  member: new Set<RoomAction>(['claimSeat', 'leaveSeat']),
};

export function canPerform(role: RoomRole, action: RoomAction): boolean {
  return ROOM_PERMISSIONS[role]?.has(action) ?? false;
}
