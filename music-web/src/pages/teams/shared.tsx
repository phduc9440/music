import { formatDate, t } from '../../i18n/core';
import { useState } from 'react';
import type { RestorableItem, ShowItemStatus, ShowStatus, TeamMember, TeamRole } from '../../types';
import { daysUntil, memberName } from './teamUtils';

/**
 * Danh sách team / show đã xóa mềm còn khôi phục được (30 ngày): tên, ai xóa lúc nào, hạn khôi phục và nút Khôi phục.
 * {@code onRestore} tự báo lỗi / thành công; trả về true nếu đã khôi phục (danh sách do nơi gọi tải lại).
 */
export function RestorableList({
  title,
  hint,
  items,
  onRestore,
}: {
  title: string;
  hint: string;
  items: RestorableItem[];
  onRestore: (item: RestorableItem) => Promise<boolean>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  if (items.length === 0) return null;
  return (
    <section className="tm-section" aria-label={title}>
      <div className="tm-section__head">
        <h2>{title}</h2>
      </div>
      <p className="tm-muted">{hint}</p>
      <ul className="tm-list">
        {items.map((item) => (
          <li key={item.id} className="tm-row">
            <div className="tm-row__main">
              <span className="tm-row__title">{item.name}</span>
              <span className="tm-row__sub">
                {[
                  t('teams.trash.deletedOn', { date: formatDate(item.deletedAt) }),
                  item.deletedByName,
                  t('teams.trash.until', { date: formatDate(item.restorableUntil) }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
            <div className="tm-row__actions">
              <button
                type="button"
                className="sc-btn"
                disabled={busyId === item.id}
                onClick={async () => {
                  setBusyId(item.id);
                  await onRestore(item);
                  setBusyId(null);
                }}
              >
                {t('teams.trash.restore')}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Nhãn vai trò trong team. */
export function RoleBadge({ role }: { role: TeamRole }) {
  return <span className={`tm-badge tm-badge--${role}`}>{t(`teams.roles.${role}`)}</span>;
}

/** Nhãn trạng thái bài trong show hoặc trạng thái show. */
export function StatusBadge({ status }: { status: ShowItemStatus | ShowStatus }) {
  const key = status === 'PREPARING' || status === 'DONE' ? `teams.showStatus.${status}` : `teams.status.${status}`;
  return <span className={`tm-badge tm-badge--${status}`}>{t(key)}</span>;
}

/**
 * Hạn của bài: tô vàng khi còn 2 ngày trở xuống, đỏ khi quá hạn (bài đã duyệt thì không tô). `now` truyền từ trang
 * (lấy một lần lúc tải) để không gọi Date.now khi vẽ.
 */
export function DueDate({ date, done, now }: { date?: string | null; done?: boolean; now: number }) {
  if (!date) return <span className="tm-muted">{t('teams.item.noDue')}</span>;
  const days = daysUntil(date, now);
  const tone = done ? '' : days < 0 ? ' tm-due--late' : days <= 2 ? ' tm-due--soon' : '';
  const text =
    done || days > 2 || days < 0
      ? formatDate(`${date}T00:00:00`)
      : days === 0
        ? t('teams.item.dueToday')
        : t('teams.item.dueIn', { count: days });
  return (
    <span className={`tm-due${tone}`}>
      {text}
      {!done && days < 0 && ` · ${t('teams.item.overdue')}`}
    </span>
  );
}

/** Ảnh đại diện nhỏ; không có ảnh thì chữ cái đầu của tên. */
export function MemberAvatar({ member }: { member: Pick<TeamMember, 'fullName' | 'email' | 'avatarUrl'> }) {
  const name = memberName(member);
  return (
    <span className="tm-avatar" aria-hidden="true">
      {member.avatarUrl ? <img src={member.avatarUrl} alt="" /> : name.charAt(0).toUpperCase()}
    </span>
  );
}
