import type { JSONSchema } from './types.js';

export interface SettingsValidationError {
  field: string;
  message: string;
}

export function validateGameSettings(
  schema: JSONSchema,
  value: Record<string, unknown>,
): SettingsValidationError[] {
  const errors: SettingsValidationError[] = [];
  const properties = schema.properties ?? {};
  for (const key of Object.keys(value)) {
    if (!(key in properties)) {
      errors.push({ field: key, message: `Unknown field "${key}"` });
    }
  }
  for (const requiredField of schema.required ?? []) {
    if (!(requiredField in value)) {
      errors.push({ field: requiredField, message: `"${requiredField}" is required` });
    }
  }
  for (const [key, propSchema] of Object.entries(properties)) {
    if (!(key in value)) continue;
    const v = value[key];
    if (propSchema.type === 'boolean' && typeof v !== 'boolean') {
      errors.push({ field: key, message: `"${key}" must be a boolean` });
    } else if (propSchema.type === 'number' && typeof v !== 'number') {
      errors.push({ field: key, message: `"${key}" must be a number` });
    } else if (propSchema.type === 'string' && typeof v !== 'string') {
      errors.push({ field: key, message: `"${key}" must be a string` });
    } else if (propSchema.enum && !propSchema.enum.includes(v)) {
      errors.push({ field: key, message: `"${key}" must be one of ${JSON.stringify(propSchema.enum)}` });
    }
  }
  return errors;
}
