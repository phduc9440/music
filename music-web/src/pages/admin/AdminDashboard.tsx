import { useEffect, useMemo, useState } from 'react';
import { Link } from '../../routes/transition-nav';
import { toast } from 'react-toastify';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button, Card, CellTitle, PageHeader, StatCard, StatGrid, Table, TableState, Tabs } from '../../components/ui';
import { adminApi } from '../../services';
import type { AdminDashboard as DashboardData, DashboardKeyCount } from '../../types';
import './AdminDashboard.css';
import { formatCompact, formatDate, formatNumber, formatVnd, labelMap, t } from '../../i18n/core';

const RANGES = [7, 30, 90];

const VISIBILITY_LABEL: Record<string, string> = labelMap('admin.dashboard.visibility', [
  'PRIVATE',
  'PENDING',
  'PUBLIC',
]);
const SOURCE_LABEL: Record<string, string> = labelMap('admin.dashboard.source', ['OMR', 'IMPORT', 'MANUAL', 'UNKNOWN']);
const DIFFICULTY_LABEL: Record<string, string> = labelMap('admin.dashboard.difficulty', [
  'EASY',
  'MEDIUM',
  'HARD',
  'EXPERT',
  'NONE',
]);
const DIFFICULTY_ORDER = ['EASY', 'MEDIUM', 'HARD', 'EXPERT', 'NONE'];
const VISIBILITY_ORDER = ['PUBLIC', 'PENDING', 'PRIVATE'];

// Màu trạng thái cố định (không dùng chung với màu series); luôn kèm biểu tượng + nhãn chữ
const AI_COLOR: Record<string, string> = {
  COMPLETED: 'var(--ui-chart-ok)',
  PROCESSING: 'var(--ui-chart-busy)',
  PENDING: 'var(--ui-chart-busy)',
  FAILED: 'var(--ui-chart-fail)',
  CANCELLED: 'var(--ui-chart-neutral)',
};
const AI_STATUS_LABEL: Record<string, string> = labelMap('admin.dashboard.aiStatus', [
  'COMPLETED',
  'PROCESSING',
  'PENDING',
  'FAILED',
  'CANCELLED',
]);
const AI_ORDER = ['COMPLETED', 'PROCESSING', 'PENDING', 'FAILED', 'CANCELLED'];

const SUB_SOURCE_LABEL: Record<string, string> = labelMap('billing.source', ['PAYMENT', 'POINTS_TRIAL', 'ADMIN_GRANT']);
const SUB_SOURCE_ORDER = ['PAYMENT', 'POINTS_TRIAL', 'ADMIN_GRANT'];

const SERIES_SCORES = 'var(--ui-chart-scores)';
const SERIES_PRACTICE = 'var(--ui-chart-practice)';
// Slot 7 (violet) của bảng màu dataviz, để thành viên không trùng màu với bản nhạc/luyện tập
const SERIES_MEMBERS = 'var(--ui-chart-members)';
const SERIES_REVENUE = 'var(--ui-chart-revenue)';
const AXIS = { fontSize: 12, fill: 'var(--ui-chart-axis)' };

const nf = { format: (n: number) => formatNumber(n) };

const shortDate = (iso: string) => {
  const [, m, d] = iso.split('-');
  return t('admin.dashboard.shortDate', { day: Number(d), month: Number(m) });
};
const longDate = (iso: string) => formatDate(`${iso}T00:00:00`);

/** Tiêu đề nhóm, chia trang thành các phần (thẻ số liệu + biểu đồ cùng chủ đề). */
function Section({ title }: { title: string }) {
  return <h2 className="dash-section">{title}</h2>;
}

const orderBy = (rows: DashboardKeyCount[], order: string[]) =>
  [...rows].sort((a, b) => {
    const ia = order.indexOf(a.key);
    const ib = order.indexOf(b.key);
    return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib);
  });

interface TipProps {
  active?: boolean;
  payload?: readonly { value?: unknown; payload?: Record<string, unknown> }[];
  label?: string | number;
}

