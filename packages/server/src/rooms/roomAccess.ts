import type { Room, RoomRole } from '@tableverse/shared';

export function getRoleInRoom(room: Room, userID: string): RoomRole | undefined {
  return room.members.find((m) => m.userID === userID)?.role;
}
