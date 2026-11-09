import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import NotificationBell from '../../components/NotificationBell';
import PracticeTimeChart from '../../components/scores/PracticeTimeChart';
import { practiceStatsApi } from '../../services';
import type { PracticeHeatmapDay, PracticeStreak } from '../../types';
import '../../components/scores/scores.css';
import './PracticeStats.css';

const WEEKS = 53;
const DAY_MS = 24 * 3600 * 1000;

/** yyyy-MM-dd theo giờ máy (không dùng toISOString để khỏi lệch múi giờ). */
const toKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Mức màu theo tổng số phút tập trong ngày: 0 / <10 / <30 / <60 / từ 60 phút. */
const levelOf = (seconds: number) => {
  const minutes = seconds / 60;
  if (minutes <= 0) return 0;
  if (minutes < 10) return 1;
  if (minutes < 30) return 2;
  if (minutes < 60) return 3;
  return 4;
};

interface Cell {
  key: string;
  date: Date;
  future: boolean;
}

/** Trang /practice-stats: chuỗi ngày luyện tập và heatmap kiểu GitHub (mục 3.12). */
export default function PracticeStats() {
  const navigate = useNavigate();
  const [streak, setStreak] = useState<PracticeStreak | null>(null);
  const [days, setDays] = useState<Map<string, PracticeHeatmapDay> | null>(null);

  // Lưới 53 tuần, mỗi cột là một tuần bắt đầu từ thứ Hai, kết thúc ở tuần chứa hôm nay
  const cells = useMemo(() => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const mondayOffset = (today.getDay() + 6) % 7;
    const start = new Date(today.getTime() - (mondayOffset + (WEEKS - 1) * 7) * DAY_MS);
    const list: Cell[] = [];
    for (let i = 0; i < WEEKS * 7; i++) {
      const date = new Date(start.getTime() + i * DAY_MS);
      list.push({ key: toKey(date), date, future: date.getTime() > today.getTime() });
    }
    return list;
  }, []);

  useEffect(() => {
    practiceStatsApi
      .streak()
      .then((res) => setStreak(res.data.result))
      .catch(() => toast.error('Không tải được chuỗi luyện tập'));
    practiceStatsApi
      .heatmap({ from: cells[0].key, to: toKey(new Date()) })
      .then((res) => setDays(new Map(res.data.result.map((d) => [d.date, d]))))
      .catch(() => toast.error('Không tải được heatmap luyện tập'));
  }, [cells]);

  // Nhãn tháng đặt ở cột tuần đầu tiên của mỗi tháng
  const months = useMemo(() => {
    const labels: string[] = Array(WEEKS).fill('');
    let last = -1;
    for (let w = 0; w < WEEKS; w++) {
      const month = cells[w * 7].date.getMonth();
      if (month !== last) {
        labels[w] = `Th${month + 1}`;
        last = month;
      }
    }
    return labels;
  }, [cells]);

  const totalDays = days?.size ?? 0;

  const tooltip = (cell: Cell) => {
    const d = days?.get(cell.key);
    const label = cell.date.toLocaleDateString('vi-VN');
    if (!d) return `${label}: không tập`;
    return `${label}: ${d.sessionCount} phiên, ${Math.round(d.totalSeconds / 60)} phút`;
  };

  return (
    <div className="sc-page">
      <nav className="navbar">
        <div className="navbar-brand">Music App</div>
        <div className="navbar-nav">
          <NotificationBell />
          <button className="sc-btn sc-btn--sm" onClick={() => navigate('/practice-history')}>
            Lịch sử tập
          </button>
          <button className="sc-btn sc-btn--sm" onClick={() => navigate('/scores')}>
            ‹ Thư viện
          </button>
        </div>
      </nav>

      <main className="sc-container">
        <header className="sc-lib-head">
          <div>
            <h1>Thống kê luyện tập</h1>
            <p>Phiên tập từ 1 phút trở lên mới được tính là một ngày có tập.</p>
          </div>
        </header>

        <div className="ps-cards">
          <div className="ps-card">
            <div className="ps-card__value">{streak ? `${streak.currentStreak} ngày` : '—'}</div>
            <div className="ps-card__label">
              Chuỗi hiện tại
              {streak && streak.currentStreak > 0 && !streak.practicedToday ? ' (hôm nay chưa tập)' : ''}
            </div>
          </div>
          <div className="ps-card">
            <div className="ps-card__value">{streak ? `${streak.longestStreak} ngày` : '—'}</div>
            <div className="ps-card__label">Chuỗi dài nhất</div>
          </div>
          <div className="ps-card">
            <div className="ps-card__value">{days ? totalDays : '—'}</div>
            <div className="ps-card__label">Ngày có tập trong 12 tháng qua</div>
          </div>
        </div>

        <div className="ps-heatmap-wrap">
          <div className="ps-months">
            {months.map((m, i) => (
              <span key={i}>{m}</span>
            ))}
          </div>
          <div className="ps-heatmap">
            {cells.map((cell) => (
              <div
                key={cell.key}
                title={cell.future ? undefined : tooltip(cell)}
                className={
                  cell.future
                    ? 'ps-cell ps-cell--empty'
                    : `ps-cell ps-cell--l${levelOf(days?.get(cell.key)?.totalSeconds ?? 0)}`
                }
              />
            ))}
          </div>
          <div className="ps-legend">
            Ít
            {[0, 1, 2, 3, 4].map((l) => (
              <span key={l} className={`ps-cell ps-cell--l${l}`} />
            ))}
            Nhiều
          </div>
        </div>

        <PracticeTimeChart />
      </main>
    </div>
  );
}
