import { useTheme } from './useTheme.js';
import styles from './ThemeToggle.module.css';

/**
 * Rendered inside the Settings menu (see SettingsSection), reachable from
 * both AppMenu (pre-room) and RoomShell's own drawer (in-room) -- never
 * inside a BoardComponent (tech-stack.md's chrome/board split). Cycles
 * dark -> light -> dark; an unset (OS-following) theme is treated as the
 * "dark" side of the cycle, since the platform's unconditional :root
 * default is dark.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const next = theme === 'light' ? 'dark' : 'light';
  return (
    <button
      className={styles.toggle}
      type="button"
      onClick={() => setTheme(next)}
    >
      {next === 'light' ? 'Switch to light' : 'Switch to dark'}
    </button>
  );
}
