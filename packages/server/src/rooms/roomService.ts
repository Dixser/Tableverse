import { nanoid } from 'nanoid';
import type { Room, SeatAssignment, SeatCredential } from '@tableverse/shared';
import type { Server as BgioServer } from 'boardgame.io';
import type { GameModule } from '@tableverse/game-core';
import { validateGameSettings } from '@tableverse/game-core';
import type { RoomRepository } from './roomRepository.js';
import type { SeatService } from './seatService.js';
import type { UserRepository } from '../identity/userRepository.js';
import type { SqliteStorageAdapter } from '../bgio/storage/sqliteStorageAdapter.js';
import type { PresenceManager } from '../presence/presenceManager.js';
import { createMatch as bgioCreateMatch } from '../bgio/vendor.js';

export class RoomServiceError extends Error {}

export class RoomService {
  private presenceManager: PresenceManager | undefined;

  constructor(
    private readonly rooms: RoomRepository,
    private readonly seats: SeatService,
    private readonly users: UserRepository,
    private readonly storage: SqliteStorageAdapter,
    private readonly getGameModule: (id: string) => GameModule | undefined,
  ) {}

  /**
   * Presence is wired up on a Socket.IO server built from the HTTP server
   * boardgame.io's own bgio.run(PORT) creates, which doesn't exist yet when
   * RoomService itself is constructed in index.ts -- so it's attached here,
   * after the fact, rather than taken as a constructor argument.
   */
  setPresenceManager(presenceManager: PresenceManager): void {
    this.presenceManager = presenceManager;
  }

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
      closedAt: null,
    };
    await this.rooms.create(room);
    return room;
  }

  async joinRoom(inviteCode: string, userID: string): Promise<Room> {
    const room = await this.rooms.getByInviteCode(inviteCode);
    if (!room) {
      throw new RoomServiceError(`No room found for invite code ${inviteCode}`);
    }
    if (room.closedAt) {
      throw new RoomServiceError(`Room ${room.roomID} is closed`);
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
   * Toggles `allowMultiSeat`, per spec.md user story 4: a host must be able
   * to enable it before claiming every seat for solo play. No status
   * restriction -- unlike changeGame, flipping this doesn't invalidate any
   * existing seat assignment, it only changes whether a *future* claimSeat
   * call is allowed to give one user a second seat.
   */
  async setAllowMultiSeat(roomID: string, allowMultiSeat: boolean): Promise<Room> {
    const room = await this.mustGetRoom(roomID);
    await this.rooms.update(roomID, { allowMultiSeat });
    return { ...room, allowMultiSeat };
  }

  /**
   * Validates `gameSettings` against the room's selected game's
   * settingsSchema and persists them -- shared by setGameSettings (lobby
   * only) and rematch's optional settings override (called once endMatch
   * has already returned the room to lobby, so the same validation
   * applies unchanged). Not itself lobby-gated; callers enforce that.
   */
  private async validateAndPersistGameSettings(
    roomID: string,
    gameSettings: Record<string, unknown>,
  ): Promise<Room> {
    const room = await this.mustGetRoom(roomID);
    if (!room.selectedGameID) {
      throw new RoomServiceError(`Room ${roomID} has no selected game`);
    }
    const gameModule = this.getGameModule(room.selectedGameID);
    if (!gameModule) {
      throw new RoomServiceError(
        `Unknown game ${room.selectedGameID} for room ${roomID}`,
      );
    }
    const errors = validateGameSettings(
      gameModule.settingsSchema ?? { type: 'object' },
      gameSettings,
    );
    if (errors.length > 0) {
      throw new RoomServiceError(
        `Invalid game settings: ${errors.map((e) => e.message).join('; ')}`,
      );
    }
    await this.rooms.update(roomID, { gameSettings });
    return { ...room, gameSettings };
  }

  /**
   * Persists validated game settings, per feature 013's spec.md story 1.
   * Lobby-only, mirroring changeGame's guard: settings that shaped the
   * current match can't be changed out from under it mid-match (story 3).
   * A GameModule with no settingsSchema validates against `{ type:
   * 'object' }` (no declared properties/required), so any submitted key is
   * rejected as unknown -- a game with no schema accepts no settings.
   */
  async setGameSettings(
    roomID: string,
    gameSettings: Record<string, unknown>,
  ): Promise<Room> {
    const room = await this.mustGetRoom(roomID);
    if (room.status !== 'lobby') {
      throw new RoomServiceError(
        `Cannot edit game settings while room ${roomID} is ${room.status}`,
      );
    }
    return this.validateAndPersistGameSettings(roomID, gameSettings);
  }

  /**
   * A member gives up their room membership entirely (not just a seat),
   * per feature 007's spec.md story 1. Cascades: every seat they hold in
   * this room is released as part of the same operation. The host can
   * never reach this -- canPerform('host', 'leaveRoom') is false,
   * enforced entirely by ROOM_PERMISSIONS as data, not a check here.
   */
  async leaveRoom(roomID: string, userID: string): Promise<Room> {
    const room = await this.mustGetRoom(roomID);
    await this.seats.releaseSeatsForUser(roomID, userID);
    const members = room.members.filter((m) => m.userID !== userID);
    await this.rooms.update(roomID, { members });
    return { ...room, members };
  }

  /**
   * Host removes another member entirely, per feature 007's spec.md
   * story 2. Same cascade as leaveRoom, just triggered by the host acting
   * on someone else instead of a member acting on themself. Two domain
   * rules the permission map can't express, checked here: a user cannot
   * kick themself, and the target must actually be a member of this room.
   * Not checked: the target having role 'host' -- structurally impossible
   * today, since there is exactly one host per room (assigned at creation,
   * never transferred) and the self-kick guard already excludes the one
   * case where actingUserID could equal the host's own userID.
   */
  async kickPlayer(
    roomID: string,
    actingUserID: string,
    targetUserID: string,
  ): Promise<Room> {
    const room = await this.mustGetRoom(roomID);
    if (actingUserID === targetUserID) {
      throw new RoomServiceError(`User ${actingUserID} cannot kick themself`);
    }
    if (!room.members.some((m) => m.userID === targetUserID)) {
      throw new RoomServiceError(
        `User ${targetUserID} is not a member of room ${roomID}`,
      );
    }
    await this.seats.releaseSeatsForUser(roomID, targetUserID);
    const members = room.members.filter((m) => m.userID !== targetUserID);
    await this.rooms.update(roomID, { members });
    return { ...room, members };
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
      // Always gameModule.maxPlayers engine seats, regardless of how many
      // are actually claimed -- renumbering claimed seats to a contiguous
      // 0..N-1 range to shrink this would be a much bigger platform
      // change (credentials, mid-game claimSeat, SeatSwitcher all assume
      // room seat number === boardgame.io playerID). `claimedSeatIDs`
      // below is how a game whose own rules depend on the real player
      // count (e.g. Love Letter's "last one standing" round-ending) tells
      // its own seats actually claimed at match-start time apart from
      // permanent, nobody-controls-them phantom seats.
      numPlayers: gameModule.maxPlayers,
      setupData: {
        ...room.gameSettings,
        claimedSeatIDs: claimedSeats.map((seat) => seat.playerID),
        // Snapshot of "who is host at match-start", not a live binding to
        // Room.hostUserID -- there's no host-transfer feature today, but
        // if one's ever added mid-match this would go stale for the rest
        // of the match. Used by games' round-confirm force-advance move
        // (packages/game-core/src/roundConfirm.ts) to authorize a host
        // seat to skip waiting on other players; null if the host hasn't
        // claimed a seat (a spectating host has no match credentials at
        // all, so they structurally can't call any move regardless).
        hostPlayerID: claimedSeats.find((seat) => seat.userID === room.hostUserID)?.playerID ?? null,
      },
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
      const matchID = room.currentMatchID;
      // Each seat's client tears down its presence socket as part of
      // leaving the match, which otherwise looks identical to that seat
      // dropping its connection -- clearing presence state here resets any
      // stale badge immediately, and markMatchEnded suppresses the
      // disconnect that's about to arrive for this matchID so it doesn't
      // restart a grace-period ("reconnecting") timer for players who are
      // still right here in the lobby.
      const seats = await this.seats.getSeatsForRoom(roomID);
      for (const seat of seats) {
        this.presenceManager?.clearSeat(roomID, matchID, seat.playerID);
      }
      this.presenceManager?.markMatchEnded(matchID);
      await this.storage.wipe(matchID);
    }
    await this.rooms.update(roomID, {
      currentMatchID: null,
      status: 'lobby',
    });
    return { ...room, currentMatchID: null, status: 'lobby' };
  }

  /**
   * Starts a fresh match with the room's same seats. With no
   * `gameSettings` override, the rest of the room's configuration
   * (selectedGameID/gameSettings -- endMatch never touches either, see its
   * own doc comment) is also unchanged: a same-level retry after a loss.
   * Exists because ctx.gameover (the game engine's own match-over signal)
   * is completely independent of room.status: nothing calls endMatch
   * automatically when a game's win condition fires, so the host would
   * otherwise have to click "End match" before a plain startMatch() call
   * would even be legal. This collapses that into one action.
   *
   * Passing `gameSettings` additionally persists them (validated exactly
   * like setGameSettings) before starting the new match -- this is what
   * lets a generic "start the next level, same seats" action (any game
   * whose settingsSchema exposes a numbered-progression field, e.g.
   * Crew's `level`) reuse this same endpoint after a win, rather than
   * requiring its own game-specific room action. The platform itself
   * never inspects what's inside `gameSettings`; it's just validated
   * against whatever schema the selected game declares, same as
   * setGameSettings.
   */
  async rematch(
    roomID: string,
    gameSettings?: Record<string, unknown>,
  ): Promise<{
    room: Room;
    credentialsByUserID: Map<string, SeatCredential[]>;
  }> {
    const room = await this.mustGetRoom(roomID);
    if (room.status === 'in_game') {
      await this.endMatch(roomID);
    }
    if (gameSettings !== undefined) {
      await this.validateAndPersistGameSettings(roomID, gameSettings);
    }
    return this.startMatch(roomID);
  }

  private async mustGetRoom(roomID: string): Promise<Room> {
    const room = await this.rooms.getById(roomID);
    if (!room) {
      throw new RoomServiceError(`Room ${roomID} not found`);
    }
    return room;
  }
}
