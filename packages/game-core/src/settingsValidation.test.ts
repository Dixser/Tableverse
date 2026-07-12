import { describe, expect, it } from 'vitest';
import { validateGameSettings } from './settingsValidation.js';
import type { JSONSchema } from './types.js';

describe('validateGameSettings', () => {
  const enumSchema: JSONSchema = {
    type: 'object',
    properties: {
      edition: { type: 'string', enum: ['normal', 'classic'], default: 'normal' },
    },
    required: ['edition'],
  };

  it('passes a value inside the declared enum', () => {
    expect(validateGameSettings(enumSchema, { edition: 'classic' })).toEqual([]);
  });

  it('fails a value outside the declared enum, identifying the field', () => {
    const errors = validateGameSettings(enumSchema, { edition: 'deluxe' });
    expect(errors).toEqual([
      { field: 'edition', message: '"edition" must be one of ["normal","classic"]' },
    ]);
  });

  it('rejects a non-boolean value for a boolean property', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: { allowUndo: { type: 'boolean' } },
    };
    const errors = validateGameSettings(schema, { allowUndo: 'yes' });
    expect(errors).toEqual([{ field: 'allowUndo', message: '"allowUndo" must be a boolean' }]);
  });

  it('rejects a non-number value for a number property', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: { rounds: { type: 'number' } },
    };
    const errors = validateGameSettings(schema, { rounds: 'three' });
    expect(errors).toEqual([{ field: 'rounds', message: '"rounds" must be a number' }]);
  });

  it('rejects a non-string value for a string property', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: { name: { type: 'string' } },
    };
    const errors = validateGameSettings(schema, { name: 42 });
    expect(errors).toEqual([{ field: 'name', message: '"name" must be a string' }]);
  });

  it('fails when a required property is missing from the submitted value', () => {
    const errors = validateGameSettings(enumSchema, {});
    expect(errors).toEqual([{ field: 'edition', message: '"edition" is required' }]);
  });

  it('rejects a key not declared in the schema properties, with no silent pass-through', () => {
    const errors = validateGameSettings(enumSchema, { edition: 'normal', extra: true });
    expect(errors).toEqual([{ field: 'extra', message: 'Unknown field "extra"' }]);
  });

  it('a schema with no declared properties rejects any submitted key', () => {
    const errors = validateGameSettings({ type: 'object' }, { anything: true });
    expect(errors).toEqual([{ field: 'anything', message: 'Unknown field "anything"' }]);
  });

  it('passes an empty value against a schema with no declared properties or required fields', () => {
    expect(validateGameSettings({ type: 'object' }, {})).toEqual([]);
  });
});
