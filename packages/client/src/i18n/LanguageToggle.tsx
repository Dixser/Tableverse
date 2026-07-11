import { useTranslation } from 'react-i18next';
import { useLanguage } from './useLanguage.js';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from './i18n.js';
import styles from './LanguageToggle.module.css';

// A language's own name is shown in that language, not translated -- a
// Spanish-reading user still sees "English" as an option, matching how
// mainstream language pickers work.
const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: 'English',
  es: 'Español',
};

/**
 * Always-visible chrome control (rendered once at the App level, never
 * inside a BoardComponent), structurally mirroring ThemeToggle/useTheme --
 * see plan.md's placement decision in spec/features/010-i18n-support.
 */
export function LanguageToggle() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  return (
    <select
      className={styles.toggle}
      aria-label={t('languageToggle.ariaLabel')}
      value={language}
      onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
    >
      {SUPPORTED_LANGUAGES.map((lang) => (
        <option key={lang} value={lang}>
          {LANGUAGE_LABELS[lang]}
        </option>
      ))}
    </select>
  );
}
