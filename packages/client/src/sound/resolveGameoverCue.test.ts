import { describe, expect, it } from 'vitest';
import { resolveGameoverCue } from './resolveGameoverCue.js';

describe('resolveGameoverCue', () => {
  it('returns null while the match is still in progress', () => {
    expect(resolveGameoverCue(undefined, '0')).toBeNull();
    expect(resolveGameoverCue(null, '0')).toBeNull();
  });

  it('returns draw for an explicit draw, regardless of seat', () => {
    expect(resolveGameoverCue({ draw: true }, '0')).toBe('draw');
    expect(resolveGameoverCue({ draw: true }, '3')).toBe('draw');
  });

  it('returns win for the single winner and lose for everyone else', () => {
    expect(resolveGameoverCue({ winner: '0' }, '0')).toBe('win');
    expect(resolveGameoverCue({ winner: '0' }, '1')).toBe('lose');
  });

  it('handles a multi-winner array on both sides', () => {
    expect(resolveGameoverCue({ winner: ['0', '2'] }, '2')).toBe('win');
    expect(resolveGameoverCue({ winner: ['0', '2'] }, '1')).toBe('lose');
  });

  it('reads the cooperative loss shape ({} -- no winner, not a draw) as lose', () => {
    // themind and regicide both encode a co-op loss this way; it is
    // indistinguishable from an unrecognized object, so it must not be
    // treated as malformed.
    expect(resolveGameoverCue({}, '0')).toBe('lose');
  });

  it('reads an empty winner array as lose', () => {
    expect(resolveGameoverCue({ winner: [] }, '0')).toBe('lose');
  });

  it('returns null for a spectator, whatever the outcome', () => {
    expect(resolveGameoverCue({ winner: '0' }, null)).toBeNull();
    expect(resolveGameoverCue({ draw: true }, null)).toBeNull();
    expect(resolveGameoverCue({}, null)).toBeNull();
  });

  it('returns null rather than throwing for a non-object gameover', () => {
    expect(resolveGameoverCue('game over', '0')).toBeNull();
    expect(resolveGameoverCue(42, '0')).toBeNull();
    expect(resolveGameoverCue(true, '0')).toBeNull();
  });

  it('prefers draw over winner when a game somehow sets both', () => {
    expect(resolveGameoverCue({ draw: true, winner: '1' }, '0')).toBe('draw');
  });
});
