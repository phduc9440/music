import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { Button, Card, CellTitle, Icon, PageHeader, Table, TableState, Tabs } from '../../components/ui';
import type { IconName } from '../../components/ui';
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

/** Nhóm chỉ số trong bảng chọn biểu đồ (thứ tự hiển thị). */
type ChartGroup = 'billing' | 'activity' | 'breakdown';
const CHART_GROUPS: { key: ChartGroup; labelKey: string }[] = [
  { key: 'billing', labelKey: 'admin.dashboard.sectionBilling' },
  { key: 'activity', labelKey: 'admin.dashboard.sectionActivity' },
  { key: 'breakdown', labelKey: 'admin.dashboard.sectionBreakdown' },
];
/** Một chỉ số trong bảng chọn: ô bấm (biểu tượng, tên, con số tóm tắt) và thẻ biểu đồ hiện ra khi được chọn. */
interface ChartDef {
  key: string;
  group: ChartGroup;
  icon: IconName;
  label: string;
  summary: string;
  card: ReactNode;
}
const sum = (rows: { count: number }[]) => rows.reduce((s, r) => s + r.count, 0);
/** Nhãn của nhóm đông nhất (vd. độ khó có nhiều bản nhất), để làm con số tóm tắt trên ô chọn. */
const topLabel = (rows: { label: string; count: number }[]) =>
  rows.length ? rows.reduce((a, b) => (b.count > a.count ? b : a)).label : '—';

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

/**
 * Đường xu hướng nhỏ trong thẻ số liệu: cả kỳ vẽ màu trầm, vùng dưới phủ nhạt màu của chỉ số, điểm cuối (hôm nay) là
 * chấm màu nhấn. Chấm vẽ bằng HTML để không bị méo khi SVG co giãn theo bề ngang thẻ.
 */
function Sparkline({
  values,
  color,
  height = 36,
  label,
}: {
  values: number[];
  color: string;
  height?: number;
  label: string;
}) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * 100, height - 3 - (v / max) * (height - 6)]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join('');
  const [, lastY] = pts[pts.length - 1];
  return (
    <div className="dash-spark" style={{ height }} role="img" aria-label={label} title={label}>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <path d={`${line}L100,${height}L0,${height}Z`} fill={color} fillOpacity={0.12} />
        <path
          d={line}
          fill="none"
          stroke="var(--ui-chart-neutral)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className="dash-spark__dot" style={{ top: `${(lastY / height) * 100}%`, background: color }} />
    </div>
  );
}

/** Nhãn đọc to cho sparkline: khoảng thời gian, tổng và ngày cao nhất. */
const sparkLabel = (rows: { date: string; value: number }[], days: number, fmt: (n: number) => string) => {
  if (rows.length === 0) return '';
  const top = rows.reduce((a, b) => (b.value > a.value ? b : a));
  return t('admin.dashboard.sparkLabel', {
    days,
    total: fmt(rows.reduce((s, r) => s + r.value, 0)),
    max: fmt(top.value),
    date: longDate(top.date),
  });
};

/** Thẻ số liệu: nhãn + biểu tượng, con số lớn, một dòng phụ, và đường xu hướng nếu có số liệu theo ngày. */
function Kpi({
  label,
  icon,
  value,
  hint,
  to,
  spark,
}: {
  label: string;
  icon: IconName;
  value: string;
  hint?: string;
  to: string;
  spark?: ReactNode;
}) {
  return (
    <Link to={to} className="dash-kpi">
      <span className="dash-kpi__top">
        <span className="dash-kpi__label">{label}</span>
        <Icon name={icon} size={16} />
      </span>
      <span className="dash-kpi__value">{value}</span>
      {hint && <span className="dash-kpi__hint">{hint}</span>}
      {spark}
    </Link>
  );
}

/** Một việc cần admin xử lý: số lượng > 0 thì mang màu trạng thái (kèm biểu tượng + chữ), bằng 0 thì hiện dấu ổn. */
interface AttentionItem {
  key: string;
  label: string;
  hint: string;
  count: number;
  tone: 'warning' | 'danger';
  icon: IconName;
  to: string;
}

