import { useCallback, useState } from 'react';
import i18n, { SUPPORTED_LANGUAGES, type SupportedLanguage } from './i18n.js';

const STORAGE_KEY = 'tableverse:language';

function isSupported(value: string): value is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

function detectInitialLanguage(): SupportedLanguage {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && isSupported(stored)) return stored;
  const browserLang = navigator.language.slice(0, 2);
  return isSupported(browserLang) ? browserLang : 'en';
}

function applyLanguage(lang: SupportedLanguage) {
  document.documentElement.lang = lang;
  // Skip when already applied -- LanguageToggle now mounts at more than
  // one place across a session (AppMenu pre-room, RoomShell in-room), so
  // this initializer re-runs on every remount, not just once per app
  // load. Without this guard, a same-value changeLanguage() still fires
  // i18next's languageChanged event, which triggers other useTranslation
  // consumers (e.g. RoomShell) to update while LanguageToggle itself is
  // still rendering -- React's "Cannot update a component while
  // rendering a different component" warning.
  if (i18n.language !== lang) void i18n.changeLanguage(lang);
}

export interface LanguageState {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
}

/**
 * Mirrors theme/useTheme.ts's shape exactly: a plain hook (no Context), a
 * dedicated localStorage key, and a direct DOM attribute write (`lang`
 * here, `dataset.theme` there) alongside the i18next language switch --
 * index.html's inline pre-paint script reads the same key before React's
 * first render, so this hook's initial detectInitialLanguage() call must
 * never disagree with what that script already applied.
 */
export function useLanguage(): LanguageState {
  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    const initial = detectInitialLanguage();
    applyLanguage(initial);
    return initial;
  });

  const setLanguage = useCallback((lang: SupportedLanguage) => {
    localStorage.setItem(STORAGE_KEY, lang);
    applyLanguage(lang);
    setLanguageState(lang);
  }, []);

  return { language, setLanguage };
}
