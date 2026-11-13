import { t } from '../../../i18n/core';
import { Avatar } from '../../ui';
import type { LiveState } from './LiveSession';
import './live.css';

const MAX_SHOWN = 5;

interface Props {
  state: LiveState;
}

/** Những người đang cùng sửa (màu trùng với viền ô họ giữ) và trạng thái đồng bộ. */
export default function LiveBar({ state }: Props) {
  const shown = state.participants.slice(0, MAX_SHOWN);
  const extra = state.participants.length - shown.length;
  const label =
    state.status === 'offline'
      ? t('live.status.offline')
      : state.status === 'connecting'
        ? t('live.status.connecting')
        : state.status === 'syncing'
          ? t('live.status.syncing', { count: state.pending })
          : t('live.status.synced');
  return (
    <div className="live-bar" role="status" aria-live="polite">
      <span className="live-avatars">
        {shown.map((p) => (
          <span
            key={p.sessionId}
            className="live-avatar"
            data-color={p.colorIndex}
            title={p.sessionId === state.selfSessionId ? t('live.you', { name: p.name }) : p.name}
          >
            <Avatar name={p.name} size={24} />
          </span>
        ))}
        {extra > 0 && <span className="live-status">+{extra}</span>}
      </span>
      <span className={`live-status${state.status === 'offline' ? ' is-offline' : ''}`}>{label}</span>
    </div>
  );
}
