import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Link } from '../../routes/transition-nav';
import { Icon } from '../../components/ui';
import { teamApi } from '../../services';
import { SHOW_ITEM_STATUSES } from '../../types';
import type { ShowItemStatus, TeamTask } from '../../types';
import { formatNumber, t } from '../../i18n/core';
import { DueDate, StatusBadge } from './shared';
import { daysUntil } from './teamUtils';
import '../../components/scores/scores.css';
import './teams.css';
import './my-tasks.css';

/** Bài chưa duyệt, đã duyệt thì không còn là việc cần làm (BE không trả). */
const OPEN_STATUSES = SHOW_ITEM_STATUSES.filter((s) => s !== 'APPROVED');

type Role = '' | 'arranger' | 'reviewer';
type Due = '' | 'late' | 'soon' | 'week' | 'none';
type Sort = 'due' | 'dueDesc' | 'title';

const DUES: Due[] = ['late', 'soon', 'week', 'none'];
const SOON_DAYS = 2;
const WEEK_DAYS = 7;

/** Hạn của bài thuộc nhóm nào so với hôm nay (null = chưa có hạn). */
function dueGroup(task: TeamTask, now: number): Exclude<Due, ''> | 'later' {
  if (!task.dueDate) return 'none';
  const days = daysUntil(task.dueDate, now);
  if (days < 0) return 'late';
  if (days <= SOON_DAYS) return 'soon';
  if (days <= WEEK_DAYS) return 'week';
  return 'later';
}

/** Bỏ dấu và chữ hoa để tìm "tinh ca" ra "Tình ca". */
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'D')
    .toLowerCase();

/**
 * Trang /my-tasks: mọi bài được giao cho mình (phối hoặc duyệt) trong các buổi diễn, có tìm kiếm và bộ lọc theo nhóm,
 * trạng thái, vai trò, hạn. Trạng thái bộ lọc nằm trên URL nên gửi link cho người khác hoặc quay lại vẫn giữ nguyên.
 */
