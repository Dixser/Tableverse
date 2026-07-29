import { useTranslation } from 'react-i18next';
import { ThemeToggle } from '../theme/ThemeToggle.js';
import { LanguageToggle } from '../i18n/LanguageToggle.js';
import styles from './SettingsSection.module.css';

/**
 * Language + theme controls, factored out of App.tsx's old always-fixed
 * ThemeToggle/LanguageToggle so the same content can be embedded in both
 * RoomShell's own drawer (in-room) and AppMenu's drawer (pre-room) --
 * one settings location, reachable via each screen's own menu button,
 * instead of floating corner buttons layered on top of everything else.
 */
export function SettingsSection() {
  const { t } = useTranslation();
  return (
    <section className={styles.section} aria-label={t('settingsSection.title')}>
      <h2 className={styles.title}>{t('settingsSection.title')}</h2>
      <div className={styles.row}>
        <LanguageToggle />
        <ThemeToggle />
      </div>
    </section>
  );
}
