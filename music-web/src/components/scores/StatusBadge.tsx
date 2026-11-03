import { STATUS_LABELS } from '../../utils/score';
import type { ProcessingStatus } from '../../types';

export default function StatusBadge({ status }: { status: ProcessingStatus }) {
  const running = status === 'PROCESSING' || status === 'PENDING';
  return (
    <span className={`sc-status sc-status--${status.toLowerCase()}`}>
      <span className={`sc-status__dot ${running ? 'is-pulsing' : ''}`} />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
