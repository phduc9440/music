import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Link } from '../../routes/transition-nav';
import { Icon } from '../../components/ui';
import { SHOW_ITEM_STATUSES } from '../../types';
import type { ShowItemStatus, TeamTask } from '../../types';
import { formatNumber, t } from '../../i18n/core';
import { DueDate, StatusBadge } from './shared';
import { daysUntil } from './teamUtils';
import './my-tasks.css';

/** Bài đã duyệt thì không còn là việc cần làm (BE không trả). */
const OPEN_STATUSES = SHOW_ITEM_STATUSES.filter((s) => s !== 'APPROVED');

type Role = '' | 'arranger' | 'reviewer';
type Due = '' | 'late' | 'soon' | 'week' | 'none';
type Sort = 'due' | 'dueDesc' | 'title';

interface Filters {
  q: string;
  team: string;
  status: ShowItemStatus | '';
  role: Role;
  due: Due;
  sort: Sort;
}

const DUES: Due[] = ['late', 'soon', 'week', 'none'];
const SOON_DAYS = 2;
const WEEK_DAYS = 7;

/** Hạn của bài thuộc nhóm nào so với hôm nay (none = chưa có hạn, later = còn xa). */
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
    .replace(/\u0111/g, 'd') // i18n-ignore
    .replace(/\u0110/g, 'D') // i18n-ignore
    .toLowerCase();

const EMPTY: Filters = { q: '', team: '', status: '', role: '', due: '', sort: 'due' };

function readParams(params: URLSearchParams): Filters {
  const status = params.get('status') ?? '';
  const role = params.get('role');
  const due = params.get('due') ?? '';
  const sort = params.get('sort');
  return {
    q: params.get('q') ?? '',
    team: params.get('team') ?? '',
    status: (OPEN_STATUSES as string[]).includes(status) ? (status as ShowItemStatus) : '',
    role: role === 'arranger' || role === 'reviewer' ? role : '',
    due: (DUES as string[]).includes(due) ? (due as Due) : '',
    sort: sort === 'dueDesc' || sort === 'title' ? sort : 'due',
  };
}

/** Một việc: tên bài, nhóm / buổi diễn (tùy phạm vi), vai trò, hạn, trạng thái, nút mở. */
function TaskCard({ task, now, scope, from }: { task: TeamTask; now: number; scope: Scope; from: string }) {
  const group = dueGroup(task, now);
  const showLink = `/teams/${task.teamId}/shows/${task.showId}`;
  return (
    <li className={`mt-card mt-card--${group}`}>
      <div className="mt-card__main">
        {scope === 'show' ? (
          <Link className="mt-card__title" to={`/scores/${task.scoreId}`} state={{ from }}>
            {task.scoreTitle}
          </Link>
        ) : (
          <Link className="mt-card__title" to={showLink}>
            {task.scoreTitle}
          </Link>
        )}
        {scope !== 'show' && (
          <p className="mt-card__sub">
            {scope === 'all' && (
              <>
                <Icon name="users" size={13} />
                <Link to={`/teams/${task.teamId}`}>{task.teamName}</Link>
                <span aria-hidden="true">·</span>
              </>
            )}
            <Icon name="calendar" size={13} />
            {task.showName}
          </p>
        )}
        <p className="mt-card__roles">
          {task.asArranger && <span className="mt-role">{t('teams.tasks.asArranger')}</span>}
          {task.asReviewer && <span className="mt-role mt-role--review">{t('teams.tasks.asReviewer')}</span>}
        </p>
      </div>
      <div className="mt-card__side">
        <DueDate date={task.dueDate} now={now} chip />
        <StatusBadge status={task.status} />
      </div>
      <div className="mt-card__actions">
        {scope !== 'show' && (
          <Link className="sc-btn sc-btn--sm sc-btn--primary" to={showLink}>
            {t('tasks.openShow')}
          </Link>
        )}
        <Link className="sc-btn sc-btn--sm" to={`/scores/${task.scoreId}`} state={{ from }}>
          {t('tasks.openScore')}
        </Link>
      </div>
    </li>
  );
}

/** all: mọi nhóm (trang Việc của tôi); team: trong một nhóm; show: trong một buổi diễn (gọn, không có bộ lọc). */
export type Scope = 'all' | 'team' | 'show';

interface Props {
  tasks: TeamTask[];
  now: number;
  scope: Scope;
  /** Giữ bộ lọc trên URL (chỉ trang riêng, để gửi link được); các nơi nhúng dùng trạng thái cục bộ. */
  syncUrl?: boolean;
  /** Vị trí hiện tại, truyền cho trang bản nhạc để nút quay lại về đúng chỗ. */
  from: string;
}

/**
 * Danh sách việc của tôi dùng chung ở ba nơi (mục 4.1): trang /my-tasks (mọi nhóm), tab Việc của tôi trong nhóm, và khung
 * trong trang buổi diễn. Tìm theo tên bài / nhóm / buổi diễn không phân biệt dấu, lọc theo nhóm, trạng thái, vai trò, hạn.
 */