/** Admin: dashboard tổng quan (số liệu chính + biểu đồ theo ngày và theo nhóm). */
export default function AdminDashboard() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<DashboardData | null>(null);
  const [reload, setReload] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  // biểu đồ đang xem nằm trên URL (?chart=...) để gửi đường dẫn là mở đúng biểu đồ đó
  const [params, setParams] = useSearchParams();
  const chartKey = params.get('chart');
  const selectChart = (key: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('chart', key);
        return next;
      },
      // đổi biểu đồ là đổi nội dung trong trang, không phải sang trang khác: giữ nguyên vị trí cuộn
      { replace: true, preventScrollReset: true },
    );

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
  // A-02: số phiên cùng khoảng ngày với số phút (trước đây ghép phút 30 ngày với số phiên từ trước tới nay)
  const practiceSessions = practiceDay.reduce((s, d) => s + d.sessions, 0);

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

  const attention: AttentionItem[] = [
    {
      key: 'pending',
      label: t('admin.menu.items.pending'),
      hint: tot && tot.pendingScores > 0 ? t('admin.dashboard.pendingReview') : t('admin.dashboard.allClear'),
      count: tot?.pendingScores ?? 0,
      tone: 'warning',
      icon: 'clock',
      to: '/admin/pending-scores',
    },
    {
      key: 'ai',
      label: t('admin.dashboard.aiFailed'),
      hint: t('admin.dashboard.aiRunning', { n: nf.format(tot?.aiTasksRunning ?? 0) }),
      count: tot?.aiTasksFailed ?? 0,
      tone: 'danger',
      icon: 'alert',
      to: '/admin/ai-tasks',
    },
    {
      key: 'orders',
      label: t('admin.dashboard.pendingOrders'),
      hint: bill && bill.pendingOrders > 0 ? t('admin.dashboard.pendingOrdersHint') : t('admin.dashboard.allClear'),
      count: bill?.pendingOrders ?? 0,
      tone: 'warning',
      icon: 'inbox',
      to: '/admin/revenue',
    },
    {
      key: 'bans',
      label: t('admin.dashboard.activeBans'),
      hint: bill && bill.activeBans > 0 ? t('admin.dashboard.activeBansHint') : t('admin.dashboard.noBans'),
      count: bill?.activeBans ?? 0,
      tone: 'danger',
      icon: 'lock',
      to: '/admin/member-plans?tab=sanction',
    },
  ];

  // Mọi biểu đồ / bảng phân tích: chỉ vẽ cái đang được chọn trong bảng chọn bên dưới, không bày hết ra một lúc
  const charts: ChartDef[] = [
    {
      key: 'revenue',
      group: 'billing',
      icon: 'chart',
      label: t('admin.dashboard.revenueByDay'),
      summary: bill ? formatVnd(bill.revenue) : '—',
      card: (
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
      ),
    },
    {
      key: 'subsPlan',
      group: 'billing',
      icon: 'layers',
      label: t('admin.dashboard.subsByPlan'),
      summary: `${nf.format(sum(subsByPlan))} ${t('admin.dashboard.subsUnit')}`,
      card: (
        <ChartCard
          title={t('admin.dashboard.subsByPlan')}
          sub={t('admin.dashboard.subsByPlanSub')}
          table={{ head: [t('admin.dashboard.planColumn'), t('admin.dashboard.subsCount')], rows: rowsOf(subsByPlan) }}
        >
          <HBar rows={subsByPlan} color={SERIES_REVENUE} unit={t('admin.dashboard.subsUnit')} />
        </ChartCard>
      ),
    },
    {
      key: 'subsSource',
      group: 'billing',
      icon: 'key',
      label: t('admin.dashboard.subsBySource'),
      summary: topLabel(subsBySource),
      card: (
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
      ),
    },
    {
      key: 'scores',
      group: 'activity',
      icon: 'music',
      label: t('admin.dashboard.newScores'),
      summary: t('admin.dashboard.newScoresSub', { count: newScores, n: nf.format(newScores), days }),
      card: (
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
      ),
    },
    {
      key: 'practice',
      group: 'activity',
      icon: 'activity',
      label: t('admin.dashboard.practiceByDay'),
      summary: t('admin.dashboard.practiceSub', { minutes: nf.format(Math.round(practiceMinutes)), days }),
      card: (
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
      ),
    },
    {
      key: 'members',
      group: 'activity',
      icon: 'users',
      label: t('admin.dashboard.newMembers'),
      summary: t('admin.dashboard.newMembersSub', { count: newMembers, n: nf.format(newMembers), days }),
      card: (
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
      ),
    },
    {
      key: 'visibility',
      group: 'breakdown',
      icon: 'globe',
      label: t('admin.members.privacy'),
      summary: `${nf.format(sum(visibility))} ${t('admin.official.unitScores')}`,
      card: (
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
      ),
    },
    {
      key: 'source',
      group: 'breakdown',
      icon: 'upload',
      label: t('admin.dashboard.sourceTitle'),
      summary: topLabel(source),
      card: (
        <ChartCard
          title={t('admin.dashboard.sourceTitle')}
          sub={t('admin.dashboard.sourceSub')}
          table={{ head: [t('admin.scores.sourceLabel'), t('admin.dashboard.scoreCount')], rows: rowsOf(source) }}
        >
          <HBar rows={source} color={SERIES_SCORES} unit={t('admin.official.unitScores')} />
        </ChartCard>
      ),
    },
    {
      key: 'difficulty',
      group: 'breakdown',
      icon: 'sliders',
      label: t('scores.hero.difficulty'),
      summary: topLabel(difficulty),
      card: (
        <ChartCard
          title={t('scores.hero.difficulty')}
          sub={t('admin.dashboard.difficultySub')}
          table={{ head: [t('scores.hero.difficulty'), t('admin.dashboard.scoreCount')], rows: rowsOf(difficulty) }}
        >
          <HBar rows={difficulty} color={SERIES_SCORES} unit={t('admin.official.unitScores')} />
        </ChartCard>
      ),
    },
    {
      key: 'ai',
      group: 'breakdown',
      icon: 'cpu',
      label: t('admin.dashboard.aiByStatus'),
      summary: `${nf.format(sum(ai))} ${t('admin.dashboard.taskUnit')}`,
      card: (
        <ChartCard
          title={t('admin.dashboard.aiByStatus')}
          sub={t('admin.dashboard.aiSub')}
          table={{ head: [t('admin.official.statusColumn'), t('admin.dashboard.taskCount')], rows: rowsOf(ai) }}
        >
          <HBar rows={ai} color="var(--ui-chart-neutral)" unit={t('admin.dashboard.taskUnit')} />
        </ChartCard>
      ),
    },
    {
      key: 'tags',
      group: 'breakdown',
      icon: 'tag',
      label: t('admin.dashboard.topTags'),
      summary: topLabel(tags),
      card: (
        <ChartCard
          title={t('admin.dashboard.topTags')}
          sub={t('admin.dashboard.topTagsSub')}
          table={{ head: [t('scores.explore.tag'), t('admin.dashboard.scoreCount')], rows: rowsOf(tags) }}
        >
          <HBar rows={tags} color={SERIES_SCORES} unit={t('admin.official.unitScores')} />
        </ChartCard>
      ),
    },
    {
      key: 'viewed',
      group: 'breakdown',
      icon: 'eye',
      label: t('admin.dashboard.mostViewed'),
      summary: data?.topViewed[0]?.title ?? '—',
      card: (
        <Card title={t('admin.dashboard.mostViewed')} description={t('admin.dashboard.mostViewedSub')} flush>
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
      ),
    },
  ];
  const current = charts.find((c) => c.key === chartKey) ?? charts[0];

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

      <div className="dash-top">
        {/* con số chính của trang: doanh thu trong kỳ, kèm xu hướng theo ngày */}
        <section className="dash-hero" aria-labelledby="dash-hero-label">
          <div className="dash-hero__head">
            <span id="dash-hero-label" className="dash-hero__label">
              {t('admin.dashboard.revenueInPeriod', { days })}
            </span>
            <Link to="/admin/revenue" className="dash-link">
              {t('admin.dashboard.seeRevenue')}
              <Icon name="chevronRight" size={14} />
            </Link>
          </div>
          <div className="dash-hero__value">{bill ? formatVnd(bill.revenue) : '—'}</div>
          <div className="dash-hero__hint">
            {bill
              ? [
                  t('admin.dashboard.revenueHint', { count: bill.paidOrders, n: nf.format(bill.paidOrders), days }),
                  bill.refundedOrders > 0
                    ? t('admin.dashboard.refundedHint', { amount: formatVnd(bill.refundedAmount) })
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : '\u00a0'}
          </div>
          <Sparkline
            values={revenueDay.map((d) => d.amount)}
            color={SERIES_REVENUE}
            height={84}
            label={sparkLabel(
              revenueDay.map((d) => ({ date: d.date, value: d.amount })),
              days,
              formatVnd,
            )}
          />
        </section>

        {/* những việc đang chờ admin: có việc thì nổi màu trạng thái, không có thì hiện dấu ổn */}
        <section className="dash-attn" aria-labelledby="dash-attn-title">
          <h2 id="dash-attn-title" className="dash-card-title">
            {t('admin.dashboard.attention')}
          </h2>
          <ul className="dash-attn__list">
            {attention.map((a) => (
              <li key={a.key}>
                <Link to={a.to} className={`dash-attn__item ${a.count > 0 ? `is-${a.tone}` : 'is-ok'}`}>
                  <span className="dash-attn__icon" aria-hidden="true">
                    <Icon name={a.count > 0 ? a.icon : 'check'} size={16} />
                  </span>
                  <span className="dash-attn__text">
                    <span className="dash-attn__label">{a.label}</span>
                    <span className="dash-attn__hint">{a.hint}</span>
                  </span>
                  <span className="dash-attn__count">{tot || bill ? nf.format(a.count) : '—'}</span>
                  <Icon name="chevronRight" size={16} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="dash-kpis">
        <Kpi
          label={t('admin.menu.items.members')}
          icon="users"
          value={tot ? nf.format(tot.members) : '—'}
          hint={t('admin.dashboard.newInPeriod', { n: nf.format(newMembers), days })}
          to="/admin/members"
          spark={
            <Sparkline
              values={membersDay.map((d) => d.count)}
              color={SERIES_MEMBERS}
              label={sparkLabel(
                membersDay.map((d) => ({ date: d.date, value: d.count })),
                days,
                nf.format,
              )}
            />
          }
        />
        <Kpi
          label={t('upload.review.tabs.score')}
          icon="music"
          value={tot ? nf.format(tot.scores) : '—'}
          hint={t('admin.dashboard.newInPeriod', { n: nf.format(newScores), days })}
          to="/admin/scores"
          spark={
            <Sparkline
              values={scoresDay.map((d) => d.count)}
              color={SERIES_SCORES}
              label={sparkLabel(
                scoresDay.map((d) => ({ date: d.date, value: d.count })),
                days,
                nf.format,
              )}
            />
          }
        />
        <Kpi
          label={t('admin.dashboard.practiceMinutes')}
          icon="activity"
          value={data ? nf.format(Math.round(practiceMinutes)) : '—'}
          hint={
            data
              ? t('admin.dashboard.sessionsInRange', {
                  n: nf.format(practiceSessions),
                  days,
                  total: nf.format(tot?.practiceSessions ?? 0),
                })
              : undefined
          }
          to="/admin/practice"
          spark={
            <Sparkline
              values={practiceDay.map((d) => d.minutes)}
              color={SERIES_PRACTICE}
              label={sparkLabel(
                practiceDay.map((d) => ({ date: d.date, value: d.minutes })),
                days,
                nf.format,
              )}
            />
          }
        />
        <Kpi
          label={t('admin.dashboard.activeSubs')}
          icon="star"
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
        <Kpi
          label={t('admin.dashboard.reviews')}
          icon="comment"
          value={tot ? nf.format(tot.reviews) : '—'}
          hint={
            tot
              ? tot.averageRating == null
                ? t('admin.dashboard.noRating')
                : t('admin.dashboard.avgRating', { value: tot.averageRating })
              : undefined
          }
          to="/admin/scores"
        />
      </div>

      <Section title={t('admin.dashboard.analysis')} />
      <p className="dash-analysis-hint">{t('admin.dashboard.analysisHint')}</p>
      <div className="dash-analysis">
        <div className="dash-picker">
          {CHART_GROUPS.map((g) => (
            <div key={g.key} className="dash-picker__group" role="group" aria-labelledby={`dash-group-${g.key}`}>
              <h3 id={`dash-group-${g.key}`} className="dash-picker__title">
                {t(g.labelKey)}
              </h3>
              <div className="dash-picker__list">
                {charts
                  .filter((c) => c.group === g.key)
                  .map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      className="dash-pick"
                      aria-pressed={c.key === current.key}
                      aria-controls="dash-focus"
                      onClick={() => selectChart(c.key)}
                    >
                      <span className="dash-pick__icon" aria-hidden="true">
                        <Icon name={c.icon} size={18} />
                      </span>
                      <span className="dash-pick__label">{c.label}</span>
                      <span className="dash-pick__value">{c.summary}</span>
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>

        {/* chỉ một biểu đồ: cái đang chọn; key đổi theo lựa chọn để nút Biểu đồ / Bảng về mặc định */}
        <div id="dash-focus" className="dash-focus" key={current.key} aria-live="polite">
          {current.card}
        </div>
      </div>
    </div>
  );
}
