import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { validateGameSettings, type JSONSchema } from '@tableverse/game-core';
import styles from './SettingsForm.module.css';

export interface SettingsFormProps {
  schema: JSONSchema;
  value: Record<string, unknown>;
  onSubmit: (next: Record<string, unknown>) => void;
  disabled?: boolean;
}

/**
 * Pure function of (schema, value, onChange) -- no fetch/API call inside
 * it. `RoomShell` owns the actual `roomApi` call, same division of
 * responsibility every other `RoomShell` control already follows.
 * Renders nothing (not even an empty <section>) when the schema declares
 * no properties, per spec.md AC9 -- a game with no settingsSchema is
 * expected to never reach this component in the first place (RoomShell
 * only renders it when `selectedModule?.settingsSchema` is present), but
 * this component stays defensive on its own terms too.
 */
export function SettingsForm({ schema, value, onSubmit, disabled }: SettingsFormProps) {
  const { t } = useTranslation();
  const properties = Object.entries(schema.properties ?? {});
  const [draft, setDraft] = useState<Record<string, unknown>>(() => initialDraft(schema, value));
  const [errorsByField, setErrorsByField] = useState<Record<string, string>>({});

  if (properties.length === 0) return null;

  const setField = (key: string, next: unknown) => {
    setDraft((prev) => ({ ...prev, [key]: next }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateGameSettings(schema, draft);
    if (errors.length > 0) {
      const byField: Record<string, string> = {};
      for (const error of errors) {
        byField[error.field] = error.message;
      }
      setErrorsByField(byField);
      return;
    }
    setErrorsByField({});
    onSubmit(draft);
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h2 className={styles.title}>{t('settingsForm.title')}</h2>
      {properties.map(([key, propSchema]) => {
        const label = typeof propSchema.title === 'string' ? propSchema.title : key;
        return (
          <div className={styles.field} key={key}>
            <label className={styles.label}>
              {label}
              {renderControl(key, propSchema, draft[key], setField, disabled)}
            </label>
            {errorsByField[key] && (
              <p className={styles.fieldError} role="alert">
                {errorsByField[key]}
              </p>
            )}
          </div>
        );
      })}
      <button className={styles.button} type="submit" disabled={disabled}>
        {t('settingsForm.save')}
      </button>
    </form>
  );
}

function initialDraft(
  schema: JSONSchema,
  value: Record<string, unknown>,
): Record<string, unknown> {
  const draft: Record<string, unknown> = {};
  for (const [key, propSchema] of Object.entries(schema.properties ?? {})) {
    draft[key] = value[key] ?? propSchema.default ?? '';
  }
  return draft;
}

function renderControl(
  key: string,
  propSchema: JSONSchema,
  currentValue: unknown,
  setField: (key: string, next: unknown) => void,
  disabled?: boolean,
) {
  if (propSchema.enum) {
    return (
      <select
        className={styles.select}
        value={String(currentValue ?? '')}
        disabled={disabled}
        // A <select>'s value is always a string, but validateGameSettings
        // requires typeof v === 'number' whenever propSchema.type is
        // 'number' -- coerce back so a numeric enum (e.g. a level picker)
        // doesn't fail validation on every submit.
        onChange={(e) => setField(key, propSchema.type === 'number' ? Number(e.target.value) : e.target.value)}
      >
        {propSchema.enum.map((option) => (
          <option key={String(option)} value={String(option)}>
            {String(option)}
          </option>
        ))}
      </select>
    );
  }
  if (propSchema.type === 'boolean') {
    return (
      <input
        type="checkbox"
        checked={Boolean(currentValue)}
        disabled={disabled}
        onChange={(e) => setField(key, e.target.checked)}
      />
    );
  }
  if (propSchema.type === 'number') {
    return (
      <input
        className={styles.input}
        type="number"
        value={currentValue === '' ? '' : Number(currentValue)}
        disabled={disabled}
        onChange={(e) => setField(key, e.target.value === '' ? '' : Number(e.target.value))}
      />
    );
  }
  return (
    <input
      className={styles.input}
      type="text"
      value={String(currentValue ?? '')}
      disabled={disabled}
      onChange={(e) => setField(key, e.target.value)}
    />
  );
}
