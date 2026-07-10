import type { SeatPresenceStatus } from '@tableverse/shared';

const LABEL: Record<SeatPresenceStatus, string> = {
  connected: 'Connected',
  grace_period: 'Disconnected — reconnecting…',
  released: 'Disconnected — releasable',
};

export function PresenceBadge({ status }: { status: SeatPresenceStatus }) {
  return (
    <span data-status={status} role="status">
      {LABEL[status]}
    </span>
  );
}