export default function MyTasks() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const teamId = params.get('team') ?? '';
  const status = (OPEN_STATUSES as string[]).includes(params.get('status') ?? '')
    ? (params.get('status') as ShowItemStatus)
    : '';
  const role: Role =
    params.get('role') === 'arranger' || params.get('role') === 'reviewer' ? (params.get('role') as Role) : '';
  const due: Due = (DUES as string[]).includes(params.get('due') ?? '') ? (params.get('due') as Due) : '';
  const sort: Sort =
    params.get('sort') === 'dueDesc' || params.get('sort') === 'title' ? (params.get('sort') as Sort) : 'due';

  const [tasks, setTasks] = useState<TeamTask[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(0);
  const [search, setSearch] = useState(q);

  useEffect(() => {
    let cancelled = false;
    teamApi
      .myTasks()
      .then((res) => {
        if (cancelled) return;
        setNow(Date.now());
        setTasks(res.data.result);
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        toast.error(t('tasks.loadFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };

  // Gõ tìm kiếm: chờ ngừng gõ rồi mới đẩy lên URL
  useEffect(() => {
    if (search.trim() === q) return;
    const timer = setTimeout(() => update({ q: search.trim() || null }), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const teams = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of tasks ?? []) map.set(task.teamId, task.teamName);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [tasks]);

  /** Số việc theo hạn (chưa áp bộ lọc hạn) để hiện trên các nút lọc nhanh. */
  const dueCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const task of tasks ?? []) {
      const g = dueGroup(task, now);
      c[g] = (c[g] ?? 0) + 1;
    }
    return c;
  }, [tasks, now]);

  const shown = useMemo(() => {
    const needle = fold(q.trim());
    const filtered = (tasks ?? []).filter((task) => {
      if (teamId && task.teamId !== teamId) return false;
      if (status && task.status !== status) return false;
      if (role === 'arranger' && !task.asArranger) return false;
      if (role === 'reviewer' && !task.asReviewer) return false;
      if (due && dueGroup(task, now) !== due) return false;
      if (needle && !fold(`${task.scoreTitle} ${task.teamName} ${task.showName}`).includes(needle)) return false;
      return true;
    });
    const byDue = (a: TeamTask, b: TeamTask) => {
      if (!a.dueDate && !b.dueDate) return a.scoreTitle.localeCompare(b.scoreTitle);
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    };
    return [...filtered].sort((a, b) => {
      if (sort === 'title') return a.scoreTitle.localeCompare(b.scoreTitle);
      if (sort === 'dueDesc') return -byDue(a, b) || a.scoreTitle.localeCompare(b.scoreTitle);
      return byDue(a, b);
    });
  }, [tasks, q, teamId, status, role, due, sort, now]);

  const filtering = Boolean(q || teamId || status || role || due);
  const clear = () => {
    setSearch('');
    setParams({}, { replace: true });
  };

  return (
    <div className="sc-page">
      <main className="sc-container">
        <header className="mt-head">
          <div>
            <h1>{t('tasks.title')}</h1>
            <p>{t('tasks.subtitle')}</p>
          </div>
          <Link to="/teams" className="sc-btn">
            <Icon name="users" size={16} />
            {t('tasks.myTeams')}
          </Link>
        </header>

        {tasks && tasks.length > 0 && (
          <div className="mt-stats" role="group" aria-label={t('tasks.dueLabel')}>
            <button
              type="button"
              className={`mt-stat${due === '' ? ' is-on' : ''}`}
              aria-pressed={due === ''}
              onClick={() => update({ due: null })}
            >
              <strong>{formatNumber(tasks.length)}</strong>
              <span>{t('tasks.due.all')}</span>
            </button>
            {DUES.map((d) => (
              <button
                key={d}
                type="button"
                className={`mt-stat mt-stat--${d}${due === d ? ' is-on' : ''}`}
                aria-pressed={due === d}
                disabled={!dueCounts[d] && due !== d}
                onClick={() => update({ due: due === d ? null : d })}
              >
                <strong>{formatNumber(dueCounts[d] ?? 0)}</strong>
                <span>{t(`tasks.due.${d}`)}</span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-toolbar">
          <label className="mt-search">
            <Icon name="search" size={16} />
            <input
              type="search"
              value={search}
              placeholder={t('tasks.search')}
              aria-label={t('tasks.search')}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            className="sc-input mt-select"
            aria-label={t('tasks.filters.team')}
            value={teamId}
            onChange={(e) => update({ team: e.target.value })}
          >
            <option value="">{t('tasks.filters.allTeams')}</option>
            {teams.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <select
            className="sc-input mt-select"
            aria-label={t('tasks.filters.status')}
            value={status}
            onChange={(e) => update({ status: e.target.value })}
          >
            <option value="">{t('tasks.filters.allStatuses')}</option>
            {OPEN_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`teams.status.${s}`)}
              </option>
            ))}
          </select>
          <select
            className="sc-input mt-select"
            aria-label={t('tasks.filters.role')}
            value={role}
            onChange={(e) => update({ role: e.target.value })}
          >
            <option value="">{t('tasks.filters.allRoles')}</option>
            <option value="arranger">{t('tasks.filters.arranger')}</option>
            <option value="reviewer">{t('tasks.filters.reviewer')}</option>
          </select>
          <select
            className="sc-input mt-select"
            aria-label={t('tasks.sort.label')}
            value={sort}
            onChange={(e) => update({ sort: e.target.value === 'due' ? null : e.target.value })}
          >
            <option value="due">{t('tasks.sort.due')}</option>
            <option value="dueDesc">{t('tasks.sort.dueDesc')}</option>
            <option value="title">{t('tasks.sort.title')}</option>
          </select>
        </div>

        {failed && (
          <div className="sc-empty">
            <h3>{t('tasks.loadFailed')}</h3>
            <p>{t('tasks.reload')}</p>
          </div>
        )}

        {!tasks && !failed && (
          <ul className="mt-list" aria-hidden="true">
            {Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="mt-card mt-card--skeleton" />
            ))}
          </ul>
        )}

        {tasks && tasks.length === 0 && (
          <div className="sc-empty">
            <h3>{t('tasks.emptyTitle')}</h3>
            <p>{t('tasks.emptyHint')}</p>
            <Link to="/teams" className="sc-btn sc-btn--primary">
              {t('tasks.myTeams')}
            </Link>
          </div>
        )}

        {tasks && tasks.length > 0 && (
          <>
            <p className="mt-count" aria-live="polite">
              {filtering
                ? t('tasks.countFiltered', { shown: shown.length, total: tasks.length })
                : t('tasks.count', { count: tasks.length })}
              {filtering && (
                <button type="button" className="mt-clear" onClick={clear}>
                  {t('tasks.clear')}
                </button>
              )}
            </p>

            {shown.length === 0 ? (
              <div className="sc-empty">
                <h3>{t('tasks.noMatchTitle')}</h3>
                <p>{t('tasks.noMatchHint')}</p>
                <button type="button" className="sc-btn" onClick={clear}>
                  {t('tasks.clear')}
                </button>
              </div>
            ) : (
              <ul className="mt-list">
                {shown.map((task) => {
                  const group = dueGroup(task, now);
                  return (
                    <li key={task.itemId} className={`mt-card mt-card--${group}`}>
                      <div className="mt-card__main">
                        <Link className="mt-card__title" to={`/teams/${task.teamId}/shows/${task.showId}`}>
                          {task.scoreTitle}
                        </Link>
                        <p className="mt-card__sub">
                          <Icon name="users" size={13} />
                          <Link to={`/teams/${task.teamId}`}>{task.teamName}</Link>
                          <span aria-hidden="true">·</span>
                          <Icon name="calendar" size={13} />
                          {task.showName}
                        </p>
                        <p className="mt-card__roles">
                          {task.asArranger && <span className="mt-role">{t('teams.tasks.asArranger')}</span>}
                          {task.asReviewer && (
                            <span className="mt-role mt-role--review">{t('teams.tasks.asReviewer')}</span>
                          )}
                        </p>
                      </div>
                      <div className="mt-card__side">
                        <DueDate date={task.dueDate} now={now} chip />
                        <StatusBadge status={task.status} />
                      </div>
                      <div className="mt-card__actions">
                        <Link
                          className="sc-btn sc-btn--sm sc-btn--primary"
                          to={`/teams/${task.teamId}/shows/${task.showId}`}
                        >
                          {t('tasks.openShow')}
                        </Link>
                        <Link
                          className="sc-btn sc-btn--sm"
                          to={`/scores/${task.scoreId}`}
                          state={{ from: '/my-tasks' }}
                        >
                          {t('tasks.openScore')}
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}
