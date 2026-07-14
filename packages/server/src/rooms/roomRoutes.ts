import Router from '@koa/router';
import bodyParser from 'koa-bodyparser';
import { canPerform, type Room, type RoomAction } from '@tableverse/shared';
import type { Context } from 'koa';
import type { UserRepository } from '../identity/userRepository.js';
import { requireSession } from '../identity/sessionMiddleware.js';
import type { RoomRepository } from './roomRepository.js';
import { SeatClaimError, type SeatService } from './seatService.js';
import { RoomServiceError, type RoomService } from './roomService.js';
import { getRoleInRoom } from './roomAccess.js';

export interface RoomEventsBroadcaster {
  roomChanged(roomID: string): void;
}

export interface RoomRoutesDeps {
  users: UserRepository;
  rooms: RoomRepository;
  seats: SeatService;
  roomService: RoomService;
  roomEvents: RoomEventsBroadcaster;
}

function getBody<T>(ctx: Context): T {
  return ctx.request.body as T;
}

function param(ctx: Context, name: string): string {
  const value = ctx.params[name];
  if (!value) {
    throw new Error(`Route param "${name}" was not populated by the router`);
  }
  return value;
}

/**
 * Every handler below calls canPerform() as its first statement (after
 * loading the room, which is needed to know the actor's role) before
 * delegating to roomService/seatService, per plan.md's permissions
 * enforcement design. No permission logic is duplicated in the service
 * layer — it trusts the router already checked.
 */
async function authorize(
  ctx: Context,
  deps: RoomRoutesDeps,
  roomID: string,
  action: RoomAction,
): Promise<Room | null> {
  const room = await deps.rooms.getById(roomID);
  if (!room) {
    ctx.status = 404;
    ctx.body = { error: 'room not found' };
    return null;
  }
  const role = getRoleInRoom(room, ctx.state.user!.id);
  if (!role || !canPerform(role, action)) {
    ctx.status = 403;
    ctx.body = { error: `not permitted: ${action}` };
    return null;
  }
  return room;
}

