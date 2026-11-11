import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import PracticeSkillRadar from '../../../components/scores/practice/PracticeSkillRadar';
import PracticeTimeChart from '../../../components/scores/practice/PracticeTimeChart';
import { practiceStatsApi } from '../../../services';
import type { PracticeHeatmapDay, PracticeStreak } from '../../../types';
import '../../../components/scores/scores.css';
import './PracticeStats.css';
import { formatDate, monthShortName, t } from '../../../i18n/core';

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
      .catch(() => toast.error(t('practice.stats.streakFailed')));
    practiceStatsApi
      .heatmap({ from: cells[0].key, to: toKey(new Date()) })
      .then((res) => setDays(new Map(res.data.result.map((d) => [d.date, d]))))
      .catch(() => toast.error(t('practice.stats.heatmapFailed')));
  }, [cells]);

  // Nhãn tháng đặt ở cột tuần đầu tiên của mỗi tháng
  const months = useMemo(() => {
    const labels: string[] = Array(WEEKS).fill('');
    let last = -1;
    for (let w = 0; w < WEEKS; w++) {
      const month = cells[w * 7].date.getMonth();
      if (month !== last) {
        labels[w] = t('practice.stats.month', { month: month + 1, name: monthShortName(month) });
        last = month;
      }
    }
    return labels;
  }, [cells]);

  const totalDays = days?.size ?? 0;

  const tooltip = (cell: Cell) => {
    const d = days?.get(cell.key);
    const label = formatDate(cell.date);
    if (!d) return t('practice.stats.noPractice', { date: label });
    return t('practice.stats.dayTooltip', {
      date: label,
      sessions: d.sessionCount,
      minutes: Math.round(d.totalSeconds / 60),
    });
  };

  return (
    <div className="sc-page">
      <main className="sc-container">
        <header className="sc-lib-head">
          <div>
            <h1>{t('common.footer.practiceStats')}</h1>
            <p>{t('practice.stats.subtitle')}</p>
          </div>
        </header>

        <div className="ps-cards">
          <div className="ps-card">
            <div className="ps-card__value">
              {streak ? t('practice.stats.days', { count: streak.currentStreak }) : '—'}
            </div>
            <div className="ps-card__label">
              {t('practice.stats.current')}
              {streak && streak.currentStreak > 0 && !streak.practicedToday ? ` (${t('practice.stats.notToday')})` : ''}
            </div>
          </div>
          <div className="ps-card">
            <div className="ps-card__value">
              {streak ? t('practice.stats.days', { count: streak.longestStreak }) : '—'}
            </div>
            <div className="ps-card__label">{t('practice.stats.longest')}</div>
          </div>
          <div className="ps-card">
            <div className="ps-card__value">{days ? totalDays : '—'}</div>
            <div className="ps-card__label">{t('practice.stats.daysYear')}</div>
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
            {t('practice.stats.less')}
            {[0, 1, 2, 3, 4].map((l) => (
              <span key={l} className={`ps-cell ps-cell--l${l}`} />
            ))}
            {t('practice.stats.more')}
          </div>
        </div>

        <PracticeTimeChart />

        <PracticeSkillRadar />
      </main>
    </div>
  );
}
