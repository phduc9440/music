import { t } from '../../../i18n/core';
import type { LiveParticipant } from '../../../types';
import type { LiveState } from './LiveSession';
import { colorOf, initialsOf } from './presence';
import './live.css';

const MAX_SHOWN = 5;

interface Props {
  state: LiveState;
  /** Bấm vào ảnh đại diện của một người: cuộn tới ô nhịp họ đang ở (từ 0). */
  onJump?: (measureIndex: number) => void;
}

/** Vị trí của một người: ô đang chọn, hoặc ô đầu tiên họ giữ khóa; null nếu chưa chọn gì. */
const whereOf = (p: LiveParticipant, state: LiveState): { from: number; to: number } | null => {
  if (p.selection) return { from: p.selection.from, to: p.selection.to };
  const held = (state.locks?.locks ?? []).filter((l) => l.sessionId === p.sessionId).map((l) => l.measureIndex);
  return held.length > 0 ? { from: Math.min(...held), to: Math.max(...held) } : null;
};

/**
 * Những người đang cùng sửa, như hàng ảnh đại diện trên Google Docs: mỗi người một màu (trùng màu viền ô họ đang ở
 * trên bản nhạc), chấm sáng khi họ đang sửa, rê chuột xem họ đang ở ô nào, bấm vào để cuộn tới chỗ đó.
 */
export default function LiveBar({ state, onJump }: Props) {
  // Mình đứng cuối hàng (như Google Docs), người khác theo thứ tự vào phiên
  const others = state.participants.filter((p) => p.sessionId !== state.selfSessionId);
  const self = state.participants.find((p) => p.sessionId === state.selfSessionId);
  const ordered = self ? [...others, self] : others;
  const shown = ordered.slice(0, MAX_SHOWN);
  const hidden = ordered.slice(MAX_SHOWN);
  const editingIds = new Set((state.locks?.locks ?? []).map((l) => l.sessionId));
  if (state.locks?.wholeHolder) editingIds.add(state.locks.wholeHolder);

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
        {shown.map((p) => {
          const isSelf = p.sessionId === state.selfSessionId;
          const where = whereOf(p, state);
          const place = where
            ? where.from === where.to
              ? t('live.presence.atMeasure', { n: where.from + 1 })
              : t('live.presence.atMeasures', { from: where.from + 1, to: where.to + 1 })
            : t('live.presence.idle');
          const name = isSelf ? t('live.you', { name: p.name }) : p.name;
          const title = `${name} · ${editingIds.has(p.sessionId) ? t('live.presence.editing') : place}`;
          const canJump = !isSelf && !!where && !!onJump;
          return (
            <button
              key={p.sessionId}
              type="button"
              className={`live-avatar${isSelf ? ' is-self' : ''}${editingIds.has(p.sessionId) ? ' is-editing' : ''}`}
              data-color={colorOf(p)}
              title={canJump ? `${title} — ${t('live.presence.jump')}` : title}
              aria-label={title}
              disabled={!canJump}
              onClick={() => where && onJump?.(where.from)}
            >
              {p.avatarUrl ? <img src={p.avatarUrl} alt="" /> : <span>{initialsOf(p.name)}</span>}
            </button>
          );
        })}
        {hidden.length > 0 && (
          <span className="live-avatar live-avatar--more" title={hidden.map((p) => p.name).join(', ')}>
            +{hidden.length}
          </span>
        )}
      </span>
      <span className={`live-status is-${state.status}`}>
        <span className="live-status__dot" aria-hidden="true" />
        {label}
      </span>
    </div>
  );
}
