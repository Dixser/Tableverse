import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { JSONSchema } from '@tableverse/game-core';
import { SettingsForm } from './SettingsForm.js';

describe('SettingsForm', () => {
  const enumSchema: JSONSchema = {
    type: 'object',
    properties: {
      edition: { type: 'string', enum: ['normal', 'classic'], default: 'normal' },
    },
    required: ['edition'],
  };

  it('renders a single select control with enum options in declaration order, pre-selected to the current value', () => {
    render(
      <SettingsForm schema={enumSchema} value={{ edition: 'classic' }} onSubmit={vi.fn()} />,
    );
    const select = screen.getByRole('combobox');
    expect(select).toHaveValue('classic');
    const options = screen.getAllByRole('option').map((o) => (o as HTMLOptionElement).value);
    expect(options).toEqual(['normal', 'classic']);
  });

  it('pre-selects the schema default when no current value is present', () => {
    render(<SettingsForm schema={enumSchema} value={{}} onSubmit={vi.fn()} />);
    expect(screen.getByRole('combobox')).toHaveValue('normal');
  });

  it('renders nothing for a schema with no declared properties', () => {
    const { container } = render(
      <SettingsForm schema={{ type: 'object' }} value={{}} onSubmit={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('submitting calls onSubmit with exactly the schema-declared fields\' current values', () => {
    const onSubmit = vi.fn();
    render(<SettingsForm schema={enumSchema} value={{ edition: 'normal' }} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'classic' } });
    fireEvent.click(screen.getByRole('button'));

    expect(onSubmit).toHaveBeenCalledWith({ edition: 'classic' });
  });

  it('shows an inline validation error and does not call onSubmit when the local value fails the schema', () => {
    const onSubmit = vi.fn();
    const numberSchema: JSONSchema = {
      type: 'object',
      properties: { count: { type: 'number' } },
    };
    render(<SettingsForm schema={numberSchema} value={{}} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByRole('alert')).toHaveTextContent('"count" must be a number');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('coerces a numeric enum (e.g. a level picker) back to a number on change, not a select\'s native string', () => {
    const onSubmit = vi.fn();
    const levelSchema: JSONSchema = {
      type: 'object',
      properties: { level: { type: 'number', enum: [1, 2, 3], default: 1 } },
      required: ['level'],
    };
    render(<SettingsForm schema={levelSchema} value={{ level: 1 }} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button'));

    expect(onSubmit).toHaveBeenCalledWith({ level: 3 });
  });

  it('uses a boolean property\'s current value on a checkbox control', () => {
    const boolSchema: JSONSchema = {
      type: 'object',
      properties: { allowUndo: { type: 'boolean', title: 'Allow undo' } },
    };
    render(<SettingsForm schema={boolSchema} value={{ allowUndo: true }} onSubmit={vi.fn()} />);
    expect(screen.getByText('Allow undo')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeChecked();
  });
});
