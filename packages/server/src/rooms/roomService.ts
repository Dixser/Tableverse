import { nanoid } from 'nanoid';
import type { Room, SeatAssignment, SeatCredential } from '@tableverse/shared';
import type { Server as BgioServer } from 'boardgame.io';
import type { GameModule } from '@tableverse/game-core';
import type { RoomRepository } from './roomRepository.js';
import type { SeatService } from './seatService.js';
import type { UserRepository } from '../identity/userRepository.js';
import type { SqliteStorageAdapter } from '../bgio/storage/sqliteStorageAdapter.js';
import { createMatch as bgioCreateMatch } from '../bgio/vendor.js';

export class RoomServiceError extends Error {}

export class RoomService {
  constructor(
    private readonly rooms: RoomRepository,
    private readonly seats: SeatService,
    private readonly users: UserRepository,
    private readonly storage: SqliteStorageAdapter,
    private readonly getGameModule: (id: string) => GameModule | undefined,
  ) {}

  async createRoom(hostUserID: string): Promise<Room> {
    const inviteCode = await this.rooms.generateUniqueInviteCode();
    const room: Room = {
      roomID: nanoid(16),
      inviteCode,
      hostUserID,
      selectedGameID: null,
      currentMatchID: null,
      status: 'lobby',
      allowMultiSeat: false,
      gameSettings: {},
      members: [{ userID: hostUserID, role: 'host' }],
    };
    await this.rooms.create(room);
    return room;
  }

  async joinRoom(inviteCode: string, userID: string): Promise<Room> {
    const room = await this.rooms.getByInviteCode(inviteCode);
    if (!room) {
      throw new RoomServiceError(`No room found for invite code ${inviteCode}`);
    }
    if (room.members.some((m) => m.userID === userID)) {
      return room; // already a member -- idempotent
    }
    const members = [...room.members, { userID, role: 'member' as const }];
    await this.rooms.update(room.roomID, { members });
    return { ...room, members };
  }

  /**
   * Changing the selected game resets all seat assignments and
   * gameSettings, per spec.md story 8: different games have different
   * numPlayers ranges, so carrying over seats risks stale/invalid
   * assignments.
   */
  async changeGame(roomID: string, gameID: string): Promise<Room> {
    const room = await this.mustGetRoom(roomID);
    if (room.status !== 'lobby') {
      throw new RoomServiceError(
        `Cannot change game while room ${roomID} is ${room.status}`,
      );
    }
    await this.seats.clearAllSeats(roomID);
    await this.rooms.update(roomID, {
      selectedGameID: gameID,
      gameSettings: {},
    });
    return { ...room, selectedGameID: gameID, gameSettings: {} };
  }

  /**
   * Claims a seat, per spec.md story 3 / AC6's two-phase model:
   *  - while the room is `lobby` (no match exists), this is a pure
   *    room-level reservation -- no boardgame.io credentials yet, since
   *    there is no matchID to scope them to. Delegates entirely to
   *    seatService.claimSeat.
   *  - while the room is `in_game` (e.g. reclaiming a seat the host just
   *    released), a matchID already exists, so credentials are minted
   *    immediately by patching the live match's metadata in storage.
   */
  async claimSeat(
    roomID: string,
    playerID: string,
    userID: string,
  ): Promise<{ assignment: SeatAssignment; credential: SeatCredential | null }> {
    const room = await this.mustGetRoom(roomID);
    const assignment = await this.seats.claimSeat(roomID, playerID, userID);

    if (room.status !== 'in_game' || !room.currentMatchID) {
      return { assignment, credential: null };
    }

    const matchID = room.currentMatchID;
    const { metadata } = await this.storage.fetch(matchID, { metadata: true });
    if (!metadata) {
      throw new RoomServiceError(`Match ${matchID} metadata not found`);
    }
    const credentials = nanoid(32);
    const user = await this.users.getById(userID);
    const playerIndex = Number(playerID);
    metadata.players[playerIndex] = {
      id: playerIndex,
      name: user?.displayName,
      credentials,
      isConnected: true,
    };
    await this.storage.setMetadata(matchID, metadata as BgioServer.MatchData);

    return {
      assignment,
      credential: { matchID, playerID, credentials },
    };
  }

