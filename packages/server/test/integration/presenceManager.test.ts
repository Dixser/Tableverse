import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PresenceManager } from '../../src/presence/presenceManager.js';
import type { SeatStatusChangedEvent } from '@tableverse/shared';

describe('PresenceManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('AC10: disconnect transitions the seat to grace_period and broadcasts on the presence channel only', () => {
    const events: SeatStatusChangedEvent[] = [];
    const manager = new PresenceManager((e) => events.push(e), 60_000);

    manager.handleDisconnect('room-1', 'match-1', '0');

    expect(manager.getStatus('match-1', '0')).toBe('grace_period');
    expect(events).toEqual([
      {
        type: 'seatStatusChanged',
        roomID: 'room-1',
        playerID: '0',
        status: 'grace_period',
      },
    ]);
  });

  it('AC11: reconnecting before the grace period elapses cancels the timer and returns to connected', () => {
    const events: SeatStatusChangedEvent[] = [];
    const manager = new PresenceManager((e) => events.push(e), 60_000);

    manager.handleDisconnect('room-1', 'match-1', '0');
    vi.advanceTimersByTime(30_000); // halfway through the grace period
    manager.handleReconnect('room-1', 'match-1', '0');

    expect(manager.getStatus('match-1', '0')).toBe('connected');

    // Let the original timer's full duration elapse -- it must NOT fire,
    // since handleReconnect cancelled it.
    vi.advanceTimersByTime(60_000);
    expect(manager.getStatus('match-1', '0')).toBe('connected');

    expect(events.map((e) => e.status)).toEqual(['grace_period', 'connected']);
  });

  it('AC12: if the grace period elapses without reconnection, the seat becomes released-eligible but the manager never auto-frees the underlying seat assignment', () => {
    const events: SeatStatusChangedEvent[] = [];
    const manager = new PresenceManager((e) => events.push(e), 60_000);

    manager.handleDisconnect('room-1', 'match-1', '0');
    vi.advanceTimersByTime(60_000);

    expect(manager.getStatus('match-1', '0')).toBe('released');
    expect(events.map((e) => e.status)).toEqual(['grace_period', 'released']);
    // Freeing the room_seats row is a separate, host-only manageSeats
    // action (seatService.releaseSeat, covered in roomRoutes.test.ts's
    // AC13/18 case) -- PresenceManager only tracks connection status and
    // has no reference to seat assignments at all.
  });

  it('tracks multiple seats independently', () => {
    const events: SeatStatusChangedEvent[] = [];
    const manager = new PresenceManager((e) => events.push(e), 60_000);

    manager.handleDisconnect('room-1', 'match-1', '0');
    manager.handleDisconnect('room-1', 'match-1', '1');
    manager.handleReconnect('room-1', 'match-1', '0');

    expect(manager.getStatus('match-1', '0')).toBe('connected');
    expect(manager.getStatus('match-1', '1')).toBe('grace_period');
  });
});
