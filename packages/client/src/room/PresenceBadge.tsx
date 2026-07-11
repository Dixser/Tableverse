import type { SeatPresenceStatus } from '@tableverse/shared';
import styles from './PresenceBadge.module.css';

const LABEL: Record<SeatPresenceStatus, string> = {
  connected: 'Connected',
  grace_period: 'Disconnected — reconnecting…',
  released: 'Disconnected — releasable',
};

export function PresenceBadge({ status }: { status: SeatPresenceStatus }) {
  return (
    <span className={styles[status]} data-status={status} role="status">
      {LABEL[status]}
    </span>
  );
}
