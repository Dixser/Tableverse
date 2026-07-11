import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useTheme } from './useTheme.js';

describe('useTheme', () => {
  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it('starts with theme: null when nothing is stored', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBeNull();
  });

  it('initializes from a pre-existing stored value', () => {
    localStorage.setItem('tableverse:theme', 'light');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
  });

  it('ignores a garbage stored value', () => {
    localStorage.setItem('tableverse:theme', 'not-a-theme');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBeNull();
  });

  it('setTheme writes localStorage and sets document.documentElement.dataset.theme', () => {
    const { result } = renderHook(() => useTheme());

    act(() => result.current.setTheme('dark'));

    expect(result.current.theme).toBe('dark');
    expect(localStorage.getItem('tableverse:theme')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('setTheme overwrites a previous choice', () => {
    const { result } = renderHook(() => useTheme());

    act(() => result.current.setTheme('light'));
    act(() => result.current.setTheme('dark'));

    expect(result.current.theme).toBe('dark');
    expect(localStorage.getItem('tableverse:theme')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
