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

  it('host can do everything a member can, plus host-only actions', () => {
    for (const action of ROOM_PERMISSIONS.member) {
      expect(canPerform('host', action)).toBe(true);
    }
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
