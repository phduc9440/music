import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  Badge,
  Button,
  Card,
  CellTitle,
  DescriptionList,
  PageHeader,
  Pager,
  SearchForm,
  StatCard,
  StatGrid,
  Table,
  TableState,
  Toolbar,
} from '../../components/ui';
import { useDialog } from '../../components/ui/dialog-context';
import { errorMessage, formatDateTime } from '../../components/ui/helpers';
import type { Tone } from '../../components/ui/helpers';
import { adminApi, taskApi } from '../../services';
import type { AdminAiTask, AiTaskInfo, AiTaskSummary, PageResult } from '../../types';
import { OMR_STEPS, describeTaskError } from '../../utils/omr';
import { TASK_TYPE_LABELS } from '../../utils/score';
import './AdminSystem.css';
import { labelMap, t } from '../../i18n/core';

const PAGE_SIZE = 20;
const REFRESH_MS = 10000;

const STATUS_TONE: Record<string, Tone> = {
  PENDING: 'warning',
  PROCESSING: 'primary',
  COMPLETED: 'success',
  FAILED: 'danger',
  CANCELLED: 'neutral',
};
const STATUS_LABEL: Record<string, string> = labelMap('admin.ai.status', [
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);

/** Nhãn bước: "QUEUED" hoặc một trong các bước OMR. */
const stepLabel = (key: string): string =>
  key === 'QUEUED' ? t('admin.ai.queued') : (OMR_STEPS.find((s) => s.key === key)?.label ?? key);

/** 75 -> "1 phút 15 giây" / "1 min 15 s". */
const formatDuration = (seconds?: number | null) => {
  if (seconds == null) return '—';
  if (seconds < 60) return t('admin.ai.seconds', { count: seconds });
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return t('admin.ai.hoursMinutes', { hours: h, minutes: m });
  return s > 0 ? t('admin.ai.minutesSeconds', { minutes: m, seconds: s }) : t('admin.ai.minutes', { count: m });
};

const toJson = (value: unknown) => {
  if (value == null) return '—';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

/** Câu lỗi tiếng Việt (dùng lại bảng dịch lỗi của trang tiến độ số hóa). */
const errorText = (task: AdminAiTask) => {
  if (task.status !== 'FAILED' && task.status !== 'CANCELLED') return null;
  const e = describeTaskError(task as unknown as AiTaskInfo);
  return `${e.title}${e.detail ? ` (${e.detail})` : ''}`;
};

/** Admin (mục 5.2): giám sát hàng đợi tác vụ AI, xem lỗi, hủy task đang chạy và chạy lại task OMR bị lỗi. */
export default function AdminAiTasks() {
  const { confirm } = useDialog();
  const [summary, setSummary] = useState<AiTaskSummary | null>(null);
  const [result, setResult] = useState<PageResult<AdminAiTask> | null>(null);
  const [page, setPage] = useState(0);
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reload, setReload] = useState(0);
  const [auto, setAuto] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminAiTask | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .getAiTasks({
        page,
        size: PAGE_SIZE,
        status: status || undefined,
        type: type || undefined,
        keyword: keyword || undefined,
        from: from || undefined,
        to: to || undefined,
      })
      .then((res) => !cancelled && setResult(res.data.result))
      .catch((error) => !cancelled && toast.error(errorMessage(error, t('admin.ai.loadFailed'))));
    adminApi
      .getAiTaskSummary()
      .then((res) => !cancelled && setSummary(res.data.result))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [page, status, type, keyword, from, to, reload]);

  const active = (summary?.pending ?? 0) + (summary?.processing ?? 0);

  // Còn task chờ/đang chạy thì tự làm mới (bỏ qua khi tab đang ẩn)
  useEffect(() => {
    if (!auto || active === 0) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') setReload((n) => n + 1);
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [auto, active]);

  const changeFilter = (apply: () => void) => {
    apply();
    setPage(0);
    setOpenId(null);
  };
  const filtered = !!(keyword || status || type || from || to);

  const toggleDetail = useCallback(
    (task: AdminAiTask) => {
      if (openId === task.id) {
        setOpenId(null);
        return;
      }
      setOpenId(task.id);
      setDetail(null);
      adminApi
        .getAiTask(task.id)
        .then((res) => setDetail(res.data.result))
        .catch((error) => toast.error(errorMessage(error, t('admin.ai.detailFailed'))));
    },
    [openId],
  );

  const cancel = async (task: AdminAiTask) => {
    const ok = await confirm({
      title: t('admin.ai.cancelTitle'),
      message: t('admin.ai.cancelMessage', {
        type: TASK_TYPE_LABELS[task.taskType] ?? task.taskType,
        score: task.scoreTitle ?? t('admin.ai.aScore'),
      }),
      confirmLabel: t('admin.ai.cancelConfirm'),
      cancelLabel: t('common.no'),
      tone: 'danger',
    });
    if (!ok) return;
    setBusyId(task.id);
    try {
      await taskApi.cancel(task.id);
      toast.success(t('admin.ai.canceled'));
    } catch (error) {
      toast.error(errorMessage(error, t('admin.ai.cancelFailed')));
    } finally {
      setBusyId(null);
      setReload((n) => n + 1);
    }
  };

  const retry = async (task: AdminAiTask) => {
    const ok = await confirm({
      title: t('admin.ai.retryTitle', { score: task.scoreTitle ?? t('admin.ai.aScore') }),
      message: t('admin.ai.retryMessage', { owner: task.memberEmail ?? '—' }),
      confirmLabel: t('admin.ai.retry'),
    });
    if (!ok) return;
    setBusyId(task.id);
    try {
      await adminApi.retryAiTask(task.id);
      toast.success(t('admin.ai.retried'));
    } catch (error) {
      toast.error(errorMessage(error, t('admin.ai.retryFailed')));
    } finally {
      setBusyId(null);
      setReload((n) => n + 1);
    }
  };

  const select = (label: string, value: string, onChange: (v: string) => void, options: [string, string][]) => (
    <select
      className="adm-input"
      aria-label={label}
      value={value}
      onChange={(e) => changeFilter(() => onChange(e.target.value))}
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );

  const avgHint =
    summary && summary.averageRunSeconds.length > 0
      ? summary.averageRunSeconds
          .map((a) => `${TASK_TYPE_LABELS[a.taskType] ?? a.taskType}: ${formatDuration(Math.round(a.seconds))}`)
          .join(' · ')
      : t('admin.ai.noAverage');

  return (
    <>
      <PageHeader
        title={t('admin.menu.items.aiTasks')}
        description={t('admin.ai.description')}
        actions={
          <>
            <label className="adm-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
              {t('admin.ai.autoRefresh')}
            </label>
            <Button icon="refresh" onClick={() => setReload((n) => n + 1)}>
              {t('admin.system.refresh')}
            </Button>
          </>
        }
      />

      <StatGrid>
        <StatCard
          label={t('admin.ai.waiting')}
          icon="clock"
          tone="warning"
          value={summary?.pending ?? '—'}
          hint={t('admin.ai.waitingHint')}
        />
        <StatCard
          label={t('admin.ai.running')}
          icon="cpu"
          tone="primary"
          value={summary?.processing ?? '—'}
          hint={t('admin.ai.runningHint')}
        />
        <StatCard
          label={t('admin.ai.failed24')}
          icon="alert"
          tone={summary && summary.failedLast24h > 0 ? 'danger' : 'neutral'}
          value={summary?.failedLast24h ?? '—'}
          alert={!!summary && summary.failedLast24h > 0}
        />
        <StatCard
          label={t('admin.ai.completed24')}
          icon="check"
          tone="success"
          value={summary?.completedLast24h ?? '—'}
        />
      </StatGrid>
      <p className="adm-muted" style={{ margin: '-0.25rem 0 1rem', fontSize: 'var(--adm-text-sm)' }}>
        {t('admin.ai.average', { value: avgHint })}
      </p>

      <Toolbar>
        <SearchForm
          value={keywordInput}
          onChange={setKeywordInput}
          onSubmit={() => changeFilter(() => setKeyword(keywordInput.trim()))}
          placeholder={t('admin.ai.searchPlaceholder')}
        />
        {select(t('admin.official.statusColumn'), status, setStatus, [
          ['', t('admin.ai.anyStatus')],
          ...Object.entries(STATUS_LABEL),
        ])}
        {select(t('admin.ai.taskType'), type, setType, [
          ['', t('admin.ai.anyType')],
          ...Object.entries(TASK_TYPE_LABELS),
        ])}
        <input
          type="date"
          className="adm-input"
          style={{ width: 'auto' }}
          aria-label={t('admin.ai.fromDate')}
          value={from}
          max={to || undefined}
          onChange={(e) => changeFilter(() => setFrom(e.target.value))}
        />
        <span className="adm-subtle">–</span>
        <input
          type="date"
          className="adm-input"
          style={{ width: 'auto' }}
          aria-label={t('admin.ai.toDate')}
          value={to}
          min={from || undefined}
          onChange={(e) => changeFilter(() => setTo(e.target.value))}
        />
        {filtered && (
          <Button
            variant="ghost"
            icon="x"
            onClick={() =>
              changeFilter(() => {
                setKeyword('');
                setKeywordInput('');
                setStatus('');
                setType('');
                setFrom('');
                setTo('');
              })
            }
          >
            {t('admin.scores.clearFilters')}
          </Button>
        )}
      </Toolbar>

      <Card flush>
        <Table minWidth={1050}>
          <thead>
            <tr>
              <th>{t('upload.review.tabs.score')}</th>
              <th>{t('admin.ai.type')}</th>
              <th>{t('admin.official.statusColumn')}</th>
              <th>{t('admin.ai.createdAt')}</th>
              <th className="adm-table__num">{t('admin.ai.wait')}</th>
              <th className="adm-table__num">{t('admin.ai.run')}</th>
              <th className="adm-table__actions">{t('scores.files.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {!result && <TableState colSpan={7} loading />}
            {result?.content.map((task) => {
              const st = {
                label: STATUS_LABEL[task.status] ?? task.status,
                tone: STATUS_TONE[task.status] ?? ('neutral' as Tone),
              };
              const err = errorText(task);
              const running = task.status === 'PENDING' || task.status === 'PROCESSING';
              return (
                <Fragment key={task.id}>
                  <tr>
                    <td>
                      <CellTitle sub={task.memberEmail ?? undefined}>
                        {task.scoreId ? <Link to={`/admin/scores/${task.scoreId}`}>{task.scoreTitle}</Link> : '—'}
                      </CellTitle>
                    </td>
                    <td className="adm-muted">{TASK_TYPE_LABELS[task.taskType] ?? task.taskType}</td>
                    <td>
                      <div
                        style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', alignItems: 'flex-start' }}
                      >
                        <Badge tone={st.tone}>{st.label}</Badge>
                        {running && task.step && (
                          <span className="adm-subtle" style={{ fontSize: 'var(--adm-text-xs)' }}>
                            {stepLabel(task.step)}
                            {task.progress != null && task.progress > 0 ? ` · ${task.progress}%` : ''}
                          </span>
                        )}
                        {err && (
                          <span style={{ color: 'var(--adm-danger)', fontSize: 'var(--adm-text-xs)', maxWidth: 260 }}>
                            {err}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="adm-nowrap adm-muted">{formatDateTime(task.createdAt)}</td>
                    <td className="adm-table__num adm-muted">{formatDuration(task.waitSeconds)}</td>
                    <td className="adm-table__num adm-muted">{formatDuration(task.runSeconds)}</td>
                    <td className="adm-table__actions">
                      <div className="adm-table__actions-inner">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => toggleDetail(task)}
                          aria-expanded={openId === task.id}
                        >
                          {openId === task.id ? t('admin.system.hide') : t('practice.history.details')}
                        </Button>
                        {task.canRetry && (
                          <Button size="sm" icon="refresh" disabled={busyId === task.id} onClick={() => retry(task)}>
                            {t('admin.ai.retry')}
                          </Button>
                        )}
                        {task.canCancel && (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon="x"
                            disabled={busyId === task.id}
                            onClick={() => cancel(task)}
                          >
                            {t('common.cancel')}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {openId === task.id && (
                    <tr className="adm-table__state">
                      <td colSpan={7} style={{ background: 'var(--adm-surface-muted)' }}>
                        {!detail ? (
                          <span className="adm-muted">{t('admin.ai.loadingDetail')}</span>
                        ) : (
                          <div className="adm-grid-2" style={{ margin: 0 }}>
                            <DescriptionList
                              items={[
                                [t('admin.ai.taskId'), <span className="adm-code">{detail.id}</span>],
                                [t('admin.ai.step'), detail.step ? stepLabel(detail.step) : '—'],
                                [t('admin.ai.progress'), detail.progress != null ? `${detail.progress}%` : '—'],
                                [t('admin.ai.autoRetries'), String(detail.retryCount ?? 0)],
                                [t('admin.ai.startedAt'), formatDateTime(detail.startedAt)],
                                [t('admin.ai.finishedAt'), formatDateTime(detail.finishedAt)],
                                [
                                  t('admin.ai.rootError'),
                                  detail.errorMessage ? <span className="adm-code">{detail.errorMessage}</span> : '—',
                                ],
                              ]}
                            />
                            <div style={{ display: 'grid', gap: '0.75rem', minWidth: 0 }}>
                              <div>
                                <div className="adm-field__label" style={{ marginBottom: '0.3rem' }}>
                                  {t('admin.ai.input')}
                                </div>
                                <pre className="sys-stack" style={{ maxHeight: 160 }}>
                                  {toJson(detail.inputData)}
                                </pre>
                              </div>
                              <div>
                                <div className="adm-field__label" style={{ marginBottom: '0.3rem' }}>
                                  {t('admin.ai.result')}
                                </div>
                                <pre className="sys-stack" style={{ maxHeight: 200 }}>
                                  {toJson(detail.resultData)}
                                </pre>
                              </div>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {result && result.content.length === 0 && (
              <TableState
                colSpan={7}
                icon="cpu"
                title={t('admin.ai.emptyTitle')}
                description={filtered ? t('admin.ai.noMatch') : undefined}
              />
            )}
          </tbody>
        </Table>
        {result && (
          <Pager
            page={result.pageNumber}
            totalPages={result.totalPages}
            totalElements={result.totalElements}
            unit={t('admin.dashboard.taskUnit')}
            onChange={(p) => {
              setOpenId(null);
              setPage(p);
            }}
          />
        )}
      </Card>
    </>
  );
}
