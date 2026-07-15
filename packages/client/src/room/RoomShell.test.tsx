import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Room } from '@tableverse/shared';
import { RoomShell } from './RoomShell.js';
import { roomApi } from '../api/roomApi.js';

vi.mock('../presence/usePresence.js', () => ({
  usePresence: () => ({}),
}));

// Captures the onChanged callback RoomShell passes in, so a test can invoke
// it directly to simulate a real /room-events 'roomChanged' push without
// needing an actual socket connection.
let capturedRoomEventsOnChanged: (() => void) | undefined;
vi.mock('../roomEvents/useRoomEvents.js', () => ({
  useRoomEvents: (_roomID: string | null, onChanged: () => void) => {
    capturedRoomEventsOnChanged = onChanged;
  },
}));

vi.mock('../chat/useChat.js', () => ({
  useChat: () => ({ messages: [], sendMessage: vi.fn() }),
}));

const SETTINGS_FIXTURE_GAME_ID = 'settings-fixture-v1';
// Mirrors Love Letter's real edition/player-count constraint (classic caps
// at 4) via the same validateSetupData hook getEffectiveMaxPlayers reads,
// so the seat-picker-shrinks-with-settings behavior can be exercised
// without depending on the real loveletter-v1 module's exact numbers.
const EDITION_CAP_GAME_ID = 'edition-cap-fixture-v1';

