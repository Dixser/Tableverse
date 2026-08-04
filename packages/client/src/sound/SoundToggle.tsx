import { useTranslation } from 'react-i18next';
import { useSoundSettings } from './useSoundSettings.js';
import styles from './SoundToggle.module.css';

/**
 * Rendered inside the Settings menu (see SettingsSection), reachable from
 * both AppMenu (pre-room) and RoomShell's own drawer (in-room) -- never
 * inside a BoardComponent (tech-stack.md's chrome/board split), and never
 * as a room-level setting, since this is a per-user client preference like
 * theme and language rather than shared match configuration.
 */
export function SoundToggle() {
  const { t } = useTranslation();
  const { settings, setEnabled, setVolume } = useSoundSettings();

  return (
    <div className={styles.control}>
      <label className={styles.row}>
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        {t('sound.label')}
      </label>
      <label className={styles.row}>
        <span className={styles.volumeLabel}>{t('sound.volume')}</span>
        <input
          className={styles.slider}
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.volume}
          // Nothing to adjust while muted -- the control stays visible so
          // the previous level is still readable, rather than vanishing.
          disabled={!settings.enabled}
          onChange={(e) => setVolume(Number(e.target.value))}
        />
      </label>
    </div>
  );
}
