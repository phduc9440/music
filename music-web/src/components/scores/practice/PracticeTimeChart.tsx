import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { practiceStatsApi } from '../../../services';
import type { PracticePeriod, PracticeTimeBucket } from '../../../types';
import { formatDate, monthShortName, t } from '../../../i18n/core';

const PERIODS: { value: PracticePeriod; label: string; hint: string }[] = (['DAY', 'WEEK', 'MONTH'] as const).map(
  (value) => ({
    value,
    get label() {
      return t(`practice.time.${value}.label`);
    },
    get hint() {
      return t(`practice.time.${value}.hint`);
    },
  }),
);

/** yyyy-MM-dd -> Date theo giờ máy (không để lệch múi giờ). */
const parseDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const labelOf = (b: PracticeTimeBucket, period: PracticePeriod) => {
  const d = parseDate(b.start);
  if (period === 'MONTH')
    return t('practice.time.monthLabel', {
      month: d.getMonth() + 1,
      name: monthShortName(d.getMonth()),
      year: String(d.getFullYear()).slice(2),
    });
  return `${d.getDate()}/${d.getMonth() + 1}`;
};

const formatMinutes = (seconds: number) => {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t('practice.time.minutes', { count: minutes });
  return t('practice.time.hoursMinutes', { h: Math.floor(minutes / 60), m: minutes % 60 });
};

/** Biểu đồ cột thời gian luyện tập theo Ngày / Tuần / Tháng (mục 3.13). */
export default function PracticeTimeChart() {
  const [period, setPeriod] = useState<PracticePeriod>('DAY');
  const [buckets, setBuckets] = useState<PracticeTimeBucket[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    practiceStatsApi
      .time(period)
      .then((res) => !cancelled && setBuckets(res.data.result))
      .catch(() => toast.error(t('practice.time.loadFailed')));
    return () => {
      cancelled = true;
    };
  }, [period]);

  const data = useMemo(
    () =>
      (buckets ?? []).map((b) => ({
        label: labelOf(b, period),
        range:
          b.start === b.end
            ? formatDate(parseDate(b.start))
            : `${formatDate(parseDate(b.start))} – ${formatDate(parseDate(b.end))}`,
        minutes: Math.round((b.totalSeconds / 60) * 10) / 10,
        seconds: b.totalSeconds,
        sessions: b.sessionCount,
      })),
    [buckets, period],
  );

  const totalSeconds = data.reduce((sum, d) => sum + d.seconds, 0);
  const average = data.length > 0 ? totalSeconds / data.length : 0;
  const hint = PERIODS.find((p) => p.value === period)?.hint;

  return (
    <section className="ps-chart">
      <div className="ps-chart__head">
        <div>
          <h2>{t('practice.time.title')}</h2>
          <p>
            {t('practice.time.summary', {
              hint: hint ?? '',
              total: formatMinutes(totalSeconds),
              average: formatMinutes(average),
              unit: PERIODS.find((p) => p.value === period)?.label.toLowerCase() ?? '',
            })}
          </p>
        </div>
        <div className="ps-chart__tabs">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              className={`sc-btn sc-btn--sm${p.value === period ? ' sc-btn--primary' : ''}`}
              onClick={() => setPeriod(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ps-chart__body">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 12 }} allowDecimals={false} unit=" p" />
            <Tooltip
              formatter={(_value, _name, item) => [
                t('practice.time.tooltip', {
                  time: formatMinutes(item.payload.seconds),
                  sessions: item.payload.sessions,
                }),
                t('practice.time.tooltipName'),
              ]}
              labelFormatter={(_label, items) => items?.[0]?.payload?.range ?? ''}
            />
            <Bar dataKey="minutes" fill="var(--ui-hue-rose)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
