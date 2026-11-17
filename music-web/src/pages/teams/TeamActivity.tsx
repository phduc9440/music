import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { Link } from '../../routes/transition-nav';
import { Icon } from '../../components/ui';
import type { IconName } from '../../components/ui';
import Skeleton from '../../components/ui/Skeleton';
import { teamApi } from '../../services';
import type { Team, TeamActivity, TeamActivityType } from '../../types';
import { formatDate, formatDateTime, formatNumber, formatRelativeTime, t } from '../../i18n/core';
import { activityText } from './teamUtils';

const PAGE_SIZE = 20;

type Group = 'team' | 'members' | 'scores' | 'shows' | 'permissions';
type Tone = 'success' | 'danger' | 'primary' | 'warning';
const GROUPS: Group[] = ['team', 'members', 'scores', 'shows', 'permissions'];

/** Mỗi loại hoạt động thuộc một nhóm (để lọc), có biểu tượng và tông màu riêng. */
const KINDS: Record<TeamActivityType, { group: Group; icon: IconName; tone: Tone }> = {
  TEAM_CREATED: { group: 'team', icon: 'home', tone: 'success' },
  TEAM_UPDATED: { group: 'team', icon: 'edit', tone: 'primary' },
  TEAM_RESTORED: { group: 'team', icon: 'refresh', tone: 'success' },
  MEMBER_JOINED: { group: 'members', icon: 'users', tone: 'success' },
  MEMBER_LEFT: { group: 'members', icon: 'logout', tone: 'warning' },
  MEMBER_REMOVED: { group: 'members', icon: 'x', tone: 'danger' },
  ROLE_CHANGED: { group: 'members', icon: 'key', tone: 'primary' },
  INVITATION_SENT: { group: 'members', icon: 'send', tone: 'primary' },
  SCORE_ADDED: { group: 'scores', icon: 'music', tone: 'success' },
  SCORE_REMOVED: { group: 'scores', icon: 'music', tone: 'danger' },
  SHOW_CREATED: { group: 'shows', icon: 'calendar', tone: 'success' },
  SHOW_UPDATED: { group: 'shows', icon: 'edit', tone: 'primary' },
  SHOW_DELETED: { group: 'shows', icon: 'trash', tone: 'danger' },
  SHOW_RESTORED: { group: 'shows', icon: 'refresh', tone: 'success' },
  ITEM_ADDED: { group: 'shows', icon: 'plus', tone: 'success' },
  ITEM_REMOVED: { group: 'shows', icon: 'trash', tone: 'danger' },
  ITEM_ASSIGNED: { group: 'shows', icon: 'users', tone: 'primary' },
  ITEM_STATUS_CHANGED: { group: 'shows', icon: 'check', tone: 'warning' },
  PERMISSIONS_CHANGED: { group: 'permissions', icon: 'shield', tone: 'primary' },
};

/** Khóa ngày theo giờ máy người xem (yyyy-MM-dd) để gom các hoạt động cùng ngày. */
const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function dayLabel(key: string, now: number): string {
  const today = dayKey(new Date(now).toISOString());
  const yesterday = dayKey(new Date(now - 24 * 60 * 60 * 1000).toISOString());
  if (key === today) return t('teams.activity.today');
  if (key === yesterday) return t('teams.activity.yesterday');
  const [y, m, d] = key.split('-').map(Number);
  return formatDate(new Date(y, m - 1, d));
}

/** Liên kết tới buổi diễn / bản nhạc của hoạt động (buổi diễn đã xóa thì không dẫn tới được). */
function activityLink(a: TeamActivity, teamId: string): { to: string; label: string } | null {
  const p = a.params ?? {};
  if (p.showId && a.type !== 'SHOW_DELETED') {
    return { to: `/teams/${teamId}/shows/${p.showId}`, label: t('teams.activity.openShow') };
  }
  if (p.scoreId && a.type === 'SCORE_ADDED') {
    return { to: `/scores/${p.scoreId}`, label: t('teams.activity.openScore') };
  }
  return null;
}

