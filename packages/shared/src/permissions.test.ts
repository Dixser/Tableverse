import { describe, expect, it } from 'vitest';
import {
  ROOM_PERMISSIONS,
  canPerform,
  type RoomAction,
  type RoomRole,
} from './permissions.js';

const ALL_ROLES: RoomRole[] = ['host', 'member'];
const ALL_ACTIONS: RoomAction[] = [
  'changeGame',
  'kickPlayer',
  'manageSeats',
  'startMatch',
  'endMatch',
  'editRoomSettings',
  'claimSeat',
  'leaveSeat',
  'leaveRoom',
];

describe('canPerform', () => {
  for (const role of ALL_ROLES) {
    for (const action of ALL_ACTIONS) {
      const expected = ROOM_PERMISSIONS[role].has(action);
      it(`${role} performing ${action} -> ${expected}`, () => {
        expect(canPerform(role, action)).toBe(expected);
      });
    }
  }

  it('host can do everything a member can except leaveRoom, plus host-only actions', () => {
    // leaveRoom is the one deliberate exception to "host is a superset of
    // member" -- the host cannot leave the room (feature 007's resolved
    // decision, no succession logic exists), asserted separately below.
    for (const action of ROOM_PERMISSIONS.member) {
      if (action === 'leaveRoom') continue;
      expect(canPerform('host', action)).toBe(true);
    }
  });

  it('the host cannot leaveRoom, even though a member can', () => {
    expect(canPerform('member', 'leaveRoom')).toBe(true);
    expect(canPerform('host', 'leaveRoom')).toBe(false);
  });

  it('member cannot perform any host-only action', () => {
    const hostOnly = [...ROOM_PERMISSIONS.host].filter(
      (a) => !ROOM_PERMISSIONS.member.has(a),
    );
    expect(hostOnly.length).toBeGreaterThan(0);
    for (const action of hostOnly) {
      expect(canPerform('member', action)).toBe(false);
    }
  });

  it('returns false for a role with no entry in the map', () => {
    expect(canPerform('spectator' as RoomRole, 'claimSeat')).toBe(false);
  });
});
