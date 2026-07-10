import { afterEach, describe, expect, it } from 'vitest';
import { getInviteCodeFromLocation, setHomeUrl, setRoomUrl } from './routing.js';

describe('routing', () => {
  afterEach(() => {
    window.history.pushState(null, '', '/');
  });

  it('getInviteCodeFromLocation extracts the code from /room/:inviteCode', () => {
    window.history.pushState(null, '', '/room/ABC123');
    expect(getInviteCodeFromLocation()).toBe('ABC123');
  });

  it('getInviteCodeFromLocation returns null for any other path', () => {
    window.history.pushState(null, '', '/');
    expect(getInviteCodeFromLocation()).toBeNull();
    window.history.pushState(null, '', '/room/');
    expect(getInviteCodeFromLocation()).toBeNull();
  });

  it('setRoomUrl updates the path to /room/:inviteCode', () => {
    setRoomUrl('XYZ789');
    expect(window.location.pathname).toBe('/room/XYZ789');
  });

  it('setHomeUrl resets the path to /', () => {
    setRoomUrl('ABC123');
    setHomeUrl();
    expect(window.location.pathname).toBe('/');
  });
});
