import { useTheme } from './useTheme.js';
import styles from './ThemeToggle.module.css';

/**
 * Always-visible chrome control (rendered once at the App level, never
 * inside a BoardComponent -- see tech-stack.md's chrome/board split and
 * plan.md's placement decision). Cycles dark -> light -> dark; an unset
 * (OS-following) theme is treated as the "dark" side of the cycle, since
 * the platform's unconditional :root default is dark.
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
