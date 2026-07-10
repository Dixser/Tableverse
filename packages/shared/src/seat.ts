export type SeatPresenceStatus = 'connected' | 'grace_period' | 'released';

export interface SeatAssignment {
  roomID: string;
  playerID: string;
  userID: string;
  claimedAt: string;
}

export interface SeatPresence {
  matchID: string;
  playerID: string;
  status: SeatPresenceStatus;
}

export interface SeatStatusChangedEvent {
  type: 'seatStatusChanged';
  roomID: string;
  playerID: string;
  status: SeatPresenceStatus;
}
