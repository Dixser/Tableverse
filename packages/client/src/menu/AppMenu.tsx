import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RoomDrawer } from '../room/RoomDrawer.js';
import { SettingsSection } from './SettingsSection.js';
import styles from './AppMenu.module.css';

/**
 * Pre-room counterpart to RoomShell's own drawer: same overlay primitive
 * (RoomDrawer), same Settings content (SettingsSection), so language/theme
 * live in one consistent menu location whether or not the user has
 * entered a room yet -- rendered by App.tsx only while no room is active,
 * since once a room is active RoomShell's drawer already carries the same
 * Settings section (see RoomShell.tsx).
 */
export function AppMenu() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className={styles.toggle}
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {t('menu.toggle')}
      </button>
      <RoomDrawer open={open} onClose={() => setOpen(false)} ariaLabel={t('menu.title')}>
        <SettingsSection />
      </RoomDrawer>
    </>
  );
}
