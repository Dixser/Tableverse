export interface SeatCredential {
  matchID: string;
  playerID: string;
  credentials: string;
}

export type SeatCredentialStore = SeatCredential[];

export const SEAT_CREDENTIAL_STORAGE_KEY = 'tableverse:seatCredentials';