export function createRoomRouter(deps: RoomRoutesDeps): Router {
  const router = new Router({ prefix: '/api/rooms' });
  router.use(bodyParser());
  router.use(requireSession(deps.users));

  router.post('/', async (ctx) => {
    const room = await deps.roomService.createRoom(ctx.state.user!.id);
    ctx.body = { room };
  });

  router.post('/join', async (ctx) => {
    const { inviteCode } = getBody<{ inviteCode?: string }>(ctx);
    if (!inviteCode) {
      ctx.status = 400;
      ctx.body = { error: 'inviteCode is required' };
      return;
    }
    try {
      const room = await deps.roomService.joinRoom(
        inviteCode,
        ctx.state.user!.id,
      );
      deps.roomEvents.roomChanged(room.roomID);
      ctx.body = { room };
    } catch (err) {
      ctx.status = 404;
      ctx.body = { error: (err as Error).message };
    }
  });

  router.get('/:roomID', async (ctx) => {
    const room = await deps.rooms.getById(param(ctx, 'roomID'));
    if (!room) {
      ctx.status = 404;
      ctx.body = { error: 'room not found' };
      return;
    }
    const seats = await deps.seats.getSeatsForRoom(room.roomID);
    const myCredentials = await deps.roomService.getMyCredentials(
      room.roomID,
      ctx.state.user!.id,
    );
    ctx.body = { room, seats, myCredentials };
  });

  router.post('/:roomID/seats/:playerID/claim', async (ctx) => {
    const room = await authorize(ctx, deps, param(ctx, 'roomID'), 'claimSeat');
    if (!room) return;
    try {
      const { assignment, credential } = await deps.roomService.claimSeat(
        room.roomID,
        param(ctx, 'playerID'),
        ctx.state.user!.id,
      );
      deps.roomEvents.roomChanged(room.roomID);
      ctx.body = { assignment, credential };
    } catch (err) {
      if (err instanceof SeatClaimError) {
        ctx.status = 409;
        ctx.body = { error: err.message };
        return;
      }
      throw err;
    }
  });

  router.post('/:roomID/seats/:playerID/leave', async (ctx) => {
    const room = await authorize(ctx, deps, param(ctx, 'roomID'), 'leaveSeat');
    if (!room) return;
    await deps.seats.leaveSeat(room.roomID, param(ctx, 'playerID'));
    deps.roomEvents.roomChanged(room.roomID);
    ctx.status = 204;
  });

  router.post('/:roomID/seats/:playerID/release', async (ctx) => {
    const room = await authorize(
      ctx,
      deps,
      param(ctx, 'roomID'),
      'manageSeats',
    );
    if (!room) return;
    await deps.seats.releaseSeat(room.roomID, param(ctx, 'playerID'));
    deps.roomEvents.roomChanged(room.roomID);
    ctx.status = 204;
  });

  router.post('/:roomID/leave', async (ctx) => {
    const room = await authorize(ctx, deps, param(ctx, 'roomID'), 'leaveRoom');
    if (!room) return;
    const updated = await deps.roomService.leaveRoom(room.roomID, ctx.state.user!.id);
    deps.roomEvents.roomChanged(room.roomID);
    ctx.body = { room: updated };
  });

  router.post('/:roomID/kick', async (ctx) => {
    const room = await authorize(ctx, deps, param(ctx, 'roomID'), 'kickPlayer');
    if (!room) return;
    const { targetUserID } = getBody<{ targetUserID?: string }>(ctx);
    if (!targetUserID) {
      ctx.status = 400;
      ctx.body = { error: 'targetUserID is required' };
      return;
    }
    try {
      const updated = await deps.roomService.kickPlayer(
        room.roomID,
        ctx.state.user!.id,
        targetUserID,
      );
      deps.roomEvents.roomChanged(room.roomID);
      ctx.body = { room: updated };
    } catch (err) {
      ctx.status = 409;
      ctx.body = { error: (err as RoomServiceError).message };
    }
  });

  router.post('/:roomID/settings', async (ctx) => {
    const room = await authorize(
      ctx,
      deps,
      param(ctx, 'roomID'),
      'editRoomSettings',
    );
    if (!room) return;
    const { allowMultiSeat, gameSettings } = getBody<{
      allowMultiSeat?: boolean;
      gameSettings?: Record<string, unknown>;
    }>(ctx);
    let updated = room;
    if (typeof allowMultiSeat === 'boolean') {
      updated = await deps.roomService.setAllowMultiSeat(
        room.roomID,
        allowMultiSeat,
      );
    }
    if (gameSettings !== undefined) {
      try {
        updated = await deps.roomService.setGameSettings(
          room.roomID,
          gameSettings,
        );
      } catch (err) {
        ctx.status = 400;
        ctx.body = { error: (err as RoomServiceError).message };
        return;
      }
    }
    deps.roomEvents.roomChanged(room.roomID);
    ctx.body = { room: updated };
  });

  router.post('/:roomID/game', async (ctx) => {
    const room = await authorize(ctx, deps, param(ctx, 'roomID'), 'changeGame');
    if (!room) return;
    const { gameID } = getBody<{ gameID?: string }>(ctx);
    if (!gameID) {
      ctx.status = 400;
      ctx.body = { error: 'gameID is required' };
      return;
    }
    try {
      const updated = await deps.roomService.changeGame(room.roomID, gameID);
      deps.roomEvents.roomChanged(room.roomID);
      ctx.body = { room: updated };
    } catch (err) {
      ctx.status = 409;
      ctx.body = { error: (err as RoomServiceError).message };
    }
  });

  router.post('/:roomID/start', async (ctx) => {
    const room = await authorize(ctx, deps, param(ctx, 'roomID'), 'startMatch');
    if (!room) return;
    try {
      const result = await deps.roomService.startMatch(room.roomID);
      deps.roomEvents.roomChanged(room.roomID);
      ctx.body = {
        room: result.room,
        credentialsByUserID: Object.fromEntries(result.credentialsByUserID),
      };
    } catch (err) {
      ctx.status = 409;
      ctx.body = { error: (err as RoomServiceError).message };
    }
  });

  router.post('/:roomID/end', async (ctx) => {
    const room = await authorize(ctx, deps, param(ctx, 'roomID'), 'endMatch');
    if (!room) return;
    try {
      const updated = await deps.roomService.endMatch(room.roomID);
      deps.roomEvents.roomChanged(room.roomID);
      ctx.body = { room: updated };
    } catch (err) {
      ctx.status = 409;
      ctx.body = { error: (err as RoomServiceError).message };
    }
  });

  return router;
}
