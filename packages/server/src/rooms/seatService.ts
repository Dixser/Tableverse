import type { SeatAssignment } from '@tableverse/shared';
import type { Models } from '../db/models.js';
import type { RoomRepository } from './roomRepository.js';

export class SeatClaimError extends Error {}

function toSeatAssignment(row: {
  roomId: string;
  playerId: string;
  userId: string;
  claimedAt: Date;
}): SeatAssignment {
  return {
    roomID: row.roomId,
    playerID: row.playerId,
    userID: row.userId,
    claimedAt: row.claimedAt.toISOString(),
  };
}

export class SeatService {
  constructor(
    private readonly models: Models,
    private readonly rooms: RoomRepository,
  ) {}

  async getSeatsForRoom(roomID: string): Promise<SeatAssignment[]> {
    const rows = await this.models.RoomSeat.findAll({
      where: { roomId: roomID },
    });
    return rows.map(toSeatAssignment);
  }

  /**
   * Claims playerID in roomID for userID. Enforces:
   *  - the seat isn't already claimed by anyone (regardless of
   *    allowMultiSeat);
   *  - if allowMultiSeat is false, userID must not already hold a
   *    different seat in this room.
   * See spec.md acceptance criteria 3-6.
   */
  async claimSeat(
    roomID: string,
    playerID: string,
    userID: string,
  ): Promise<SeatAssignment> {
    const room = await this.rooms.getById(roomID);
    if (!room) {
      throw new SeatClaimError(`Room ${roomID} not found`);
    }

    const existingForSeat = await this.models.RoomSeat.findOne({
      where: { roomId: roomID, playerId: playerID },
    });
    if (existingForSeat) {
      throw new SeatClaimError(
        `Seat ${playerID} in room ${roomID} is already claimed`,
      );
    }

    if (!room.allowMultiSeat) {
      const existingForUser = await this.models.RoomSeat.findOne({
        where: { roomId: roomID, userId: userID },
      });
      if (existingForUser) {
        throw new SeatClaimError(
          `User ${userID} already holds a seat in room ${roomID} and allowMultiSeat is disabled`,
        );
      }
    }

    const row = await this.models.RoomSeat.create({
      roomId: roomID,
      playerId: playerID,
      userId: userID,
    });
    return toSeatAssignment(row);
  }

  async leaveSeat(roomID: string, playerID: string): Promise<void> {
    await this.models.RoomSeat.destroy({
      where: { roomId: roomID, playerId: playerID },
    });
  }

  /** Host-only action (enforced by the caller via canPerform), used to free a seat whose occupant is release-eligible. */
  async releaseSeat(roomID: string, playerID: string): Promise<void> {
    await this.leaveSeat(roomID, playerID);
  }

  async clearAllSeats(roomID: string): Promise<void> {
    await this.models.RoomSeat.destroy({ where: { roomId: roomID } });
  }
}