vi.mock('@tableverse/game-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tableverse/game-core')>();
  return {
    ...actual,
    getGameModule: (id: string) => {
      if (id === SETTINGS_FIXTURE_GAME_ID) {
        return {
          id: SETTINGS_FIXTURE_GAME_ID,
          displayName: 'Settings Fixture',
          minPlayers: 2,
          maxPlayers: 2,
          gameDef: {},
          settingsSchema: {
            type: 'object',
            properties: {
              edition: { type: 'string', enum: ['normal', 'classic'], default: 'normal' },
            },
            required: ['edition'],
          },
        };
      }
      if (id === EDITION_CAP_GAME_ID) {
        return {
          id: EDITION_CAP_GAME_ID,
          displayName: 'Edition Cap Fixture',
          minPlayers: 2,
          maxPlayers: 6,
          gameDef: {
            validateSetupData: (setupData: { edition?: string } | undefined, numPlayers: number) =>
              setupData?.edition === 'classic' && numPlayers > 4
                ? 'classic edition supports at most 4 players'
                : undefined,
          },
          settingsSchema: {
            type: 'object',
            properties: {
              edition: { type: 'string', enum: ['normal', 'classic'], default: 'normal' },
            },
          },
        };
      }
      return actual.getGameModule(id);
    },
  };
});

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
    capturedRoomEventsOnChanged = undefined;
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
      memberNames: {},
    });

    render(
      <RoomShell
        user={{ id: 'host-1', displayName: 'Host', createdAt: '' }}
        sessionToken="tok"
        roomID="room-1"
      />,
    );

    await waitFor(() => screen.getByText('Room ABC123'));
    expect(screen.getByText(/You — Host/)).toBeInTheDocument();
    expect(screen.getByText(/guest-1 — Member/)).toBeInTheDocument();
  });

  it('feature 017: a roomChanged event from useRoomEvents triggers a re-fetch of the room', async () => {
    const getRoom = vi.spyOn(roomApi, 'getRoom').mockResolvedValue({
      room: makeRoom(),
      seats: [],
      myCredentials: [],
      memberNames: {},
    });

    render(
      <RoomShell
        user={{ id: 'host-1', displayName: 'Host', createdAt: '' }}
        sessionToken="tok"
        roomID="room-1"
      />,
    );

    await waitFor(() => screen.getByText('Room ABC123'));
    expect(getRoom).toHaveBeenCalledTimes(1);

    capturedRoomEventsOnChanged?.();

    await waitFor(() => expect(getRoom).toHaveBeenCalledTimes(2));
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
      memberNames: {},
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
      memberNames: {},
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

  it('shows "Leave seat" only on the current user\'s own occupied seat, never on another user\'s seat', async () => {
    vi.spyOn(roomApi, 'getRoom').mockResolvedValue({
      room: makeRoom({
        status: 'in_game',
        members: [
          { userID: 'host-1', role: 'host' },
          { userID: 'guest-1', role: 'member' },
        ],
      }),
      seats: [
        { roomID: 'room-1', playerID: '0', userID: 'guest-1', claimedAt: '' },
        { roomID: 'room-1', playerID: '1', userID: 'host-1', claimedAt: '' },
      ],
      myCredentials: [],
      memberNames: {},
    });

    render(
      <RoomShell
        user={{ id: 'guest-1', displayName: 'Guest', createdAt: '' }}
        sessionToken="tok"
        roomID="room-1"
      />,
    );

    await waitFor(() => screen.getByText('Room ABC123'));
    const leaveButtons = screen.getAllByText('Leave seat');
    // Only guest-1's own seat (0) gets the button, not host-1's seat (1).
    expect(leaveButtons).toHaveLength(1);
    expect(leaveButtons[0]!.closest('li')).toHaveTextContent('Seat 1');
  });

  it('clicking "Leave seat" calls roomApi.leaveSeat with the current user\'s own playerID and refreshes', async () => {
    vi.spyOn(roomApi, 'getRoom').mockResolvedValue({
      room: makeRoom({ status: 'in_game' }),
      seats: [{ roomID: 'room-1', playerID: '0', userID: 'host-1', claimedAt: '' }],
      myCredentials: [],
      memberNames: {},
    });
    const leaveSeat = vi.spyOn(roomApi, 'leaveSeat').mockResolvedValue(undefined);

    render(
      <RoomShell
        user={{ id: 'host-1', displayName: 'Host', createdAt: '' }}
        sessionToken="tok"
        roomID="room-1"
      />,
    );

    await waitFor(() => screen.getByText('Room ABC123'));
    fireEvent.click(screen.getByText('Leave seat'));

    await waitFor(() =>
      expect(leaveSeat).toHaveBeenCalledWith('tok', 'room-1', '0'),
    );
  });

  it('surfaces a failed leaveSeat call via actionError without discarding the room chrome', async () => {
    vi.spyOn(roomApi, 'getRoom').mockResolvedValue({
      room: makeRoom({ status: 'in_game' }),
      seats: [{ roomID: 'room-1', playerID: '0', userID: 'host-1', claimedAt: '' }],
      myCredentials: [],
      memberNames: {},
    });
    vi.spyOn(roomApi, 'leaveSeat').mockRejectedValue(new Error('network error'));

    render(
      <RoomShell
        user={{ id: 'host-1', displayName: 'Host', createdAt: '' }}
        sessionToken="tok"
        roomID="room-1"
      />,
    );

    await waitFor(() => screen.getByText('Room ABC123'));
    fireEvent.click(screen.getByText('Leave seat'));

    const alert = await waitFor(() => screen.getByRole('alert'));
    expect(alert).toHaveTextContent('network error');
    expect(screen.getByText('Room ABC123')).toBeInTheDocument();
  });

  it('lets a host toggle allowMultiSeat from the lobby', async () => {
    vi.spyOn(roomApi, 'getRoom').mockResolvedValue({
      room: makeRoom(),
      seats: [],
      myCredentials: [],
      memberNames: {},
    });
    const setAllowMultiSeat = vi
      .spyOn(roomApi, 'setAllowMultiSeat')
      .mockResolvedValue({ room: makeRoom({ allowMultiSeat: true }) });

    render(
      <RoomShell
        user={{ id: 'host-1', displayName: 'Host', createdAt: '' }}
        sessionToken="tok"
        roomID="room-1"
      />,
    );

    await waitFor(() => screen.getByText('Room ABC123'));
    const checkbox = screen.getByRole('checkbox', {
      name: /allow multiple seats/i,
    });
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);

    await waitFor(() =>
      expect(setAllowMultiSeat).toHaveBeenCalledWith('tok', 'room-1', true),
    );
  });

  it('surfaces a failed seat claim without discarding the room chrome', async () => {
    vi.spyOn(roomApi, 'getRoom').mockResolvedValue({
      room: makeRoom({
        selectedGameID: 'tictactoe-v1',
        members: [
          { userID: 'host-1', role: 'host' },
          { userID: 'guest-1', role: 'member' },
        ],
      }),
      seats: [],
      myCredentials: [],
      memberNames: {},
    });
    vi.spyOn(roomApi, 'claimSeat').mockRejectedValue(
      new Error('Seat 0 in room room-1 is already claimed'),
    );

    render(
      <RoomShell
        user={{ id: 'host-1', displayName: 'Host', createdAt: '' }}
        sessionToken="tok"
        roomID="room-1"
      />,
    );

    await waitFor(() => screen.getByText('Room ABC123'));
    fireEvent.click(screen.getByText('Seat 1'));

    const alert = await waitFor(() => screen.getByRole('alert'));
    expect(alert).toHaveTextContent('already claimed');
    // The room chrome (heading, player list) must still be present -- a
    // failed action must not be treated like a failed load.
    expect(screen.getByText('Room ABC123')).toBeInTheDocument();
  });

  it('calls onSeatClaimed with the credential a mid-match claim returns', async () => {
    vi.spyOn(roomApi, 'getRoom').mockResolvedValue({
      room: makeRoom({ selectedGameID: 'tictactoe-v1' }),
      seats: [],
      myCredentials: [],
      memberNames: {},
    });
    const credential = { matchID: 'm-1', playerID: '0', credentials: 'cred-0' };
    vi.spyOn(roomApi, 'claimSeat').mockResolvedValue({
      assignment: { roomID: 'room-1', playerID: '0', userID: 'host-1', claimedAt: '' },
      credential,
    });
    const onSeatClaimed = vi.fn();

    render(
      <RoomShell
        user={{ id: 'host-1', displayName: 'Host', createdAt: '' }}
        sessionToken="tok"
        roomID="room-1"
        onSeatClaimed={onSeatClaimed}
      />,
    );

    await waitFor(() => screen.getByText('Room ABC123'));
    fireEvent.click(screen.getByText('Seat 1'));

    await waitFor(() => expect(onSeatClaimed).toHaveBeenCalledWith(credential));
  });

  it('renders exactly maxPlayers seat buttons for the selected game', async () => {
    vi.spyOn(roomApi, 'getRoom').mockResolvedValue({
      room: makeRoom({ selectedGameID: 'tictactoe-v1' }),
      seats: [],
      myCredentials: [],
      memberNames: {},
    });

    render(
      <RoomShell
        user={{ id: 'host-1', displayName: 'Host', createdAt: '' }}
        sessionToken="tok"
        roomID="room-1"
      />,
    );

    await waitFor(() => screen.getByText('Room ABC123'));
    // tictactoe-v1 has maxPlayers: 2 -- exactly playerIDs '0' and '1',
    // displayed 1-indexed as "Seat 1"/"Seat 2".
    expect(screen.getByText('Seat 1')).toBeInTheDocument();
    expect(screen.getByText('Seat 2')).toBeInTheDocument();
    expect(screen.queryByText('Seat 3')).not.toBeInTheDocument();
  });

  it('shrinks the seat picker to the effective max players when the current settings restrict it', async () => {
    vi.spyOn(roomApi, 'getRoom').mockResolvedValue({
      room: makeRoom({
        selectedGameID: EDITION_CAP_GAME_ID,
        gameSettings: { edition: 'classic' },
      }),
      seats: [],
      myCredentials: [],
      memberNames: {},
    });

    render(
      <RoomShell
        user={{ id: 'host-1', displayName: 'Host', createdAt: '' }}
        sessionToken="tok"
        roomID="room-1"
      />,
    );

    await waitFor(() => screen.getByText('Room ABC123'));
    // classic edition caps this fixture at 4 players, even though its
    // static maxPlayers is 6.
    expect(screen.getByText('Seat 4')).toBeInTheDocument();
    expect(screen.queryByText('Seat 5')).not.toBeInTheDocument();
  });

  it('shows all of maxPlayers seats again once the normal edition is selected', async () => {
    vi.spyOn(roomApi, 'getRoom').mockResolvedValue({
      room: makeRoom({
        selectedGameID: EDITION_CAP_GAME_ID,
        gameSettings: { edition: 'normal' },
      }),
      seats: [],
      myCredentials: [],
      memberNames: {},
    });

    render(
      <RoomShell
        user={{ id: 'host-1', displayName: 'Host', createdAt: '' }}
        sessionToken="tok"
        roomID="room-1"
      />,
    );

    await waitFor(() => screen.getByText('Room ABC123'));
    expect(screen.getByText('Seat 6')).toBeInTheDocument();
  });

  it('renders the game-select section (with its settings form) before the seats section', async () => {
    vi.spyOn(roomApi, 'getRoom').mockResolvedValue({
      room: makeRoom({
        selectedGameID: SETTINGS_FIXTURE_GAME_ID,
        gameSettings: { edition: 'normal' },
      }),
      seats: [],
      myCredentials: [],
      memberNames: {},
    });

    render(
      <RoomShell
        user={{ id: 'host-1', displayName: 'Host', createdAt: '' }}
        sessionToken="tok"
        roomID="room-1"
      />,
    );

    await waitFor(() => screen.getByText('Room ABC123'));
    const gameSection = screen.getByRole('region', { name: 'Game' });
    const seatsSection = screen.getByRole('region', { name: 'Seats' });
    // DOCUMENT_POSITION_FOLLOWING means gameSection comes before seatsSection.
    expect(gameSection.compareDocumentPosition(seatsSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The settings form lives inside the game section, not as a separate
    // top-level block after the seats section.
    expect(gameSection).toHaveTextContent('Game settings');
  });

  it('renders a taken seat as disabled and labeled with its occupant, and an open seat as clickable', async () => {
    vi.spyOn(roomApi, 'getRoom').mockResolvedValue({
      room: makeRoom({
        selectedGameID: 'tictactoe-v1',
        members: [
          { userID: 'host-1', role: 'host' },
          { userID: 'guest-1', role: 'member' },
        ],
      }),
      seats: [{ roomID: 'room-1', playerID: '0', userID: 'guest-1', claimedAt: '' }],
      myCredentials: [],
      memberNames: {},
    });

    render(
      <RoomShell
        user={{ id: 'host-1', displayName: 'Host', createdAt: '' }}
        sessionToken="tok"
        roomID="room-1"
      />,
    );

    await waitFor(() => screen.getByText('Room ABC123'));
    const buttons = screen.getAllByRole('button');
    const takenButton = buttons.find((b) => /Seat 1/.test(b.textContent ?? ''))!;
    expect(takenButton).toHaveTextContent('guest-1');
    expect(takenButton).toBeDisabled();
    const openButton = buttons.find((b) => b.textContent === 'Seat 2')!;
    expect(openButton).not.toBeDisabled();
  });

  it('renders no seat picker when the room has no selectedGameID', async () => {
    vi.spyOn(roomApi, 'getRoom').mockResolvedValue({
      room: makeRoom({ selectedGameID: null }),
      seats: [],
      myCredentials: [],
      memberNames: {},
    });

    render(
      <RoomShell
        user={{ id: 'host-1', displayName: 'Host', createdAt: '' }}
        sessionToken="tok"
        roomID="room-1"
      />,
    );

    await waitFor(() => screen.getByText('Room ABC123'));
    expect(screen.queryByText('Seat 1')).not.toBeInTheDocument();
  });

  it('shows "Leave room" only on a member\'s own row, never for the host', async () => {
    vi.spyOn(roomApi, 'getRoom').mockResolvedValue({
      room: makeRoom({
        members: [
          { userID: 'host-1', role: 'host' },
          { userID: 'guest-1', role: 'member' },
        ],
      }),
      seats: [],
      myCredentials: [],
      memberNames: {},
    });

    render(
      <RoomShell
        user={{ id: 'guest-1', displayName: 'Guest', createdAt: '' }}
        sessionToken="tok"
        roomID="room-1"
      />,
    );

    await waitFor(() => screen.getByText('Room ABC123'));
    const leaveRoomButtons = screen.getAllByText('Leave room');
    expect(leaveRoomButtons).toHaveLength(1);
    expect(leaveRoomButtons[0]!.closest('li')).toHaveTextContent('You');
  });

  it('never shows "Leave room" for the host viewing their own row', async () => {
    vi.spyOn(roomApi, 'getRoom').mockResolvedValue({
      room: makeRoom({
        members: [
          { userID: 'host-1', role: 'host' },
          { userID: 'guest-1', role: 'member' },
        ],
      }),
      seats: [],
      myCredentials: [],
      memberNames: {},
    });

    render(
      <RoomShell
        user={{ id: 'host-1', displayName: 'Host', createdAt: '' }}
        sessionToken="tok"
        roomID="room-1"
      />,
    );

    await waitFor(() => screen.getByText('Room ABC123'));
    expect(screen.queryByText('Leave room')).not.toBeInTheDocument();
  });

  it('shows "Kick" only for the host, only on other members\' rows', async () => {
    vi.spyOn(roomApi, 'getRoom').mockResolvedValue({
      room: makeRoom({
        members: [
          { userID: 'host-1', role: 'host' },
          { userID: 'guest-1', role: 'member' },
        ],
      }),
      seats: [],
      myCredentials: [],
      memberNames: {},
    });

    render(
      <RoomShell
        user={{ id: 'host-1', displayName: 'Host', createdAt: '' }}
        sessionToken="tok"
        roomID="room-1"
      />,
    );

    await waitFor(() => screen.getByText('Room ABC123'));
    const kickButtons = screen.getAllByText('Kick');
    expect(kickButtons).toHaveLength(1);
    expect(kickButtons[0]!.closest('li')).toHaveTextContent('guest-1');
  });

  it('a member never sees "Kick", even on another member\'s row', async () => {
    vi.spyOn(roomApi, 'getRoom').mockResolvedValue({
      room: makeRoom({
        members: [
          { userID: 'host-1', role: 'host' },
          { userID: 'guest-1', role: 'member' },
          { userID: 'guest-2', role: 'member' },
        ],
      }),
      seats: [],
      myCredentials: [],
      memberNames: {},
    });

    render(
      <RoomShell
        user={{ id: 'guest-1', displayName: 'Guest', createdAt: '' }}
        sessionToken="tok"
        roomID="room-1"
      />,
    );

    await waitFor(() => screen.getByText('Room ABC123'));
    expect(screen.queryByText('Kick')).not.toBeInTheDocument();
  });

  it('clicking "Leave room" calls roomApi.leaveRoom and invokes onLeftRoom on success', async () => {
    vi.spyOn(roomApi, 'getRoom').mockResolvedValue({
      room: makeRoom({
        members: [
          { userID: 'host-1', role: 'host' },
          { userID: 'guest-1', role: 'member' },
        ],
      }),
      seats: [],
      myCredentials: [],
      memberNames: {},
    });
    const leaveRoom = vi
      .spyOn(roomApi, 'leaveRoom')
      .mockResolvedValue({ room: makeRoom() });
    const onLeftRoom = vi.fn();

    render(
      <RoomShell
        user={{ id: 'guest-1', displayName: 'Guest', createdAt: '' }}
        sessionToken="tok"
        roomID="room-1"
        onLeftRoom={onLeftRoom}
      />,
    );

    await waitFor(() => screen.getByText('Room ABC123'));
    fireEvent.click(screen.getByText('Leave room'));

    await waitFor(() => expect(leaveRoom).toHaveBeenCalledWith('tok', 'room-1'));
    await waitFor(() => expect(onLeftRoom).toHaveBeenCalled());
  });

  it('clicking "Kick" calls roomApi.kickPlayer with the target userID and refreshes', async () => {
    vi.spyOn(roomApi, 'getRoom').mockResolvedValue({
      room: makeRoom({
        members: [
          { userID: 'host-1', role: 'host' },
          { userID: 'guest-1', role: 'member' },
        ],
      }),
      seats: [],
      myCredentials: [],
      memberNames: {},
    });
    const kickPlayer = vi
      .spyOn(roomApi, 'kickPlayer')
      .mockResolvedValue({ room: makeRoom({ members: [{ userID: 'host-1', role: 'host' }] }) });

    render(
      <RoomShell
        user={{ id: 'host-1', displayName: 'Host', createdAt: '' }}
        sessionToken="tok"
        roomID="room-1"
      />,
    );

    await waitFor(() => screen.getByText('Room ABC123'));
    fireEvent.click(screen.getByText('Kick'));

    await waitFor(() =>
      expect(kickPlayer).toHaveBeenCalledWith('tok', 'room-1', 'guest-1'),
    );
  });

  it('surfaces a failed kickPlayer call via actionError without discarding the room chrome', async () => {
    vi.spyOn(roomApi, 'getRoom').mockResolvedValue({
      room: makeRoom({
        members: [
          { userID: 'host-1', role: 'host' },
          { userID: 'guest-1', role: 'member' },
        ],
      }),
      seats: [],
      myCredentials: [],
      memberNames: {},
    });
    vi.spyOn(roomApi, 'kickPlayer').mockRejectedValue(new Error('cannot kick themself'));

    render(
      <RoomShell
        user={{ id: 'host-1', displayName: 'Host', createdAt: '' }}
        sessionToken="tok"
        roomID="room-1"
      />,
    );

    await waitFor(() => screen.getByText('Room ABC123'));
    fireEvent.click(screen.getByText('Kick'));

    const alert = await waitFor(() => screen.getByRole('alert'));
    expect(alert).toHaveTextContent('cannot kick themself');
    expect(screen.getByText('Room ABC123')).toBeInTheDocument();
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

  it('renders no settings form when the selected game has no settingsSchema (tictactoe-v1)', async () => {
    vi.spyOn(roomApi, 'getRoom').mockResolvedValue({
      room: makeRoom({ selectedGameID: 'tictactoe-v1' }),
      seats: [],
      myCredentials: [],
      memberNames: {},
    });

    render(
      <RoomShell
        user={{ id: 'host-1', displayName: 'Host', createdAt: '' }}
        sessionToken="tok"
        roomID="room-1"
      />,
    );

    await waitFor(() => screen.getByText('Room ABC123'));
    expect(screen.queryByText('Game settings')).not.toBeInTheDocument();
  });

  it('renders a settings form for a game with a settingsSchema, and submitting it calls roomApi.setGameSettings with the schema-declared fields', async () => {
    vi.spyOn(roomApi, 'getRoom').mockResolvedValue({
      room: makeRoom({ selectedGameID: SETTINGS_FIXTURE_GAME_ID, gameSettings: { edition: 'normal' } }),
      seats: [],
      myCredentials: [],
      memberNames: {},
    });
    const setGameSettings = vi
      .spyOn(roomApi, 'setGameSettings')
      .mockResolvedValue({ room: makeRoom({ selectedGameID: SETTINGS_FIXTURE_GAME_ID, gameSettings: { edition: 'classic' } }) });

    render(
      <RoomShell
        user={{ id: 'host-1', displayName: 'Host', createdAt: '' }}
        sessionToken="tok"
        roomID="room-1"
      />,
    );

    await waitFor(() => screen.getByText('Room ABC123'));
    expect(screen.getByText('Game settings')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'edition' }), {
      target: { value: 'classic' },
    });
    fireEvent.click(screen.getByText('Save settings'));

    await waitFor(() =>
      expect(setGameSettings).toHaveBeenCalledWith('tok', 'room-1', { edition: 'classic' }),
    );
  });
});
