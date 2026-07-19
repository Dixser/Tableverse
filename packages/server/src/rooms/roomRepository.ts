import { Op } from 'sequelize';
import type { Room } from '@tableverse/shared';
import type { Models } from '../db/models.js';
import type { RoomModel } from '../db/models.js';
import { generateInviteCode } from './inviteCode.js';

export interface RoomRepository {
  create(room: Room): Promise<void>;
  getById(roomID: string): Promise<Room | null>;
  getByInviteCode(inviteCode: string): Promise<Room | null>;
  update(roomID: string, patch: Partial<Room>): Promise<void>;
  generateUniqueInviteCode(): Promise<string>;
  findStaleLobbyRooms(cutoff: Date): Promise<Room[]>;
  findRoomsClosedBefore(cutoff: Date): Promise<Room[]>;
  delete(roomID: string): Promise<void>;
}

function toRoom(row: RoomModel): Room {
  return {
    roomID: row.roomId,
    inviteCode: row.inviteCode,
    hostUserID: row.hostUserId,
    selectedGameID: row.selectedGameId,
    currentMatchID: row.currentMatchId,
    status: row.status,
    allowMultiSeat: row.allowMultiSeat,
    gameSettings: JSON.parse(row.gameSettings) as Record<string, unknown>,
    members: JSON.parse(row.members) as Room['members'],
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
  };
}

const MAX_INVITE_CODE_ATTEMPTS = 10;

export class SequelizeRoomRepository implements RoomRepository {
  constructor(private readonly models: Models) {}

  /** Generates a 6-char invite code and retries on the rare collision. */
  async generateUniqueInviteCode(): Promise<string> {
    for (let attempt = 0; attempt < MAX_INVITE_CODE_ATTEMPTS; attempt++) {
      const code = generateInviteCode();
      const existing = await this.models.Room.findOne({
        where: { inviteCode: code },
      });
      if (!existing) return code;
    }
    throw new Error(
      `Could not generate a unique invite code after ${MAX_INVITE_CODE_ATTEMPTS} attempts`,
    );
  }

  async create(room: Room): Promise<void> {
    await this.models.Room.create({
      roomId: room.roomID,
      inviteCode: room.inviteCode,
      hostUserId: room.hostUserID,
      selectedGameId: room.selectedGameID,
      currentMatchId: room.currentMatchID,
      status: room.status,
      allowMultiSeat: room.allowMultiSeat,
      gameSettings: JSON.stringify(room.gameSettings),
      members: JSON.stringify(room.members),
    });
  }

  async getById(roomID: string): Promise<Room | null> {
    const row = await this.models.Room.findByPk(roomID);
    return row ? toRoom(row) : null;
  }

  async getByInviteCode(inviteCode: string): Promise<Room | null> {
    const row = await this.models.Room.findOne({ where: { inviteCode } });
    return row ? toRoom(row) : null;
  }

  async update(roomID: string, patch: Partial<Room>): Promise<void> {
    const row = await this.models.Room.findByPk(roomID);
    if (!row) {
      throw new Error(`Room ${roomID} not found`);
    }
    if (patch.selectedGameID !== undefined) {
      row.selectedGameId = patch.selectedGameID;
    }
    if (patch.currentMatchID !== undefined) {
      row.currentMatchId = patch.currentMatchID;
    }
    if (patch.status !== undefined) {
      row.status = patch.status;
    }
    if (patch.allowMultiSeat !== undefined) {
      row.allowMultiSeat = patch.allowMultiSeat;
    }
    if (patch.gameSettings !== undefined) {
      row.gameSettings = JSON.stringify(patch.gameSettings);
    }
    if (patch.members !== undefined) {
      row.members = JSON.stringify(patch.members);
    }
    if (patch.closedAt !== undefined) {
      row.closedAt = patch.closedAt ? new Date(patch.closedAt) : null;
    }
    await row.save();
  }

  /**
   * Candidates for room-cleanup stage 1 (see roomCleanup.ts): open lobby
   * rooms whose Room row itself hasn't been touched since before cutoff.
   * Seat claims never touch Room.updatedAt (SeatService writes only to
   * RoomSeat), so a second pass below still has to check RoomSeat.claimedAt
   * before a candidate here counts as truly stale.
   */
  async findStaleLobbyRooms(cutoff: Date): Promise<Room[]> {
    const candidates = await this.models.Room.findAll({
      where: { status: 'lobby', closedAt: null, updatedAt: { [Op.lt]: cutoff } },
    });
    if (candidates.length === 0) return [];

    const roomIds = candidates.map((row) => row.roomId);
    const seats = await this.models.RoomSeat.findAll({
      where: { roomId: roomIds },
    });
    const lastClaimByRoom = new Map<string, number>();
    for (const seat of seats) {
      const claimedAt = seat.claimedAt.getTime();
      const prev = lastClaimByRoom.get(seat.roomId) ?? 0;
      if (claimedAt > prev) lastClaimByRoom.set(seat.roomId, claimedAt);
    }

    return candidates
      .filter((row) => (lastClaimByRoom.get(row.roomId) ?? 0) < cutoff.getTime())
      .map(toRoom);
  }

  /** Candidates for room-cleanup stage 2 (permanent delete) -- see roomCleanup.ts. */
  async findRoomsClosedBefore(cutoff: Date): Promise<Room[]> {
    const rows = await this.models.Room.findAll({
      where: { closedAt: { [Op.lt]: cutoff } },
    });
    return rows.map(toRoom);
  }

  async delete(roomID: string): Promise<void> {
    await this.models.Room.destroy({ where: { roomId: roomID } });
  }
}