export default function TasksPanel({ tasks, now, scope, syncUrl = false, from }: Props) {
  const [params, setParams] = useSearchParams();
  const [local, setLocal] = useState<Filters>(EMPTY);
  const f = syncUrl ? readParams(params) : local;
  const [search, setSearch] = useState(f.q);
  const compact = scope === 'show';

  const update = (changes: Partial<Filters>) => {
    if (!syncUrl) {
      setLocal((cur) => ({ ...cur, ...changes }));
      return;
    }
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      const empty = v === '' || (k === 'sort' && v === 'due');
      if (empty) next.delete(k);
      else next.set(k, String(v));
    }
    setParams(next, { replace: true });
  };

  // Gõ tìm kiếm: chờ ngừng gõ rồi mới áp bộ lọc
  useEffect(() => {
    if (search.trim() === f.q) return;
    const timer = setTimeout(() => update({ q: search.trim() }), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const teams = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of tasks) map.set(task.teamId, task.teamName);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [tasks]);

  /** Số việc theo hạn (chưa áp bộ lọc hạn) để hiện trên các ô lọc nhanh. */
  const dueCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const task of tasks) {
      const g = dueGroup(task, now);
      c[g] = (c[g] ?? 0) + 1;
    }
    return c;
  }, [tasks, now]);

  const shown = useMemo(() => {
    const needle = fold(f.q.trim());
    const filtered = tasks.filter((task) => {
      if (f.team && task.teamId !== f.team) return false;
      if (f.status && task.status !== f.status) return false;
      if (f.role === 'arranger' && !task.asArranger) return false;
      if (f.role === 'reviewer' && !task.asReviewer) return false;
      if (f.due && dueGroup(task, now) !== f.due) return false;
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
      if (f.sort === 'title') return a.scoreTitle.localeCompare(b.scoreTitle);
      if (f.sort === 'dueDesc') return -byDue(a, b) || a.scoreTitle.localeCompare(b.scoreTitle);
      return byDue(a, b);
    });
  }, [tasks, f, now]);

  const filtering = Boolean(f.q || f.team || f.status || f.role || f.due);
  const clear = () => {
    setSearch('');
    if (syncUrl) setParams({}, { replace: true });
    else setLocal(EMPTY);
  };

  if (compact) {
    return (
      <ul className="mt-list">
        {tasks.map((task) => (
          <TaskCard key={task.itemId} task={task} now={now} scope={scope} from={from} />
        ))}
      </ul>
    );
  }

  return (
    <>
      {tasks.length > 0 && (
        <div className="mt-stats" role="group" aria-label={t('tasks.dueLabel')}>
          <button
            type="button"
            className={`mt-stat${f.due === '' ? ' is-on' : ''}`}
            aria-pressed={f.due === ''}
            onClick={() => update({ due: '' })}
          >
            <strong>{formatNumber(tasks.length)}</strong>
            <span>{t('tasks.due.all')}</span>
          </button>
          {DUES.map((d) => (
            <button
              key={d}
              type="button"
              className={`mt-stat mt-stat--${d}${f.due === d ? ' is-on' : ''}`}
              aria-pressed={f.due === d}
              disabled={!dueCounts[d] && f.due !== d}
              onClick={() => update({ due: f.due === d ? '' : d })}
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
            placeholder={t(scope === 'team' ? 'tasks.searchInTeam' : 'tasks.search')}
            aria-label={t('tasks.search')}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {scope === 'all' && (
          <select
            className="sc-input mt-select"
            aria-label={t('tasks.filters.team')}
            value={f.team}
            onChange={(e) => update({ team: e.target.value })}
          >
            <option value="">{t('tasks.filters.allTeams')}</option>
            {teams.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        )}
        <select
          className="sc-input mt-select"
          aria-label={t('tasks.filters.status')}
          value={f.status}
          onChange={(e) => update({ status: e.target.value as Filters['status'] })}
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
          value={f.role}
          onChange={(e) => update({ role: e.target.value as Role })}
        >
          <option value="">{t('tasks.filters.allRoles')}</option>
          <option value="arranger">{t('tasks.filters.arranger')}</option>
          <option value="reviewer">{t('tasks.filters.reviewer')}</option>
        </select>
        <select
          className="sc-input mt-select"
          aria-label={t('tasks.sort.label')}
          value={f.sort}
          onChange={(e) => update({ sort: e.target.value as Sort })}
        >
          <option value="due">{t('tasks.sort.due')}</option>
          <option value="dueDesc">{t('tasks.sort.dueDesc')}</option>
          <option value="title">{t('tasks.sort.title')}</option>
        </select>
      </div>

      {tasks.length === 0 && (
        <div className="sc-empty">
          <h3>{t(scope === 'team' ? 'tasks.emptyTeamTitle' : 'tasks.emptyTitle')}</h3>
          <p>{t(scope === 'team' ? 'tasks.emptyTeamHint' : 'tasks.emptyHint')}</p>
        </div>
      )}

      {tasks.length > 0 && (
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
              {shown.map((task) => (
                <TaskCard key={task.itemId} task={task} now={now} scope={scope} from={from} />
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