function Tip({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="dash-tooltip">
      <div className="dash-tooltip__title">{title}</div>
      {lines.map((l) => (
        <div key={l}>{l}</div>
      ))}
    </div>
  );
}

/** Thẻ biểu đồ: tiêu đề, mô tả, nút chuyển sang dạng bảng (cho người dùng trình đọc màn hình hoặc cần số chính xác). */
function ChartCard({
  title,
  sub,
  table,
  className,
  children,
}: {
  title: string;
  sub?: string;
  table: { head: [string, string]; rows: [string, string][] };
  className?: string;
  children: React.ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <Card
      title={title}
      description={sub}
      className={className}
      actions={
        <Tabs
          value={asTable ? 'table' : 'chart'}
          onChange={(v) => setAsTable(v === 'table')}
          items={[
            { value: 'chart', label: t('admin.dashboard.chart') },
            { value: 'table', label: t('admin.dashboard.table') },
          ]}
        />
      }
    >
      {asTable ? (
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>{table.head[0]}</th>
                <th>{table.head[1]}</th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map(([a, b]) => (
                <tr key={a}>
                  <td>{a}</td>
                  <td>{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </Card>
  );
}

/** Biểu đồ cột ngang cho số lượng theo nhóm; mỗi cột ghi số ngay đầu cột, nhãn nhóm nằm ở trục. */
function HBar({
  rows,
  color,
  unit,
}: {
  rows: { label: string; count: number; color?: string }[];
  color: string;
  unit: string;
}) {
  if (rows.length === 0) return <div className="dash-empty">{t('admin.dashboard.noData')}</div>;
  const height = Math.max(120, rows.length * 38 + 16);
  return (
    <div className="dash-chart" style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 36, bottom: 4, left: 0 }} barCategoryGap={10}>
          <XAxis type="number" hide domain={[0, (max: number) => Math.max(1, max) * 1.15]} />
          <YAxis type="category" dataKey="label" width={118} tick={AXIS} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: 'var(--ui-chart-cursor)' }}
            content={({ active, payload }: TipProps) =>
              active && payload?.[0] ? (
                <Tip
                  title={String(payload[0].payload?.label)}
                  lines={[`${nf.format(Number(payload[0].value))} ${unit}`]}
                />
              ) : null
            }
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22}>
            {rows.map((r) => (
              <Cell key={r.label} fill={r.color ?? color} />
            ))}
            <LabelList
              dataKey="count"
              position="right"
              formatter={(v) => nf.format(Number(v))}
              style={{ fontSize: 12, fill: 'var(--ui-text)' }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Admin: dashboard tổng quan (số liệu chính + biểu đồ theo ngày và theo nhóm). */
export default function AdminDashboard() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<DashboardData | null>(null);
  const [reload, setReload] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .getDashboard(days)
      .then((res) => !cancelled && setData(res.data.result))
      .catch(() => !cancelled && toast.error(t('admin.dashboard.loadFailed')))
      .finally(() => !cancelled && setRefreshing(false));
    return () => {
      cancelled = true;
    };
  }, [days, reload]);

  const refresh = () => {
    setRefreshing(true);
    setReload((n) => n + 1);
  };

  const tot = data?.totals;

  const scoresDay = useMemo(() => data?.scoresByDay ?? [], [data]);
  const membersDay = useMemo(() => data?.membersByDay ?? [], [data]);
  const practiceDay = useMemo(() => data?.practiceByDay ?? [], [data]);
  const newScores = scoresDay.reduce((s, d) => s + d.count, 0);
  const newMembers = membersDay.reduce((s, d) => s + d.count, 0);
  const practiceMinutes = practiceDay.reduce((s, d) => s + d.minutes, 0);

  const visibility = orderBy(data?.scoresByVisibility ?? [], VISIBILITY_ORDER).map((r) => ({
    label: VISIBILITY_LABEL[r.key] ?? r.key,
    count: r.count,
  }));
  const source = [...(data?.scoresBySource ?? [])]
    .sort((a, b) => b.count - a.count)
    .map((r) => ({ label: SOURCE_LABEL[r.key] ?? r.key, count: r.count }));
  const difficulty = orderBy(data?.scoresByDifficulty ?? [], DIFFICULTY_ORDER).map((r) => ({
    label: DIFFICULTY_LABEL[r.key] ?? r.key,
    count: r.count,
  }));
  const ai = orderBy(data?.aiTasksByStatus ?? [], AI_ORDER).map((r) => ({
    label: AI_STATUS_LABEL[r.key] ?? r.key,
    count: r.count,
    color: AI_COLOR[r.key],
  }));
  const tags = (data?.topTags ?? []).map((r) => ({ label: r.key, count: r.count }));
  const bill = data?.billing;
  const revenueDay = data?.revenueByDay ?? [];
  const subsByPlan = (data?.subscriptionsByPlan ?? []).map((r) => ({ label: r.key, count: r.count }));
  const subsBySource = orderBy(data?.subscriptionsBySource ?? [], SUB_SOURCE_ORDER).map((r) => ({
    label: SUB_SOURCE_LABEL[r.key] ?? r.key,
    count: r.count,
  }));
  const rowsOf = (rows: { label: string; count: number }[]): [string, string][] =>
    rows.map((r) => [r.label, nf.format(r.count)]);

  const maxViews = Math.max(1, ...(data?.topViewed ?? []).map((s) => s.viewCount));

  return (
    <div className="dash">
      <PageHeader
        title={t('admin.menu.items.dashboard')}
        description={t('admin.dashboard.description', { days })}
        actions={
          <>
            <select
              className="adm-input"
              aria-label={t('admin.dashboard.range')}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              {RANGES.map((r) => (
                <option key={r} value={r}>
                  {t('admin.dashboard.lastDays', { count: r })}
                </option>
              ))}
            </select>
            <Button icon="refresh" loading={refreshing} onClick={refresh}>
              {t('admin.system.refresh')}
            </Button>
          </>
        }
      />

      <StatGrid>
        <StatCard
          label={t('admin.menu.items.members')}
          icon="users"
          tone="primary"
          value={tot ? nf.format(tot.members) : '—'}
          hint={
            tot
              ? t('admin.dashboard.membersHint', {
                  active: tot.activeMembers,
                  locked: tot.lockedMembers,
                  admins: tot.admins,
                })
              : undefined
          }
          to="/admin/members"
        />
        <StatCard
          label={t('upload.review.tabs.score')}
          icon="music"
          tone="primary"
          value={tot ? nf.format(tot.scores) : '—'}
          hint={
            tot
              ? t('admin.dashboard.scoresHint', { public: tot.publicScores, official: tot.officialScores })
              : undefined
          }
          to="/admin/scores"
        />
        <StatCard
          label={t('admin.menu.items.pending')}
          icon="clock"
          tone="warning"
          value={tot ? nf.format(tot.pendingScores) : '—'}
          hint={tot && tot.pendingScores > 0 ? t('admin.dashboard.needsAction') : t('admin.pending.emptyTitle')}
          to="/admin/pending-scores"
          alert={!!tot && tot.pendingScores > 0}
        />
        <StatCard
          label={t('admin.dashboard.reviews')}
          icon="star"
          tone="violet"
          value={tot ? nf.format(tot.reviews) : '—'}
          hint={
            tot
              ? tot.averageRating == null
                ? t('admin.dashboard.noRating')
                : t('admin.dashboard.avgRating', { value: tot.averageRating })
              : undefined
          }
        />
        <StatCard
          label={t('admin.dashboard.sessions')}
          icon="activity"
          tone="success"
          value={tot ? nf.format(tot.practiceSessions) : '—'}
          hint={t('admin.dashboard.allTime')}
        />
        <StatCard
          label={t('admin.dashboard.aiTasks')}
          icon="cpu"
          tone={tot && tot.aiTasksFailed > 0 ? 'danger' : 'neutral'}
          value={tot ? nf.format(tot.aiTasksRunning) : '—'}
          hint={tot ? t('admin.dashboard.aiHint', { failed: tot.aiTasksFailed }) : undefined}
          alert={!!tot && tot.aiTasksFailed > 0}
          to="/admin/ai-tasks"
        />
      </StatGrid>

      <Section title={t('admin.dashboard.sectionBilling')} />
      <StatGrid>
        <StatCard
          label={t('admin.dashboard.revenue')}
          icon="chart"
          tone="success"
          value={bill ? formatVnd(bill.revenue) : '—'}
          hint={
            bill
              ? [
                  t('admin.dashboard.revenueHint', { count: bill.paidOrders, n: nf.format(bill.paidOrders), days }),
                  bill.refundedOrders > 0
                    ? t('admin.dashboard.refundedHint', { amount: formatVnd(bill.refundedAmount) })
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : undefined
          }
          to="/admin/revenue"
        />
        <StatCard
          label={t('admin.dashboard.activeSubs')}
          icon="star"
          tone="primary"
          value={bill ? nf.format(bill.activeSubscriptions) : '—'}
          hint={
            bill
              ? t('admin.dashboard.activeSubsHint', {
                  count: bill.subscribedMembers,
                  n: nf.format(bill.subscribedMembers),
                })
              : undefined
          }
          to="/admin/member-plans"
        />
        <StatCard
          label={t('admin.dashboard.pendingOrders')}
          icon="clock"
          tone="warning"
          value={bill ? nf.format(bill.pendingOrders) : '—'}
          hint={t('admin.dashboard.pendingOrdersHint')}
          to="/admin/revenue"
        />
        <StatCard
          label={t('admin.dashboard.activeBans')}
          icon="lock"
          tone={bill && bill.activeBans > 0 ? 'danger' : 'neutral'}
          value={bill ? nf.format(bill.activeBans) : '—'}
          hint={bill && bill.activeBans > 0 ? t('admin.dashboard.activeBansHint') : t('admin.dashboard.noBans')}
          to="/admin/member-plans?tab=sanction"
        />
      </StatGrid>

      <div className="adm-grid-2">
        <ChartCard
          title={t('admin.dashboard.revenueByDay')}
          sub={
            bill
              ? t('admin.dashboard.revenueByDaySub', {
                  amount: formatVnd(bill.revenue),
                  count: bill.paidOrders,
                  n: nf.format(bill.paidOrders),
                  days,
                })
              : undefined
          }
          table={{
            head: [t('admin.dashboard.date'), t('admin.dashboard.amountOrders')],
            rows: revenueDay.map((d) => [longDate(d.date), `${formatVnd(d.amount)} (${nf.format(d.orders)})`]),
          }}
          className="adm-span-all"
        >
          <div className="dash-chart">
            <ResponsiveContainer>
              <AreaChart data={revenueDay} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--ui-chart-grid)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={shortDate}
                  tick={AXIS}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={24}
                />
                <YAxis
                  allowDecimals={false}
                  tick={AXIS}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  tickFormatter={(v) => formatCompact(Number(v))}
                />
                <Tooltip
                  cursor={{ stroke: 'var(--ui-chart-neutral)', strokeWidth: 1 }}
                  content={({ active, payload, label }: TipProps) =>
                    active && payload?.[0] ? (
                      <Tip
                        title={longDate(String(label))}
                        lines={[
                          formatVnd(Number(payload[0].value)),
                          t('admin.dashboard.ordersTip', {
                            count: Number(payload[0].payload?.orders ?? 0),
                            n: nf.format(Number(payload[0].payload?.orders ?? 0)),
                          }),
                        ]}
                      />
                    ) : null
                  }
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke={SERIES_REVENUE}
                  strokeWidth={2}
                  fill={SERIES_REVENUE}
                  fillOpacity={0.12}
                  dot={false}
                  activeDot={{ r: 5, stroke: 'var(--ui-surface)', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <div className="adm-grid-2">
        <ChartCard
          title={t('admin.dashboard.subsByPlan')}
          sub={t('admin.dashboard.subsByPlanSub')}
          table={{ head: [t('admin.dashboard.planColumn'), t('admin.dashboard.subsCount')], rows: rowsOf(subsByPlan) }}
        >
          <HBar rows={subsByPlan} color={SERIES_REVENUE} unit={t('admin.dashboard.subsUnit')} />
        </ChartCard>
        <ChartCard
          title={t('admin.dashboard.subsBySource')}
          sub={t('admin.dashboard.subsBySourceSub')}
          table={{
            head: [t('admin.dashboard.sourceColumn'), t('admin.dashboard.subsCount')],
            rows: rowsOf(subsBySource),
          }}
        >
          <HBar rows={subsBySource} color={SERIES_REVENUE} unit={t('admin.dashboard.subsUnit')} />
        </ChartCard>
      </div>

      <Section title={t('admin.dashboard.sectionActivity')} />
      <div className="adm-grid-2">
        <ChartCard
          title={t('admin.dashboard.newScores')}
          sub={t('admin.dashboard.newScoresSub', { count: newScores, n: nf.format(newScores), days })}
          table={{
            head: [t('admin.dashboard.date'), t('admin.dashboard.scoreCount')],
            rows: scoresDay.map((d) => [longDate(d.date), nf.format(d.count)]),
          }}
        >
          <div className="dash-chart">
            <ResponsiveContainer>
              <AreaChart data={scoresDay} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
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
                  cursor={{ stroke: 'var(--ui-chart-neutral)', strokeWidth: 1 }}
                  content={({ active, payload, label }: TipProps) =>
                    active && payload?.[0] ? (
                      <Tip
                        title={longDate(String(label))}
                        lines={[
                          t('admin.dashboard.newScoresTip', {
                            count: Number(payload[0].value),
                            n: nf.format(Number(payload[0].value)),
                          }),
                        ]}
                      />
                    ) : null
                  }
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke={SERIES_SCORES}
                  strokeWidth={2}
                  fill={SERIES_SCORES}
                  fillOpacity={0.12}
                  dot={false}
                  activeDot={{ r: 5, stroke: 'var(--ui-surface)', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title={t('admin.dashboard.practiceByDay')}
          sub={t('admin.dashboard.practiceSub', { minutes: nf.format(Math.round(practiceMinutes)), days })}
          table={{
            head: [t('admin.dashboard.date'), t('admin.dashboard.minutesSessions')],
            rows: practiceDay.map((d) => [longDate(d.date), `${nf.format(d.minutes)} (${d.sessions})`]),
          }}
        >
          <div className="dash-chart">
            <ResponsiveContainer>
              <BarChart data={practiceDay} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
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
                  content={({ active, payload, label }: TipProps) =>
                    active && payload?.[0] ? (
                      <Tip
                        title={longDate(String(label))}
                        lines={[
                          t('admin.dashboard.minutesTip', { count: nf.format(Number(payload[0].value)) }),
                          t('admin.dashboard.sessionsTip', {
                            count: Number(payload[0].payload?.sessions ?? 0),
                            n: nf.format(Number(payload[0].payload?.sessions ?? 0)),
                          }),
                        ]}
                      />
                    ) : null
                  }
                />
                <Bar dataKey="minutes" fill={SERIES_PRACTICE} radius={[4, 4, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <div className="adm-grid-2">
        <ChartCard
          title={t('admin.dashboard.newMembers')}
          sub={`${t('admin.dashboard.newMembersSub', { count: newMembers, n: nf.format(newMembers), days })}${
            data && data.membersWithoutDate > 0
              ? ` · ${t('admin.dashboard.noRegDate', { count: data.membersWithoutDate, n: nf.format(data.membersWithoutDate) })}`
              : ''
          }`}
          table={{
            head: [t('admin.dashboard.date'), t('admin.dashboard.accountCount')],
            rows: membersDay.map((d) => [longDate(d.date), nf.format(d.count)]),
          }}
        >
          <div className="dash-chart">
            <ResponsiveContainer>
              <BarChart data={membersDay} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
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
                  content={({ active, payload, label }: TipProps) =>
                    active && payload?.[0] ? (
                      <Tip
                        title={longDate(String(label))}
                        lines={[
                          t('admin.dashboard.newMembersTip', {
                            count: Number(payload[0].value),
                            n: nf.format(Number(payload[0].value)),
                          }),
                        ]}
                      />
                    ) : null
                  }
                />
                <Bar dataKey="count" fill={SERIES_MEMBERS} radius={[4, 4, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard
          title={t('admin.members.privacy')}
          sub={t('admin.dashboard.visibilitySub')}
          table={{
            head: [t('admin.official.statusColumn'), t('admin.dashboard.scoreCount')],
            rows: rowsOf(visibility),
          }}
        >
          <HBar rows={visibility} color={SERIES_SCORES} unit={t('admin.official.unitScores')} />
        </ChartCard>
      </div>

      <Section title={t('admin.dashboard.sectionBreakdown')} />
      <div className="adm-grid-2">
        <ChartCard
          title={t('admin.dashboard.sourceTitle')}
          sub={t('admin.dashboard.sourceSub')}
          table={{ head: [t('admin.scores.sourceLabel'), t('admin.dashboard.scoreCount')], rows: rowsOf(source) }}
        >
          <HBar rows={source} color={SERIES_SCORES} unit={t('admin.official.unitScores')} />
        </ChartCard>
        <ChartCard
          title={t('scores.hero.difficulty')}
          sub={t('admin.dashboard.difficultySub')}
          table={{ head: [t('scores.hero.difficulty'), t('admin.dashboard.scoreCount')], rows: rowsOf(difficulty) }}
        >
          <HBar rows={difficulty} color={SERIES_SCORES} unit={t('admin.official.unitScores')} />
        </ChartCard>
      </div>

      <div className="adm-grid-2">
        <ChartCard
          title={t('admin.dashboard.aiByStatus')}
          sub={t('admin.dashboard.aiSub')}
          table={{ head: [t('admin.official.statusColumn'), t('admin.dashboard.taskCount')], rows: rowsOf(ai) }}
        >
          <HBar rows={ai} color="var(--ui-chart-neutral)" unit={t('admin.dashboard.taskUnit')} />
        </ChartCard>
        <ChartCard
          title={t('admin.dashboard.topTags')}
          sub={t('admin.dashboard.topTagsSub')}
          table={{ head: [t('scores.explore.tag'), t('admin.dashboard.scoreCount')], rows: rowsOf(tags) }}
        >
          <HBar rows={tags} color={SERIES_SCORES} unit={t('admin.official.unitScores')} />
        </ChartCard>
      </div>

      <div className="adm-grid-2">
        <Card
          title={t('admin.dashboard.mostViewed')}
          description={t('admin.dashboard.mostViewedSub')}
          flush
          className="adm-span-all"
        >
          <Table>
            <thead>
              <tr>
                <th>{t('upload.review.tabs.score')}</th>
                <th style={{ width: '40%' }}>{t('admin.dashboard.views')}</th>
              </tr>
            </thead>
            <tbody>
              {!data && <TableState colSpan={2} loading />}
              {data?.topViewed.map((s) => (
                <tr key={s.id}>
                  <td>
                    <CellTitle sub={s.ownerEmail}>
                      <Link to={`/admin/scores/${s.id}`}>{s.title}</Link>
                    </CellTitle>
                  </td>
                  <td>
                    <div className="dash-bar-cell">
                      <div className="dash-bar-cell__track">
                        <div className="dash-bar-cell__fill" style={{ width: `${(s.viewCount / maxViews) * 100}%` }} />
                      </div>
                      <span className="adm-table__num">{nf.format(s.viewCount)}</span>
                    </div>
                  </td>
                </tr>
              ))}
              {data && data.topViewed.length === 0 && (
                <TableState colSpan={2} icon="eye" title={t('admin.dashboard.noViews')} />
              )}
            </tbody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