/** Tab Hoạt động của nhóm: dòng thời gian theo ngày, lọc theo nhóm sự kiện (nhóm, thành viên, bản nhạc, buổi diễn, quyền). */
export default function TeamActivityTab({ team }: { team: Team }) {
  const [items, setItems] = useState<TeamActivity[] | null>(null);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [group, setGroup] = useState<Group | 'all'>('all');
  const [now, setNow] = useState(0);

  useEffect(() => {
    let cancelled = false;
    teamApi
      .activities(team.id, { page, size: PAGE_SIZE })
      .then((res) => {
        if (cancelled) return;
        setItems((prev) => (page === 0 ? res.data.result.content : [...(prev ?? []), ...res.data.result.content]));
        setTotalPages(res.data.result.totalPages);
        setNow(Date.now());
      })
      .catch(() => !cancelled && toast.error(t('teams.activity.loadFailed')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [team.id, page]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of items ?? []) {
      const g = KINDS[a.type]?.group;
      if (g) c[g] = (c[g] ?? 0) + 1;
    }
    return c;
  }, [items]);

  const days = useMemo(() => {
    const shown = (items ?? []).filter((a) => group === 'all' || KINDS[a.type]?.group === group);
    const map = new Map<string, TeamActivity[]>();
    for (const a of shown) {
      const key = dayKey(a.createdAt);
      map.set(key, [...(map.get(key) ?? []), a]);
    }
    return [...map.entries()];
  }, [items, group]);

  if (!items) return <Skeleton lines={4} />;
  if (items.length === 0) {
    return (
      <div className="sc-empty">
        <h3>{t('teams.activity.empty')}</h3>
        <p>{t('teams.activity.emptyHint')}</p>
      </div>
    );
  }

  return (
    <div className="tm-feed">
      <div className="tm-feed__filters" role="group" aria-label={t('teams.activity.filter')}>
        <button
          type="button"
          className={`tm-feed__chip${group === 'all' ? ' is-on' : ''}`}
          aria-pressed={group === 'all'}
          onClick={() => setGroup('all')}
        >
          {t('teams.activity.groups.all')}
          <span>{formatNumber(items.length)}</span>
        </button>
        {GROUPS.filter((g) => counts[g]).map((g) => (
          <button
            key={g}
            type="button"
            className={`tm-feed__chip${group === g ? ' is-on' : ''}`}
            aria-pressed={group === g}
            onClick={() => setGroup(g)}
          >
            {t(`teams.activity.groups.${g}`)}
            <span>{formatNumber(counts[g])}</span>
          </button>
        ))}
      </div>

      {days.length === 0 && <p className="tm-muted">{t('teams.activity.emptyFiltered')}</p>}

      {days.map(([key, list]) => (
        <section key={key} className="tm-feed__day" aria-label={dayLabel(key, now)}>
          <h3 className="tm-feed__date">{dayLabel(key, now)}</h3>
          <ol className="tm-feed__list">
            {list.map((a) => {
              const kind = KINDS[a.type] ?? {
                group: 'team' as Group,
                icon: 'activity' as IconName,
                tone: 'primary' as Tone,
              };
              const link = activityLink(a, team.id);
              return (
                <li key={a.id} className="tm-feed__item">
                  <span className={`tm-feed__icon tm-feed__icon--${kind.tone}`} aria-hidden="true">
                    <Icon name={kind.icon} size={16} />
                  </span>
                  <div className="tm-feed__body">
                    <p>{activityText(a)}</p>
                    <div className="tm-feed__meta">
                      <span className="tm-feed__tag">{t(`teams.activity.groups.${kind.group}`)}</span>
                      <time dateTime={a.createdAt} title={formatDateTime(a.createdAt)}>
                        {formatRelativeTime(a.createdAt)}
                      </time>
                      {link && (
                        <Link to={link.to} className="tm-feed__link">
                          {link.label}
                          <Icon name="chevronRight" size={12} />
                        </Link>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}

      {page + 1 < totalPages && (
        <div className="tm-feed__more">
          <button
            type="button"
            className="sc-btn"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              setPage((p) => p + 1);
            }}
          >
            {t('teams.activity.more')}
          </button>
        </div>
      )}
    </div>
  );
}
