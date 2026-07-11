import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LanguageToggle } from './LanguageToggle.js';
import i18n from './i18n.js';

describe('LanguageToggle', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.lang = 'en';
    void i18n.changeLanguage('en');
  });

  it('renders an option for every supported language', () => {
    render(<LanguageToggle />);
    expect(screen.getByRole('option', { name: 'English' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Español' })).toBeInTheDocument();
  });

  it('selects the current language by default (en, no stored preference, en-US browser)', () => {
    render(<LanguageToggle />);
    expect(screen.getByRole('combobox')).toHaveValue('en');
  });

  it('switching the select changes the active language, localStorage, and document.lang', () => {
    render(<LanguageToggle />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'es' } });

    expect(screen.getByRole('combobox')).toHaveValue('es');
    expect(localStorage.getItem('tableverse:language')).toBe('es');
    expect(document.documentElement.lang).toBe('es');
    expect(i18n.language).toBe('es');
  });
});
