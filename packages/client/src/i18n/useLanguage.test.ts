import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useLanguage } from './useLanguage.js';
import i18n from './i18n.js';

describe('useLanguage', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.lang = 'en';
    void i18n.changeLanguage('en');
    vi.unstubAllGlobals();
  });

  it('defaults to en when nothing is stored and the browser language is unsupported', () => {
    vi.stubGlobal('navigator', { language: 'fr-FR' });
    const { result } = renderHook(() => useLanguage());
    expect(result.current.language).toBe('en');
  });

  it('detects a supported browser language when nothing is stored', () => {
    vi.stubGlobal('navigator', { language: 'es-MX' });
    const { result } = renderHook(() => useLanguage());
    expect(result.current.language).toBe('es');
  });

  it('initializes from a pre-existing stored value over browser detection', () => {
    localStorage.setItem('tableverse:language', 'es');
    vi.stubGlobal('navigator', { language: 'en-US' });
    const { result } = renderHook(() => useLanguage());
    expect(result.current.language).toBe('es');
  });

  it('ignores a garbage stored value and falls back to detection', () => {
    localStorage.setItem('tableverse:language', 'not-a-language');
    vi.stubGlobal('navigator', { language: 'en-US' });
    const { result } = renderHook(() => useLanguage());
    expect(result.current.language).toBe('en');
  });

  it('setLanguage writes localStorage, sets document.documentElement.lang, and changes i18next language', () => {
    const { result } = renderHook(() => useLanguage());

    act(() => result.current.setLanguage('es'));

    expect(result.current.language).toBe('es');
    expect(localStorage.getItem('tableverse:language')).toBe('es');
    expect(document.documentElement.lang).toBe('es');
    expect(i18n.language).toBe('es');
  });

  it('setLanguage overwrites a previous choice', () => {
    const { result } = renderHook(() => useLanguage());

    act(() => result.current.setLanguage('es'));
    act(() => result.current.setLanguage('en'));

    expect(result.current.language).toBe('en');
    expect(localStorage.getItem('tableverse:language')).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });
});
