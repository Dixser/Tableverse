import { describe, expect, it } from 'vitest';
import { getNextLevelGameSettings } from './nextLevelGameSettings.js';
import type { JSONSchema } from './types.js';

describe('getNextLevelGameSettings', () => {
  const levelSchema: JSONSchema = {
    type: 'object',
    properties: { level: { type: 'number', enum: [1, 2, 3], default: 1 } },
    required: ['level'],
  };

  it('advances to the next higher enum value, preserving other settings', () => {
    expect(getNextLevelGameSettings(levelSchema, { level: 1, allowUndo: true })).toEqual({
      level: 2,
      allowUndo: true,
    });
  });

  it('returns null once already at the schema\'s maximum', () => {
    expect(getNextLevelGameSettings(levelSchema, { level: 3 })).toBeNull();
  });

  it('returns null when there is no level field at all', () => {
    const noLevelSchema: JSONSchema = { type: 'object', properties: { edition: { type: 'string' } } };
    expect(getNextLevelGameSettings(noLevelSchema, { edition: 'classic' })).toBeNull();
  });

  it('returns null when level is not a number-typed enum', () => {
    const stringLevel: JSONSchema = {
      type: 'object',
      properties: { level: { type: 'string', enum: ['a', 'b'] } },
    };
    expect(getNextLevelGameSettings(stringLevel, { level: 'a' })).toBeNull();
  });

  it('returns null when the current value is not a recognized number', () => {
    expect(getNextLevelGameSettings(levelSchema, {})).toBeNull();
  });

  it('finds the next higher value even over a non-contiguous enum', () => {
    const sparse: JSONSchema = { type: 'object', properties: { level: { type: 'number', enum: [1, 5, 10] } } };
    expect(getNextLevelGameSettings(sparse, { level: 5 })).toEqual({ level: 10 });
  });

  it('returns undefined schema safely', () => {
    expect(getNextLevelGameSettings(undefined, { level: 1 })).toBeNull();
  });
});
