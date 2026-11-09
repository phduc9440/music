import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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

const RANGES = [7, 30, 90];

const VISIBILITY_LABEL: Record<string, string> = { PRIVATE: 'Riêng tư', PENDING: 'Chờ duyệt', PUBLIC: 'Công khai' };
const SOURCE_LABEL: Record<string, string> = {
  OMR: 'Số hóa (OMR)',
  IMPORT: 'Nhập file',
  MANUAL: 'Tạo trong editor',
  UNKNOWN: 'Khác',
};
const DIFFICULTY_LABEL: Record<string, string> = {
  EASY: 'Dễ',
  MEDIUM: 'Trung bình',
  HARD: 'Khó',
  EXPERT: 'Chuyên gia',
  NONE: 'Chưa đặt',
};
const DIFFICULTY_ORDER = ['EASY', 'MEDIUM', 'HARD', 'EXPERT', 'NONE'];
const VISIBILITY_ORDER = ['PUBLIC', 'PENDING', 'PRIVATE'];

// Màu trạng thái cố định (không dùng chung với màu series); luôn kèm biểu tượng + nhãn chữ
const AI_STATUS: Record<string, { label: string; color: string }> = {
  COMPLETED: { label: '✓ Hoàn tất', color: '#0ca30c' },
  PROCESSING: { label: '… Đang xử lý', color: '#fab219' },
  PENDING: { label: '… Chờ xử lý', color: '#fab219' },
  FAILED: { label: '✕ Lỗi', color: '#d03b3b' },
  CANCELLED: { label: '– Đã hủy', color: '#94a3b8' },
};
const AI_ORDER = ['COMPLETED', 'PROCESSING', 'PENDING', 'FAILED', 'CANCELLED'];

const SERIES_SCORES = '#2a78d6';
const SERIES_PRACTICE = '#1baf7a';
// Slot 7 (violet) của bảng màu dataviz, để thành viên không trùng màu với bản nhạc/luyện tập
const SERIES_MEMBERS = '#6250d6';
const AXIS = { fontSize: 12, fill: '#64748b' };

const nf = new Intl.NumberFormat('vi-VN');

