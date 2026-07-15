import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './RoomDrawer.module.css';

export interface RoomDrawerProps {
  open: boolean;
  onClose: () => void;
  children?: React.ReactNode;
}

/**
 * Room-management chrome (game picker, Players, Seats) as an on-demand
 * overlay instead of permanent page real estate -- see
 * spec/020-layout-restructure. Always an overlay (backdrop + fixed left
 * panel), never a layout push, at every viewport size: this is what makes
 * the board container's bounding box stay constant regardless of drawer
 * state. Always mounted; toggled via CSS transform + `inert`, not
 * JSX-unmounted, so host/seat actions inside it don't need remounting and
 * a closed drawer's content still exists for RoomShell's own tests to act
 * on directly.
 */
export function RoomDrawer({ open, onClose, children }: RoomDrawerProps) {
  const { t } = useTranslation();
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // `inert` keeps closed-drawer content out of the tab order and the
  // accessibility tree -- set imperatively since @types/react (18.3) has
  // no `inert` JSX prop yet, even though the DOM attribute itself is
  // broadly supported.
  useEffect(() => {
    const el = drawerRef.current;
    if (!el) return;
    if (open) el.removeAttribute('inert');
    else el.setAttribute('inert', '');
  }, [open]);

  return (
    <>
      {open && <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />}
      <div
        ref={drawerRef}
        className={styles.drawer}
        data-open={open}
        aria-label={t('room.drawerTitle')}
      >
        {children}
      </div>
    </>
  );
}
