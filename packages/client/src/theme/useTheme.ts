import { useCallback, useState } from 'react';

const STORAGE_KEY = 'tableverse:theme';

export type Theme = 'light' | 'dark';

export interface ThemeState {
  /** The user's explicit override, or null if following the OS preference (per spec.md's non-goals, no UI is built to set this back to null -- exposed for completeness/testability, not wired to a control). */
  theme: Theme | null;
  setTheme: (theme: Theme) => void;
}

function readStored(): Theme | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : null;
}

/**
 * Owns all reads/writes of the stored theme override *after* first paint.
 * The inline script in index.html's <head> handles applying a stored
 * override before React ever renders (avoiding a flash of the wrong
 * theme) -- this hook re-reads the same key on mount so the two never
 * disagree, and is the only thing that writes it afterward.
 */
export function useTheme(): ThemeState {
  const [theme, setThemeState] = useState<Theme | null>(readStored);

  const setTheme = useCallback((next: Theme) => {
    localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.dataset.theme = next;
    setThemeState(next);
  }, []);

  return { theme, setTheme };
}
