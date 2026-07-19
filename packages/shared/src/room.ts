import type { RoomRole } from './permissions.js';

export type RoomStatus = 'lobby' | 'in_game';

export interface RoomMember {
  userID: string;
  role: RoomRole;
}

export interface Room {
  roomID: string;
  inviteCode: string;
  hostUserID: string;
  selectedGameID: string | null;
  currentMatchID: string | null;
  status: RoomStatus;
  allowMultiSeat: boolean;
  gameSettings: Record<string, unknown>;
  members: RoomMember[];
  closedAt: string | null;
}