const shortDate = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${Number(d)}/${Number(m)}`;
};
const longDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('vi-VN');

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
  children,
}: {
  title: string;
  sub?: string;
  table: { head: [string, string]; rows: [string, string][] };
  children: React.ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <Card
      title={title}
      description={sub}
      actions={
        <Tabs
          value={asTable ? 'table' : 'chart'}
          onChange={(v) => setAsTable(v === 'table')}
          items={[
            { value: 'chart', label: 'Biểu đồ' },
            { value: 'table', label: 'Bảng' },
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
  if (rows.length === 0) return <div className="dash-empty">Chưa có dữ liệu</div>;
  const height = Math.max(120, rows.length * 38 + 16);
  return (
    <div className="dash-chart" style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 36, bottom: 4, left: 0 }} barCategoryGap={10}>
          <XAxis type="number" hide domain={[0, (max: number) => Math.max(1, max) * 1.15]} />
          <YAxis type="category" dataKey="label" width={118} tick={AXIS} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: 'rgba(148,163,184,0.12)' }}
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
            <LabelList dataKey="count" position="right" formatter={(v) => nf.format(Number(v))} style={{ fontSize: 12, fill: '#0f172a' }} />
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
      .catch(() => !cancelled && toast.error('Không tải được số liệu tổng quan'))
      .finally(() => !cancelled && setRefreshing(false));
    return () => {
      cancelled = true;
    };
  }, [days, reload]);

  const refresh = () => {
    setRefreshing(true);
    setReload((n) => n + 1);
  };

  const t = data?.totals;

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
    label: AI_STATUS[r.key]?.label ?? r.key,
    count: r.count,
    color: AI_STATUS[r.key]?.color,
  }));
  const tags = (data?.topTags ?? []).map((r) => ({ label: r.key, count: r.count }));
  const rowsOf = (rows: { label: string; count: number }[]): [string, string][] =>
    rows.map((r) => [r.label, nf.format(r.count)]);

  const maxViews = Math.max(1, ...(data?.topViewed ?? []).map((s) => s.viewCount));

  return (
    <div className="dash">
      <PageHeader
        title="Bảng điều khiển"
        description={`Số liệu toàn hệ thống; biểu đồ theo ngày hiển thị ${days} ngày gần nhất`}
        actions={
          <>
            <select className="adm-input" aria-label="Khoảng thời gian" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {RANGES.map((r) => (
                <option key={r} value={r}>
                  {r} ngày gần nhất
                </option>
              ))}
            </select>
            <Button icon="refresh" loading={refreshing} onClick={refresh}>
              Làm mới
            </Button>
          </>
        }
      />

      <StatGrid>
        <StatCard
          label="Thành viên"
          icon="users"
          tone="primary"
          value={t ? nf.format(t.members) : '—'}
          hint={t ? `${t.activeMembers} hoạt động · ${t.lockedMembers} bị khóa · ${t.admins} admin` : undefined}
          to="/admin/members"
        />
        <StatCard
          label="Bản nhạc"
          icon="music"
          tone="primary"
          value={t ? nf.format(t.scores) : '—'}
          hint={t ? `${t.publicScores} công khai · ${t.officialScores} trong kho mẫu` : undefined}
          to="/admin/scores"
        />
        <StatCard
          label="Chờ duyệt"
          icon="clock"
          tone="warning"
          value={t ? nf.format(t.pendingScores) : '—'}
          hint={t && t.pendingScores > 0 ? 'Cần xử lý' : 'Không có yêu cầu nào'}
          to="/admin/pending-scores"
          alert={!!t && t.pendingScores > 0}
        />
        <StatCard
          label="Nhận xét"
          icon="star"
          tone="violet"
          value={t ? nf.format(t.reviews) : '—'}
          hint={t ? (t.averageRating == null ? 'Chưa có đánh giá sao' : `Trung bình ${t.averageRating} / 5 sao`) : undefined}
        />
        <StatCard
          label="Phiên luyện tập"
          icon="activity"
          tone="success"
          value={t ? nf.format(t.practiceSessions) : '—'}
          hint="Tổng từ trước đến nay"
        />
        <StatCard
          label="Tác vụ AI"
          icon="cpu"
          tone={t && t.aiTasksFailed > 0 ? 'danger' : 'neutral'}
          value={t ? nf.format(t.aiTasksRunning) : '—'}
          hint={t ? `đang chạy · ${t.aiTasksFailed} lỗi` : undefined}
          alert={!!t && t.aiTasksFailed > 0}
        />
      </StatGrid>

      <div className="adm-grid-2">
        <ChartCard
          title="Bản nhạc mới theo ngày"
          sub={`${nf.format(newScores)} bản trong ${days} ngày`}
          table={{ head: ['Ngày', 'Số bản'], rows: scoresDay.map((d) => [longDate(d.date), nf.format(d.count)]) }}
        >
          <div className="dash-chart">
            <ResponsiveContainer>
              <AreaChart data={scoresDay} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ stroke: '#94a3b8', strokeWidth: 1 }}
                  content={({ active, payload, label }: TipProps) =>
                    active && payload?.[0] ? (
                      <Tip title={longDate(String(label))} lines={[`${nf.format(Number(payload[0].value))} bản nhạc mới`]} />
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
                  activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Thời gian luyện tập theo ngày"
          sub={`${nf.format(Math.round(practiceMinutes))} phút trong ${days} ngày`}
          table={{
            head: ['Ngày', 'Phút (số phiên)'],
            rows: practiceDay.map((d) => [longDate(d.date), `${nf.format(d.minutes)} (${d.sessions})`]),
          }}
        >
          <div className="dash-chart">
            <ResponsiveContainer>
              <BarChart data={practiceDay} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(148,163,184,0.12)' }}
                  content={({ active, payload, label }: TipProps) =>
                    active && payload?.[0] ? (
                      <Tip
                        title={longDate(String(label))}
                        lines={[
                          `${nf.format(Number(payload[0].value))} phút`,
                          `${nf.format(Number(payload[0].payload?.sessions ?? 0))} phiên`,
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
          title="Thành viên mới theo ngày"
          sub={`${nf.format(newMembers)} tài khoản trong ${days} ngày${
            data && data.membersWithoutDate > 0 ? ` · ${nf.format(data.membersWithoutDate)} tài khoản cũ chưa có ngày đăng ký` : ''
          }`}
          table={{ head: ['Ngày', 'Số tài khoản'], rows: membersDay.map((d) => [longDate(d.date), nf.format(d.count)]) }}
        >
          <div className="dash-chart">
            <ResponsiveContainer>
              <BarChart data={membersDay} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(148,163,184,0.12)' }}
                  content={({ active, payload, label }: TipProps) =>
                    active && payload?.[0] ? (
                      <Tip title={longDate(String(label))} lines={[`${nf.format(Number(payload[0].value))} tài khoản mới`]} />
                    ) : null
                  }
                />
                <Bar dataKey="count" fill={SERIES_MEMBERS} radius={[4, 4, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard
          title="Quyền riêng tư"
          sub="Số bản nhạc theo trạng thái hiển thị"
          table={{ head: ['Trạng thái', 'Số bản'], rows: rowsOf(visibility) }}
        >
          <HBar rows={visibility} color={SERIES_SCORES} unit="bản nhạc" />
        </ChartCard>
      </div>

      <div className="adm-grid-2">
        <ChartCard
          title="Nguồn bản nhạc"
          sub="Cách bản nhạc được tạo ra"
          table={{ head: ['Nguồn', 'Số bản'], rows: rowsOf(source) }}
        >
          <HBar rows={source} color={SERIES_SCORES} unit="bản nhạc" />
        </ChartCard>
        <ChartCard title="Độ khó" sub="Số bản nhạc theo độ khó" table={{ head: ['Độ khó', 'Số bản'], rows: rowsOf(difficulty) }}>
          <HBar rows={difficulty} color={SERIES_SCORES} unit="bản nhạc" />
        </ChartCard>
      </div>

      <div className="adm-grid-2">
        <ChartCard
          title="Tác vụ AI theo trạng thái"
          sub="OMR, hợp âm, tổng hợp âm thanh, chuyển định dạng"
          table={{ head: ['Trạng thái', 'Số tác vụ'], rows: rowsOf(ai) }}
        >
          <HBar rows={ai} color="#94a3b8" unit="tác vụ" />
        </ChartCard>
        <ChartCard
          title="Thể loại phổ biến"
          sub="Top thể loại được gắn nhiều nhất"
          table={{ head: ['Thể loại', 'Số bản'], rows: rowsOf(tags) }}
        >
          <HBar rows={tags} color={SERIES_SCORES} unit="bản nhạc" />
        </ChartCard>
      </div>

      <div className="adm-grid-2">
        <Card title="Bản nhạc được xem nhiều nhất" description="Theo lượt xem, top 5" flush className="adm-span-all">
          <Table>
            <thead>
              <tr>
                <th>Bản nhạc</th>
                <th style={{ width: '40%' }}>Lượt xem</th>
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
              {data && data.topViewed.length === 0 && <TableState colSpan={2} icon="eye" title="Chưa có lượt xem nào" />}
            </tbody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
