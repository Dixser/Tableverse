import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { Room } from '@tableverse/shared';
import { RoomShell } from './RoomShell.js';
import { roomApi } from '../api/roomApi.js';

vi.mock('../presence/usePresence.js', () => ({
  usePresence: () => ({}),
}));

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    roomID: 'room-1',
    inviteCode: 'ABC123',
    hostUserID: 'host-1',
    selectedGameID: null,
    currentMatchID: null,
    status: 'lobby',
    allowMultiSeat: false,
    gameSettings: {},
    members: [{ userID: 'host-1', role: 'host' }],
    ...overrides,
  };
}

describe('RoomShell', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the player list and invite code once the room loads', async () => {
    vi.spyOn(roomApi, 'getRoom').mockResolvedValue({
      room: makeRoom({
        members: [
          { userID: 'host-1', role: 'host' },
          { userID: 'guest-1', role: 'member' },
        ],
      }),
      seats: [],
      myCredentials: [],
    });

    render(
      <RoomShell
        user={{ id: 'host-1', displayName: 'Host', createdAt: '' }}
        sessionToken="tok"
        roomID="room-1"
      />,
    );

    await waitFor(() => screen.getByText('Room ABC123'));
    expect(screen.getByText(/You — host/)).toBeInTheDocument();
    expect(screen.getByText(/guest-1 — member/)).toBeInTheDocument();
  });

  it('shows a claim-seat form for a member (claimSeat is permitted) but hides host-only release for a member seat they do not manage', async () => {
    vi.spyOn(roomApi, 'getRoom').mockResolvedValue({
      room: makeRoom({
        status: 'in_game',
        members: [
          { userID: 'host-1', role: 'host' },
          { userID: 'guest-1', role: 'member' },
        ],
      }),
      seats: [{ roomID: 'room-1', playerID: '0', userID: 'guest-1', claimedAt: '' }],
      myCredentials: [],
    });

    render(
      <RoomShell
        user={{ id: 'guest-1', displayName: 'Guest', createdAt: '' }}
        sessionToken="tok"
        roomID="room-1"
      />,
    );

    await waitFor(() => screen.getByText('Room ABC123'));
    // A member has claimSeat/leaveSeat but not manageSeats -- no Release button.
    expect(screen.queryByText('Release')).not.toBeInTheDocument();
  });

  it('shows host-only controls (release, end match) for the host of an in-progress match', async () => {
    vi.spyOn(roomApi, 'getRoom').mockResolvedValue({
      room: makeRoom({ status: 'in_game' }),
      seats: [{ roomID: 'room-1', playerID: '0', userID: 'host-1', claimedAt: '' }],
      myCredentials: [],
    });

    render(
      <RoomShell
        user={{ id: 'host-1', displayName: 'Host', createdAt: '' }}
        sessionToken="tok"
        roomID="room-1"
      />,
    );

    await waitFor(() => screen.getByText('Room ABC123'));
    expect(screen.getByText('Release')).toBeInTheDocument();
  });

  it('surfaces a load error instead of throwing', async () => {
    vi.spyOn(roomApi, 'getRoom').mockRejectedValue(new Error('room not found'));

    render(
      <RoomShell
        user={{ id: 'host-1', displayName: 'Host', createdAt: '' }}
        sessionToken="tok"
        roomID="room-1"
      />,
    );

    await waitFor(() => screen.getByRole('alert'));
    expect(screen.getByRole('alert')).toHaveTextContent('room not found');
  });
});
