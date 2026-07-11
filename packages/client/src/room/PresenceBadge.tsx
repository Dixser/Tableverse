import { useTranslation } from 'react-i18next';
import type { SeatPresenceStatus } from '@tableverse/shared';
import styles from './PresenceBadge.module.css';

const LABEL_KEY: Record<SeatPresenceStatus, string> = {
  connected: 'presence.connected',
  grace_period: 'presence.gracePeriod',
  released: 'presence.released',
};

export function PresenceBadge({ status }: { status: SeatPresenceStatus }) {
  const { t } = useTranslation();
  return (
    <span className={styles[status]} data-status={status} role="status">
      {t(LABEL_KEY[status])}
    </span>
  );
}
