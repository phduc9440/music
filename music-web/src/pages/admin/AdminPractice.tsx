import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Link } from '../../routes/transition-nav';
import { toast } from 'react-toastify';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Badge,
  Button,
  Card,
  CellTitle,
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
import { adminApi } from '../../services';
import type { AdminPracticeOverview, AdminPracticeSession, PageResult, PracticeAnomaly } from '../../types';
import { formatDate, formatNumber, t } from '../../i18n/core';
import type { AdminOutletContext } from '../../components/admin/AdminLayout';
import { hasAdminPermission } from '../../utils/auth';
import './AdminDashboard.css';

const PAGE_SIZE = 20;
const MODES = ['FREE', 'LOOP', 'TEST', 'WAIT', 'FREE_RUN'];
const STATUSES = ['IN_PROGRESS', 'COMPLETED', 'ABANDONED'];
const STATUS_TONE: Record<string, Tone> = { IN_PROGRESS: 'primary', COMPLETED: 'success', ABANDONED: 'neutral' };
const AXIS = { fontSize: 12, fill: 'var(--ui-chart-axis)' };

const longDate = (iso: string) => formatDate(`${iso}T00:00:00`);
const shortDate = (iso: string) => {
  const [, m, d] = iso.split('-');
  return t('admin.dashboard.shortDate', { day: Number(d), month: Number(m) });
};

