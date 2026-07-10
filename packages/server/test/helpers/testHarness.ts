import { createTestDb, type TestDb } from './testDb.js';
import { UserRepository } from '../../src/identity/userRepository.js';
import { SequelizeRoomRepository } from '../../src/rooms/roomRepository.js';
import { SeatService } from '../../src/rooms/seatService.js';
import { RoomService } from '../../src/rooms/roomService.js';
import { SqliteStorageAdapter } from '../../src/bgio/storage/sqliteStorageAdapter.js';
import type { GameModule } from '@tableverse/game-core';

export interface TestHarness {
  db: TestDb;
  users: UserRepository;
  rooms: SequelizeRoomRepository;
  seats: SeatService;
  roomService: RoomService;
  storage: SqliteStorageAdapter;
}

export async function createTestHarness(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gameModules: GameModule<any>[] = [],
): Promise<TestHarness> {
  const db = await createTestDb();
  const users = new UserRepository(db.models);
  const rooms = new SequelizeRoomRepository(db.models);
  const seats = new SeatService(db.models, rooms);
  const storage = new SqliteStorageAdapter(db.models);
  const getGameModule = (id: string) => gameModules.find((m) => m.id === id);
  const roomService = new RoomService(rooms, seats, users, storage, getGameModule);
  return { db, users, rooms, seats, roomService, storage };
}
