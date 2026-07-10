export type { User } from './user.js';
export type { Room, RoomStatus, RoomMember } from './room.js';
export type {
  SeatCredential,
  SeatCredentialStore,
} from './seatCredential.js';
export { SEAT_CREDENTIAL_STORAGE_KEY } from './seatCredential.js';
export type {
  SeatPresenceStatus,
  SeatAssignment,
  SeatPresence,
  SeatStatusChangedEvent,
} from './seat.js';
export type { RoomRole, RoomAction } from './permissions.js';
export { ROOM_PERMISSIONS, canPerform } from './permissions.js';
