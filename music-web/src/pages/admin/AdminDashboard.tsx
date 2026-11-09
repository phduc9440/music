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
    <div className="adm-card">
      <div className="dash-card__head">
        <div>
          <div className="dash-card__title">{title}</div>
          {sub && <div className="dash-card__sub">{sub}</div>}
        </div>
        <button className="btn" style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }} onClick={() => setAsTable((v) => !v)}>
          {asTable ? 'Biểu đồ' : 'Bảng'}
        </button>
      </div>
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
    </div>
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
          <XAxis type="number" hide domain={[0, 'dataMax']} />
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

function Kpi({
  label,
  value,
  detail,
  to,
  alert,
}: {
  label: string;
  value: string;
  detail?: string;
  to?: string;
  alert?: boolean;
}) {
  const body = (
    <>
      <div className="dash-kpi__label">{label}</div>
      <div className="dash-kpi__value">{value}</div>
      {detail && <div className="dash-kpi__detail">{detail}</div>}
    </>
  );
  const cls = `dash-kpi${alert ? ' dash-kpi--alert' : ''}`;
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
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
  const practiceDay = useMemo(() => data?.practiceByDay ?? [], [data]);
  const newScores = scoresDay.reduce((s, d) => s + d.count, 0);
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
      <div className="adm-page-head">
        <div>
          <h1>Tổng quan hệ thống</h1>
          <p>Số liệu toàn hệ thống; biểu đồ theo ngày hiển thị {days} ngày gần nhất</p>
        </div>
        <div className="d-flex gap-2 align-items-center">
          <select className="form-control" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {RANGES.map((r) => (
              <option key={r} value={r}>
                {r} ngày
              </option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={refresh} disabled={refreshing}>
            {refreshing ? 'Đang tải…' : 'Làm mới'}
          </button>
        </div>
      </div>

      <div className="dash-kpis">
        <Kpi
          label="Thành viên"
          value={t ? nf.format(t.members) : '—'}
          detail={t ? `${t.activeMembers} hoạt động · ${t.lockedMembers} bị khóa · ${t.admins} admin` : undefined}
          to="/admin/members"
        />
        <Kpi
          label="Bản nhạc"
          value={t ? nf.format(t.scores) : '—'}
          detail={t ? `${t.publicScores} công khai · ${t.officialScores} trong kho mẫu` : undefined}
          to="/admin/scores"
        />
        <Kpi
          label="Chờ duyệt công khai"
          value={t ? nf.format(t.pendingScores) : '—'}
          detail={t && t.pendingScores > 0 ? 'Cần xử lý' : 'Không có yêu cầu nào'}
          to="/admin/pending-scores"
          alert={!!t && t.pendingScores > 0}
        />
        <Kpi
          label="Nhận xét"
          value={t ? nf.format(t.reviews) : '—'}
          detail={t ? (t.averageRating == null ? 'Chưa có đánh giá sao' : `Trung bình ${t.averageRating} / 5 sao`) : undefined}
        />
        <Kpi label="Phiên luyện tập" value={t ? nf.format(t.practiceSessions) : '—'} detail="Tổng từ trước đến nay" />
        <Kpi
          label="Tác vụ AI"
          value={t ? nf.format(t.aiTasksRunning) : '—'}
          detail={t ? `đang chạy · ${t.aiTasksFailed} lỗi` : undefined}
          alert={!!t && t.aiTasksFailed > 0}
        />
      </div>

      <div className="dash-grid">
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

      <div className="dash-grid">
        <ChartCard
          title="Quyền riêng tư"
          sub="Số bản nhạc theo trạng thái hiển thị"
          table={{ head: ['Trạng thái', 'Số bản'], rows: rowsOf(visibility) }}
        >
          <HBar rows={visibility} color={SERIES_SCORES} unit="bản nhạc" />
        </ChartCard>
        <ChartCard
          title="Nguồn bản nhạc"
          sub="Cách bản nhạc được tạo ra"
          table={{ head: ['Nguồn', 'Số bản'], rows: rowsOf(source) }}
        >
          <HBar rows={source} color={SERIES_SCORES} unit="bản nhạc" />
        </ChartCard>
      </div>

      <div className="dash-grid">
        <ChartCard title="Độ khó" sub="Số bản nhạc theo độ khó" table={{ head: ['Độ khó', 'Số bản'], rows: rowsOf(difficulty) }}>
          <HBar rows={difficulty} color={SERIES_SCORES} unit="bản nhạc" />
        </ChartCard>
        <ChartCard
          title="Tác vụ AI theo trạng thái"
          sub="OMR, hợp âm, tổng hợp âm thanh, chuyển định dạng"
          table={{ head: ['Trạng thái', 'Số tác vụ'], rows: rowsOf(ai) }}
        >
          <HBar rows={ai} color="#94a3b8" unit="tác vụ" />
        </ChartCard>
      </div>

      <div className="dash-grid">
        <ChartCard
          title="Thể loại phổ biến"
          sub="Top thể loại được gắn nhiều nhất"
          table={{ head: ['Thể loại', 'Số bản'], rows: rowsOf(tags) }}
        >
          <HBar rows={tags} color={SERIES_SCORES} unit="bản nhạc" />
        </ChartCard>

        <div className="adm-card">
          <div className="dash-card__head">
            <div>
              <div className="dash-card__title">Bản nhạc được xem nhiều nhất</div>
              <div className="dash-card__sub">Theo lượt xem, top 5</div>
            </div>
          </div>
          {data && data.topViewed.length === 0 ? (
            <div className="dash-empty">Chưa có lượt xem nào</div>
          ) : (
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Bản nhạc</th>
                  <th style={{ width: '40%' }}>Lượt xem</th>
                </tr>
              </thead>
              <tbody>
                {data?.topViewed.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link to={`/admin/scores/${s.id}`}>{s.title}</Link>
                      <div className="dash-card__sub">{s.ownerEmail}</div>
                    </td>
                    <td>
                      <div className="dash-bar-cell">
                        <div className="dash-bar-cell__track">
                          <div className="dash-bar-cell__fill" style={{ width: `${(s.viewCount / maxViews) * 100}%` }} />
                        </div>
                        <span>{nf.format(s.viewCount)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