  /**
   * Creates a new boardgame.io match for the room's selected game and
   * mints {matchID, playerID, credentials} for every seat already claimed
   * at this moment, in one batch (see plan.md's resolved decision on
   * seat-claim vs. credential-issuance timing).
   */
  async startMatch(roomID: string): Promise<{
    room: Room;
    credentialsByUserID: Map<string, SeatCredential[]>;
  }> {
    const room = await this.mustGetRoom(roomID);
    if (room.status !== 'lobby') {
      throw new RoomServiceError(`Room ${roomID} is not in lobby`);
    }
    if (!room.selectedGameID) {
      throw new RoomServiceError(`Room ${roomID} has no selected game`);
    }
    const gameModule = this.getGameModule(room.selectedGameID);
    if (!gameModule) {
      throw new RoomServiceError(
        `Unknown game ${room.selectedGameID} for room ${roomID}`,
      );
    }

    const claimedSeats = await this.seats.getSeatsForRoom(roomID);
    const matchID = nanoid(16);
    const created = bgioCreateMatch({
      game: { ...gameModule.gameDef, name: gameModule.id },
      numPlayers: gameModule.maxPlayers,
      setupData: room.gameSettings,
      unlisted: true,
    });
    if ('setupDataError' in created) {
      throw new RoomServiceError(
        `Match setup failed for room ${roomID}: ${created.setupDataError}`,
      );
    }
    const { metadata, initialState } = created;

    const credentialsByUserID = new Map<string, SeatCredential[]>();
    for (const seat of claimedSeats) {
      const credentials = nanoid(32);
      const user = await this.users.getById(seat.userID);
      const playerIndex = Number(seat.playerID);
      metadata.players[playerIndex] = {
        id: playerIndex,
        name: user?.displayName,
        credentials,
        isConnected: true,
      };
      const existing = credentialsByUserID.get(seat.userID) ?? [];
      existing.push({ matchID, playerID: seat.playerID, credentials });
      credentialsByUserID.set(seat.userID, existing);
    }

    await this.storage.createMatch(matchID, { initialState, metadata });
    await this.rooms.update(roomID, {
      currentMatchID: matchID,
      status: 'in_game',
    });

    return {
      room: { ...room, currentMatchID: matchID, status: 'in_game' },
      credentialsByUserID,
    };
  }

  /**
   * Every seated user needs a way to receive the credentials startMatch (or
   * a mid-game claimSeat) minted for THEIR seats specifically -- startMatch
   * only returns them to whichever single caller invoked it. Rather than a
   * push channel, any client can pull its own credentials on every room
   * fetch: GET /:roomID calls this alongside the room/seats it already
   * returns, so useSeatClients can populate its credential store as soon
   * as it next reads the room, without needing bespoke delivery.
   */
  async getMyCredentials(
    roomID: string,
    userID: string,
  ): Promise<SeatCredential[]> {
    const room = await this.mustGetRoom(roomID);
    if (!room.currentMatchID) return [];
    const mySeats = (await this.seats.getSeatsForRoom(roomID)).filter(
      (s) => s.userID === userID,
    );
    if (mySeats.length === 0) return [];
    const { metadata } = await this.storage.fetch(room.currentMatchID, {
      metadata: true,
    });
    if (!metadata) return [];
    const credentials: SeatCredential[] = [];
    for (const seat of mySeats) {
      const playerMeta = metadata.players[Number(seat.playerID)];
      if (playerMeta?.credentials) {
        credentials.push({
          matchID: room.currentMatchID,
          playerID: seat.playerID,
          credentials: playerMeta.credentials,
        });
      }
    }
    return credentials;
  }

  /**
   * Ends the current match and returns to lobby. Seats are preserved iff
   * selectedGameID was not changed during the match (spec.md story 9) —
   * since changeGame always clears seats itself, endMatch never needs to
   * clear them: whatever seats exist right now are, by construction,
   * exactly the ones that should survive.
   */
  async endMatch(roomID: string): Promise<Room> {
    const room = await this.mustGetRoom(roomID);
    if (room.status !== 'in_game') {
      throw new RoomServiceError(`Room ${roomID} is not in_game`);
    }
    if (room.currentMatchID) {
      await this.storage.wipe(room.currentMatchID);
    }
    await this.rooms.update(roomID, {
      currentMatchID: null,
      status: 'lobby',
    });
    return { ...room, currentMatchID: null, status: 'lobby' };
  }

  private async mustGetRoom(roomID: string): Promise<Room> {
    const room = await this.rooms.getById(roomID);
    if (!room) {
      throw new RoomServiceError(`Room ${roomID} not found`);
    }
    return room;
  }
}
