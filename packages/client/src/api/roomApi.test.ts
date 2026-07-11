import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { roomApi, RoomApiError } from './roomApi.js';

describe('roomApi', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('createRoom sends the session token header and parses the JSON body', async () => {
    const room = { roomID: 'r1' };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ room }),
    });

    const result = await roomApi.createRoom('tok-1');

    expect(result).toEqual({ room });
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toContain('/api/rooms');
    expect((init.headers as Record<string, string>)['x-session-token']).toBe(
      'tok-1',
    );
  });

  it('throws RoomApiError with the server error message on a non-ok response', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: 'not permitted: manageSeats' }),
    });

    await expect(roomApi.releaseSeat('tok-1', 'r1', '0')).rejects.toMatchObject({
      message: 'not permitted: manageSeats',
      status: 403,
    });
  });

  it('leaveSeat resolves to undefined on a 204 response', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: async () => ({}),
    });

    await expect(roomApi.leaveSeat('tok-1', 'r1', '0')).resolves.toBeUndefined();
  });

  it('leaveRoom posts to /leave and parses the returned room', async () => {
    const room = { roomID: 'r1', members: [] };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ room }),
    });

    const result = await roomApi.leaveRoom('tok-1', 'r1');

    expect(result).toEqual({ room });
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toContain('/api/rooms/r1/leave');
    expect(init.method).toBe('POST');
  });

  it('kickPlayer posts targetUserID to /kick and parses the returned room', async () => {
    const room = { roomID: 'r1', members: [] };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ room }),
    });

    const result = await roomApi.kickPlayer('tok-1', 'r1', 'user-2');

    expect(result).toEqual({ room });
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toContain('/api/rooms/r1/kick');
    expect(JSON.parse(init.body as string)).toEqual({ targetUserID: 'user-2' });
  });

  it('RoomApiError instances carry the HTTP status', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({}),
    });
    try {
      await roomApi.getRoom('bad-token', 'r1');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(RoomApiError);
      expect((err as RoomApiError).status).toBe(401);
    }
  });
});
