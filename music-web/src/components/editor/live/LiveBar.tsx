import { t } from '../../../i18n/core';
import type { LiveParticipant } from '../../../types';
import type { LiveState } from './LiveSession';
import { colorOf, displayName, initialsOf } from './presence';
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
 * trên bản nhạc), chấm sáng khi họ đang sửa, rê chuột xem họ đang ở ô nào, bấm vào để cuộn tới chỗ đó. Chỉ hiện khi có
 * người khác (tài khoản khác) đang mở bài; chỉ có mình thì để trống, trừ khi mất kết nối.
 */
export default function LiveBar({ state, onJump }: Props) {
  const editingIds = new Set((state.locks?.locks ?? []).map((l) => l.sessionId));
  if (state.locks?.wholeHolder) editingIds.add(state.locks.wholeHolder);
  // Một người mở nhiều tab chỉ hiện một ảnh đại diện (C-04): gộp theo memberId, ưu tiên tab của mình / tab đang sửa
  const self = state.participants.find((p) => p.sessionId === state.selfSessionId);
  const groups = new Map<string, LiveParticipant[]>();
  for (const p of state.participants) {
    const key = p.memberId ?? p.sessionId;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const people = [...groups.values()].map((sessions) => {
    const main =
      sessions.find((p) => p.sessionId === state.selfSessionId) ??
      sessions.find((p) => editingIds.has(p.sessionId)) ??
      sessions[0];
    return { main, tabs: sessions.length, editing: sessions.some((p) => editingIds.has(p.sessionId)) };
  });
  // Mình đứng cuối hàng (như Google Docs), người khác theo thứ tự vào phiên
  const selfKey = self ? (self.memberId ?? self.sessionId) : null;
  const ordered = [
    ...people.filter((x) => (x.main.memberId ?? x.main.sessionId) !== selfKey),
    ...people.filter((x) => (x.main.memberId ?? x.main.sessionId) === selfKey),
  ];
  const shown = ordered.slice(0, MAX_SHOWN);
  const hidden = ordered.slice(MAX_SHOWN);
  // Chỉ mình mình (kể cả mở nhiều tab cùng một tài khoản): không có ai cùng xem/sửa nên không hiện gì. Riêng lúc mất
  // kết nối vẫn báo, vì khi đó thay đổi chưa tới được server.
  const alone = ordered.every((x) => (x.main.memberId ?? x.main.sessionId) === selfKey);
  if (alone && state.status !== 'offline') return null;

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
      {!alone && (
        <span className="live-avatars">
          {shown.map(({ main: p, tabs, editing }) => {
            const isSelf = p.sessionId === state.selfSessionId;
            const where = whereOf(p, state);
            const place = where
              ? where.from === where.to
                ? t('live.presence.atMeasure', { n: where.from + 1 })
                : t('live.presence.atMeasures', { from: where.from + 1, to: where.to + 1 })
              : t('live.presence.idle');
            const base = isSelf ? t('live.you', { name: displayName(p) }) : displayName(p);
            const name = tabs > 1 ? `${base} (${t('live.presence.tabs', { n: tabs })})` : base;
            const title = `${name} · ${editing ? t('live.presence.editing') : place}`;
            const canJump = !isSelf && !!where && !!onJump;
            return (
              <button
                key={p.sessionId}
                type="button"
                className={`live-avatar${isSelf ? ' is-self' : ''}${editing ? ' is-editing' : ''}`}
                data-color={colorOf(p)}
                title={canJump ? `${title} — ${t('live.presence.jump')}` : title}
                aria-label={title}
                disabled={!canJump}
                onClick={() => where && onJump?.(where.from)}
              >
                {p.avatarUrl ? <img src={p.avatarUrl} alt="" /> : <span>{initialsOf(displayName(p))}</span>}
              </button>
            );
          })}
          {hidden.length > 0 && (
            <span
              className="live-avatar live-avatar--more"
              title={hidden.map(({ main }) => displayName(main)).join(', ')}
            >
              +{hidden.length}
            </span>
          )}
        </span>
      )}
      <span className={`live-status is-${state.status}`}>
        <span className="live-status__dot" aria-hidden="true" />
        {label}
      </span>
    </div>
  );
}