/** 75 -> "1:15"; 3700 -> "1:01:40". */
const clock = (seconds?: number | null) => {
  if (seconds == null) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

/** Admin: buổi luyện của mọi thành viên, thống kê toàn hệ thống; xóa buổi bất thường, đóng buổi đang chạy bị treo. */
export default function AdminPractice() {
  const { confirm } = useDialog();
  const { admin } = useOutletContext<AdminOutletContext>();
  const canManage = hasAdminPermission(admin, 'PRACTICE_MANAGE');
  const [overview, setOverview] = useState<AdminPracticeOverview | null>(null);
  const [result, setResult] = useState<PageResult<AdminPracticeSession> | null>(null);
  const [page, setPage] = useState(0);
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [mode, setMode] = useState('');
  const [status, setStatus] = useState('');
  const [anomalousOnly, setAnomalousOnly] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reload, setReload] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .getPracticeSessions({
        page,
        size: PAGE_SIZE,
        keyword: keyword || undefined,
        mode: mode || undefined,
        status: status || undefined,
        anomalousOnly: anomalousOnly || undefined,
        from: from || undefined,
        to: to || undefined,
      })
      .then((res) => !cancelled && setResult(res.data.result))
      .catch((error) => !cancelled && toast.error(errorMessage(error, t('admin.practice.loadFailed'))));
    return () => {
      cancelled = true;
    };
  }, [page, keyword, mode, status, anomalousOnly, from, to, reload]);

  // Thống kê chỉ phụ thuộc khoảng ngày (không có ngày thì BE lấy 30 ngày gần nhất)
  useEffect(() => {
    let cancelled = false;
    adminApi
      .getPracticeOverview({ from: from || undefined, to: to || undefined })
      .then((res) => !cancelled && setOverview(res.data.result))
      .catch((error) => !cancelled && toast.error(errorMessage(error, t('admin.practice.overviewFailed'))));
    return () => {
      cancelled = true;
    };
  }, [from, to, reload]);

  const changeFilter = (apply: () => void) => {
    apply();
    setPage(0);
  };
  const filtered = !!(keyword || mode || status || anomalousOnly || from || to);

  const memberLabel = (s: AdminPracticeSession) => s.memberName || s.memberEmail;

  const close = async (s: AdminPracticeSession) => {
    const ok = await confirm({
      title: t('admin.practice.closeTitle'),
      message: t('admin.practice.closeMessage', { member: memberLabel(s) }),
      confirmLabel: t('admin.practice.closeConfirm'),
      cancelLabel: t('common.no'),
    });
    if (!ok) return;
    setBusyId(s.id);
    try {
      await adminApi.closePracticeSession(s.id);
      toast.success(t('admin.practice.closed'));
    } catch (error) {
      toast.error(errorMessage(error, t('admin.practice.closeFailed')));
    } finally {
      setBusyId(null);
      setReload((n) => n + 1);
    }
  };

  const remove = async (s: AdminPracticeSession) => {
    const ok = await confirm({
      title: t('admin.practice.deleteTitle'),
      message: t('admin.practice.deleteMessage', { member: memberLabel(s), score: s.scoreTitle ?? '—' }),
      confirmLabel: t('admin.practice.deleteConfirm'),
      cancelLabel: t('common.no'),
      tone: 'danger',
    });
    if (!ok) return;
    setBusyId(s.id);
    try {
      await adminApi.deletePracticeSession(s.id);
      toast.success(t('admin.practice.deleted'));
    } catch (error) {
      toast.error(errorMessage(error, t('admin.practice.deleteFailed')));
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

  const days = overview?.byDay ?? [];
  const pct = (v: number | null | undefined) => (v == null ? '—' : `${formatNumber(Math.round(v * 10) / 10)}%`);

  return (
    <>
      <PageHeader
        title={t('admin.menu.items.practice')}
        description={t('admin.practice.description')}
        actions={
          <Button icon="refresh" onClick={() => setReload((n) => n + 1)}>
            {t('admin.system.refresh')}
          </Button>
        }
      />

      <StatGrid>
        <StatCard
          label={t('admin.practice.sessions')}
          icon="activity"
          tone="primary"
          value={overview ? formatNumber(overview.sessions) : '—'}
          hint={
            overview
              ? t('admin.practice.sessionsHint', { from: longDate(overview.from), to: longDate(overview.to) })
              : undefined
          }
        />
        <StatCard
          label={t('admin.practice.minutes')}
          icon="clock"
          tone="neutral"
          value={overview ? formatNumber(overview.minutes) : '—'}
          hint={overview ? t('admin.practice.activeMembers', { count: overview.activeMembers }) : undefined}
        />
        <StatCard
          label={t('admin.practice.accuracy')}
          icon="check"
          tone="success"
          value={pct(overview?.averageAccuracy)}
          hint={t('admin.practice.accuracyHint')}
        />
        <StatCard
          label={t('admin.practice.completion')}
          icon="chart"
          tone="violet"
          value={overview?.completionRate == null ? '—' : pct(overview.completionRate * 100)}
          hint={t('admin.practice.completionHint')}
        />
        <StatCard
          label={t('admin.practice.anomalous')}
          icon="alert"
          tone={overview && overview.anomalous > 0 ? 'warning' : 'neutral'}
          value={overview ? formatNumber(overview.anomalous) : '—'}
          hint={t('admin.practice.anomalousHint')}
          alert={!!overview && overview.anomalous > 0}
        />
      </StatGrid>

      <Card title={t('admin.practice.chartTitle')}>
        <div className="dash-chart" role="img" aria-label={t('admin.practice.chartTitle')}>
          <ResponsiveContainer>
            <BarChart data={days} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid stroke="var(--ui-chart-grid)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={shortDate}
                tick={AXIS}
                axisLine={false}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: 'var(--ui-chart-cursor)' }}
                formatter={(value) => [t('admin.practice.chartTip', { count: formatNumber(Number(value)) })]}
                labelFormatter={(label) => longDate(String(label))}
              />
              <Bar
                dataKey="minutes"
                fill="var(--ui-chart-series-1, var(--adm-primary))"
                radius={[4, 4, 0, 0]}
                maxBarSize={18}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Toolbar>
        <SearchForm
          value={keywordInput}
          onChange={setKeywordInput}
          onSubmit={() => changeFilter(() => setKeyword(keywordInput.trim()))}
          placeholder={t('admin.practice.searchPlaceholder')}
        />
        {select(t('admin.practice.mode'), mode, setMode, [
          ['', t('admin.practice.anyMode')],
          ...MODES.map((m): [string, string] => [m, t(`admin.practice.mode_${m}`)]),
        ])}
        {select(t('admin.practice.status'), status, setStatus, [
          ['', t('admin.practice.anyStatus')],
          ...STATUSES.map((s): [string, string] => [s, t(`admin.practice.status_${s}`)]),
        ])}
        <label className="adm-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
          <input
            type="checkbox"
            checked={anomalousOnly}
            onChange={(e) => changeFilter(() => setAnomalousOnly(e.target.checked))}
          />
          {t('admin.practice.onlyAnomalous')}
        </label>
        <input
          type="date"
          className="adm-input"
          style={{ width: 'auto' }}
          aria-label={t('admin.practice.fromDate')}
          value={from}
          max={to || undefined}
          onChange={(e) => changeFilter(() => setFrom(e.target.value))}
        />
        <span className="adm-subtle">–</span>
        <input
          type="date"
          className="adm-input"
          style={{ width: 'auto' }}
          aria-label={t('admin.practice.toDate')}
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
                setMode('');
                setStatus('');
                setAnomalousOnly(false);
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
              <th>{t('admin.practice.member')}</th>
              <th>{t('admin.practice.score')}</th>
              <th>{t('admin.practice.mode')}</th>
              <th>{t('admin.practice.status')}</th>
              <th>{t('admin.practice.startedAt')}</th>
              <th className="adm-table__num">{t('admin.practice.duration')}</th>
              <th>{t('admin.practice.result')}</th>
              {canManage && <th className="adm-table__actions">{t('admin.practice.actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {!result && <TableState colSpan={canManage ? 8 : 7} loading />}
            {result?.content.map((s) => (
              <tr key={s.id}>
                <td>
                  <CellTitle sub={s.memberName ? s.memberEmail : undefined}>
                    <Link to={`/admin/members/${s.memberId}`}>{memberLabel(s)}</Link>
                  </CellTitle>
                </td>
                <td>
                  <Link to={`/admin/scores/${s.scoreId}`}>{s.scoreTitle ?? '—'}</Link>
                </td>
                <td className="adm-muted">{s.mode ? t(`admin.practice.mode_${s.mode}`) : '—'}</td>
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-start' }}>
                    <Badge tone={STATUS_TONE[s.status] ?? 'neutral'}>{t(`admin.practice.status_${s.status}`)}</Badge>
                    {s.anomalies.map((a: PracticeAnomaly) => (
                      <Badge key={a} tone="warning" title={t(`admin.practice.anomalyHint_${a}`)}>
                        {t(`admin.practice.anomaly_${a}`)}
                      </Badge>
                    ))}
                  </div>
                </td>
                <td className="adm-nowrap adm-muted">{formatDateTime(s.startedAt)}</td>
                <td className="adm-table__num adm-muted">{clock(s.durationSeconds)}</td>
                <td className="adm-muted">
                  {s.accuracyPct == null && s.scorePoints == null ? (
                    t('admin.practice.noResult')
                  ) : (
                    <CellTitle
                      sub={
                        s.totalNotes != null
                          ? t('admin.practice.notes', { count: formatNumber(s.totalNotes) })
                          : undefined
                      }
                    >
                      {s.accuracyPct != null
                        ? pct(s.accuracyPct)
                        : t('admin.practice.points', { value: s.scorePoints ?? 0 })}
                    </CellTitle>
                  )}
                </td>
                {canManage && (
                  <td className="adm-table__actions">
                    <div className="adm-table__actions-inner">
                      {s.canClose && (
                        <Button size="sm" icon="x" disabled={busyId === s.id} onClick={() => close(s)}>
                          {t('admin.practice.close')}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        icon="trash"
                        disabled={busyId === s.id}
                        onClick={() => remove(s)}
                      >
                        {t('admin.practice.delete')}
                      </Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {result && result.content.length === 0 && (
              <TableState
                colSpan={canManage ? 8 : 7}
                icon="activity"
                title={t('admin.practice.emptyTitle')}
                description={filtered ? t('admin.practice.noMatch') : undefined}
              />
            )}
          </tbody>
        </Table>
        {result && result.totalPages > 1 && (
          <Pager
            page={result.pageNumber}
            totalPages={result.totalPages}
            totalElements={result.totalElements}
            unit={t('admin.practice.unit')}
            onChange={setPage}
          />
        )}
      </Card>
    </>
  );
}
