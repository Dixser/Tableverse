import Router from '@koa/router';
import bodyParser from 'koa-bodyparser';
import cors from '@koa/cors';
import { gamesCatalog } from '@tableverse/game-core';
import { createSequelize } from './db/sequelize.js';
import { defineModels } from './db/models.js';
import { UserRepository } from './identity/userRepository.js';
import { resolveOrCreateSession } from './identity/session.js';
import { SequelizeRoomRepository } from './rooms/roomRepository.js';
import { SeatService } from './rooms/seatService.js';
import { RoomService } from './rooms/roomService.js';
import { createRoomRouter } from './rooms/roomRoutes.js';
import { SqliteStorageAdapter } from './bgio/storage/sqliteStorageAdapter.js';
import { createBgioServer } from './bgio/serverConfig.js';
import { createPresenceSystem } from './presence/presenceChannel.js';

const PORT = Number(process.env.PORT ?? 8000);
const DB_STORAGE = process.env.DB_STORAGE ?? './tableverse.sqlite3';
const CLIENT_ORIGINS = (process.env.CLIENT_ORIGINS ?? 'http://localhost:5173').split(',');

function createIdentityRouter(users: UserRepository): Router {
  const router = new Router({ prefix: '/api' });
  router.use(bodyParser());
  router.post('/identity', async (ctx) => {
    const { sessionToken, displayName } = ctx.request.body as {
      sessionToken?: string;
      displayName?: string;
    };
    try {
      const result = await resolveOrCreateSession(users, {
        sessionToken,
        displayName,
      });
      ctx.body = result;
    } catch (err) {
      ctx.status = 400;
      ctx.body = { error: (err as Error).message };
    }
  });
  return router;
}

async function main(): Promise<void> {
  const sequelize = createSequelize(DB_STORAGE);
  const models = defineModels(sequelize);
  await sequelize.sync();

  const users = new UserRepository(models);
  const rooms = new SequelizeRoomRepository(models);
  const seats = new SeatService(models, rooms);
  const storage = new SqliteStorageAdapter(models);
  const roomService = new RoomService(rooms, seats, users, storage, (id) =>
    gamesCatalog.find((m) => m.id === id),
  );

  const identityRouter = createIdentityRouter(users);
  const roomRouter = createRoomRouter({ users, rooms, seats, roomService });

  // Room/identity routes are mounted onto the SAME Koa app boardgame.io's
  // own Server() builds internally, as a separate route tree — this file
  // is the only place that wires the two together, per plan.md.
  const bgio = createBgioServer(gamesCatalog, storage, CLIENT_ORIGINS);
  // boardgame.io's own CORS setup only reliably covers its own Lobby API
  // routes -- it does not set Access-Control-Allow-Origin on the actual
  // (non-preflight) response for routes registered afterward, verified by
  // curling with an Origin header and finding the header simply absent.
  // Our own routers need their own explicit CORS middleware.
  bgio.app.use(
    cors({
      origin: (ctx) => {
        const requestOrigin = ctx.get('Origin');
        return CLIENT_ORIGINS.includes(requestOrigin)
          ? requestOrigin
          : (CLIENT_ORIGINS[0] ?? '');
      },
    }),
  );
  bgio.app.use(identityRouter.routes());
  bgio.app.use(identityRouter.allowedMethods());
  bgio.app.use(roomRouter.routes());
  bgio.app.use(roomRouter.allowedMethods());

  const { appServer } = await bgio.run(PORT);

  // Presence gets its own Socket.IO namespace on a distinct engine.io path
  // (/presence-socket), sharing the same underlying HTTP server as
  // boardgame.io's own transport but never sharing its channel.
  const { presenceManager } = createPresenceSystem(appServer, undefined, CLIENT_ORIGINS);
  roomService.setPresenceManager(presenceManager);

  // eslint-disable-next-line no-console
  console.log(`Tableverse server listening on :${PORT}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
