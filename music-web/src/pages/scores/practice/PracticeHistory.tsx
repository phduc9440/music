import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import Modal from '../../../components/scores/common/Modal';
import Pagination from '../../../components/scores/common/Pagination';
import { practiceApi, practiceStatsApi } from '../../../services';
import { getErrorMessage } from '../../../utils/score';
import type { PageResult, PracticeHeatmapDay, PracticeSessionRecord, PracticeStreak } from '../../../types';
import '../../../components/scores/scores.css';
import './practice-history.css';
import { Icon } from '../../../components/ui';
import { useDialog } from '../../../components/ui/dialog-context';
import { formatDateTime, getLocale, labelMap, t } from '../../../i18n/core';

const PAGE_SIZE = 20;
const DAY_MS = 24 * 3600 * 1000;
const MODE_LABELS: Record<number, string> = labelMap('practice.modes', [1, 2, 3]);
/** Năm loại nốt theo thứ tự hiển thị trên thanh phân bố (khớp màu .pr-kind--*). */
const KINDS = ['perfect', 'early', 'late', 'wrong', 'missed'] as const;
type Kind = (typeof KINDS)[number];
const KIND_LABELS: Record<Kind, string> = labelMap('practice.history.kinds', KINDS);

const intl = () => (getLocale() === 'vi' ? 'vi-VN' : 'en-US');
/** yyyy-MM-dd theo giờ máy (không dùng toISOString để khỏi lệch múi giờ). */
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const formatDuration = (seconds?: number | null) => {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? t('practice.durationMinutes', { m, s }) : t('practice.durationSeconds', { s });
};
/** Tổng thời gian dài: "7 giờ 37 phút" thay vì "457 phút 26 giây". */
const formatTotal = (seconds: number) => {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t('practice.time.minutes', { count: minutes });
  return t('practice.time.hoursMinutes', { h: Math.floor(minutes / 60), m: minutes % 60 });
};
const formatDate = (iso?: string | null) => (iso ? formatDateTime(iso) : '—');
const formatClock = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString(intl(), { hour: '2-digit', minute: '2-digit' }) : '—';
const formatPct = (v?: number | null) => (v == null ? '—' : `${v.toFixed(1)}%`);
const tone = (v?: number | null) => (v == null ? 'none' : v >= 85 ? 'good' : v >= 60 ? 'mid' : 'low');
const grade = (v?: number | null) =>
  v == null ? '–' : v >= 95 ? 'S' : v >= 85 ? 'A' : v >= 70 ? 'B' : v >= 55 ? 'C' : 'D';
const avg = (xs: (number | null | undefined)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const kindCounts = (s: PracticeSessionRecord): Record<Kind, number> => ({
  perfect: s.perfectCount ?? 0,
  early: s.earlyCount ?? 0,
  late: s.lateCount ?? 0,
  wrong: s.wrongPitchCount ?? 0,
  missed: s.missedCount ?? 0,
});

/** Nhãn ngày của một nhóm trong nhật ký: Hôm nay / Hôm qua / Thứ Năm, 20/11. */
const dayLabel = (key: string) => {
  const today = dayKey(new Date());
  const yesterday = dayKey(new Date(Date.now() - DAY_MS));
  if (key === today) return t('practice.history.today');
  if (key === yesterday) return t('practice.history.yesterday');
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(intl(), { weekday: 'long', day: 'numeric', month: 'numeric' });
};

/** Đồng hồ điểm: vòng tròn tô theo % đúng, giữa là hạng S/A/B/C/D. */
function ScoreDial({ value, size = 'md' }: { value?: number | null; size?: 'md' | 'lg' }) {
  return (
    <div
      className={`pr-dial pr-dial--${size}`}
      data-tone={tone(value)}
      style={{ '--pct': Math.max(0, Math.min(100, value ?? 0)) } as CSSProperties}
      role="img"
      aria-label={t('practice.history.dialLabel', { grade: grade(value), pct: formatPct(value) })}
    >
      <span className="pr-dial__grade" aria-hidden="true">
        {grade(value)}
      </span>
      <span className="pr-dial__pct" aria-hidden="true">
        {formatPct(value)}
      </span>
    </div>
  );
}

/** Thanh phân bố nốt: đúng giờ / sớm / trễ / sai cao độ / bỏ lỡ, có chú thích tùy chọn. */
function KindBar({ counts, legend = false }: { counts: Record<Kind, number>; legend?: boolean }) {
  const total = KINDS.reduce((a, k) => a + counts[k], 0);
  if (total === 0) return null;
  const summary = KINDS.map((k) => `${KIND_LABELS[k]} ${counts[k]}`).join(' · ');
  return (
    <div className="pr-kinds">
      <div className="pr-kinds__bar" role="img" aria-label={summary} title={summary}>
        {KINDS.map((k) =>
          counts[k] > 0 ? <i key={k} className={`pr-kind--${k}`} style={{ flexGrow: counts[k] }} /> : null,
        )}
      </div>
      {legend && (
        <ul className="pr-kinds__legend">
          {KINDS.map((k) => (
            <li key={k}>
              <i className={`pr-kind--${k}`} aria-hidden="true" />
              {KIND_LABELS[k]}
              <strong>{counts[k]}</strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface ErrorEntry {
  type?: string;
  measure?: number;
  beat?: number;
  expected?: string;
  played?: string;
}
const ERROR_KIND: Record<string, Kind> = { EARLY: 'early', LATE: 'late', WRONG_PITCH: 'wrong', MISSED: 'missed' };

/** Log lỗi viết thành câu: "Ô nhịp 16 · phách 3 — Sai cao độ: cần F4, chơi D4", xếp theo vị trí trong bài. */
function ErrorLog({ entries }: { entries: unknown[] }) {
  const rows = (entries.filter((e) => e && typeof e === 'object') as ErrorEntry[])
    .slice()
    .sort((a, b) => (a.measure ?? 0) - (b.measure ?? 0) || (a.beat ?? 0) - (b.beat ?? 0));
  return (
    <ol className="pr-errors">
      {rows.map((e, i) => {
        const kind = ERROR_KIND[e.type ?? ''];
        return (
          <li key={i}>
            <span className="pr-errors__pos">
              {t('practice.history.errorAt', { measure: e.measure ?? '?', beat: e.beat ?? '?' })}
            </span>
            <span className={`pr-errors__tag pr-tag--${kind ?? 'other'}`}>
              {kind ? KIND_LABELS[kind] : (e.type ?? '?')}
            </span>
            <span className="pr-errors__notes">
              {e.expected && t('practice.history.expected', { note: e.expected })}
              {e.played && <> · {t('practice.history.played', { note: e.played })}</>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** 7 ngày gần nhất vẽ thành 7 phím đàn, phím được "rót" đầy theo số phút tập; phím hôm nay sáng viền. */
function WeekKeys({ days }: { days: Map<string, PracticeHeatmapDay> | null }) {
  const week = useMemo(() => {
    const list = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const key = dayKey(date);
      list.push({ key, date, seconds: days?.get(key)?.totalSeconds ?? 0, today: i === 0 });
    }
    return list;
  }, [days]);
  const peak = Math.max(30 * 60, ...week.map((d) => d.seconds));
  const total = week.reduce((a, d) => a + d.seconds, 0);
  return (
    <div className="pr-week">
      <div className="pr-week__head">
        <span>{t('practice.history.week')}</span>
        <strong>{formatTotal(total)}</strong>
      </div>
      <div className="pr-week__board">
        <ol className="pr-week__keys">
          {week.map((d) => {
            const minutes = Math.round(d.seconds / 60);
            const day = d.date.toLocaleDateString(intl(), { weekday: 'short' });
            const label = t('practice.history.weekDay', { day: d.date.toLocaleDateString(intl()), minutes });
            return (
              <li
                key={d.key}
                className={`pr-key${d.today ? ' is-today' : ''}${d.seconds > 0 ? ' is-played' : ''}`}
                title={label}
                aria-label={label}
              >
                <span className="pr-key__fill" style={{ height: `${(d.seconds / peak) * 100}%` }} />
                {minutes > 0 && <span className="pr-key__min">{minutes}′</span>}
                <span className="pr-key__day">{day}</span>
              </li>
            );
          })}
        </ol>
        <div className="pr-week__blacks" aria-hidden="true">
          {[1, 2, 4, 5, 6].map((at) => (
            <i key={at} style={{ '--at': at } as CSSProperties} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Trang /practice-history: "phòng tập" — chuỗi ngày, 7 ngày qua, tổng quan và nhật ký phiên tập theo ngày (mục 3.11). */
export default function PracticeHistory() {
  const { confirm } = useDialog();
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<PageResult<PracticeSessionRecord> | null>(null);
  const [detail, setDetail] = useState<PracticeSessionRecord | null>(null);
  const [reload, setReload] = useState(0);
  const [streak, setStreak] = useState<PracticeStreak | null>(null);
  const [days, setDays] = useState<Map<string, PracticeHeatmapDay> | null>(null);

  useEffect(() => {
    practiceApi
      .list({ page, size: PAGE_SIZE })
      .then((res) => setResult(res.data.result))
      .catch(() => toast.error(t('practice.history.loadFailed')));
  }, [page, reload]);

  // Chuỗi ngày và 7 ngày gần nhất chỉ là phần trang trí đầu trang: lỗi thì để trống, không báo
  useEffect(() => {
    practiceStatsApi
      .streak()
      .then((res) => setStreak(res.data.result))
      .catch(() => setStreak(null));
    practiceStatsApi
      .heatmap({ from: dayKey(new Date(Date.now() - 6 * DAY_MS)), to: dayKey(new Date()) })
      .then((res) => setDays(new Map(res.data.result.map((d) => [d.date, d]))))
      .catch(() => setDays(new Map()));
  }, [reload]);

  const sessions = useMemo(() => result?.content ?? [], [result]);
  const latest = page === 0 ? sessions[0] : undefined;

  const overview = useMemo(() => {
    const counts = sessions.reduce<Record<Kind, number>>(
      (acc, s) => {
        const c = kindCounts(s);
        KINDS.forEach((k) => (acc[k] += c[k]));
        return acc;
      },
      { perfect: 0, early: 0, late: 0, wrong: 0, missed: 0 },
    );
    const mistakes = KINDS.filter((k) => k !== 'perfect');
    const totalNotes = KINDS.reduce((a, k) => a + counts[k], 0);
    const worst = mistakes.reduce((m, k) => (counts[k] > counts[m] ? k : m), mistakes[0]);
    return {
      accuracy: avg(sessions.map((s) => s.accuracyPct)),
      timing: avg(sessions.map((s) => s.timingAccuracyPct)),
      seconds: sessions.reduce((a, s) => a + (s.durationSeconds ?? 0), 0),
      best: sessions.reduce<number | null>(
        (m, s) => (s.accuracyPct != null && (m == null || s.accuracyPct > m) ? s.accuracyPct : m),
        null,
      ),
      counts,
      totalNotes,
      worst: totalNotes > 0 && counts[worst] > 0 ? worst : null,
      worstPct: totalNotes > 0 ? Math.round((counts[worst] / totalNotes) * 100) : 0,
    };
  }, [sessions]);

  // Nhật ký kiểu Strava: gom phiên theo ngày bắt đầu, giữ thứ tự mới nhất trước như API trả về
  const groups = useMemo(() => {
    const map = new Map<string, PracticeSessionRecord[]>();
    sessions.forEach((s) => {
      const key = s.startedAt ? dayKey(new Date(s.startedAt)) : 'unknown';
      map.set(key, [...(map.get(key) ?? []), s]);
    });
    return [...map.entries()];
  }, [sessions]);

  const openDetail = async (id: string) => {
    try {
      const res = await practiceApi.get(id);
      setDetail(res.data.result);
    } catch (err) {
      toast.error(getErrorMessage(err, t('practice.history.detailFailed')));
    }
  };

  const remove = async (s: PracticeSessionRecord) => {
    const ok = await confirm({
      title: t('practice.history.deleteTitle'),
      message: t('practice.history.deleteMessage', { title: s.scoreTitle, when: formatDate(s.startedAt) }),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await practiceApi.remove(s.id);
      toast.success(t('practice.history.deleted'));
      setDetail(null);
      setReload((n) => n + 1);
    } catch (err) {
      toast.error(getErrorMessage(err, t('practice.history.deleteFailed')));
    }
  };

  const current = streak?.currentStreak ?? 0;
  const streakMessage = !streak
    ? t('practice.history.subtitle')
    : streak.practicedToday
      ? t('practice.history.streakToday')
      : current > 0
        ? t('practice.history.streakPending', { count: current })
        : t('practice.history.streakStart');

  return (
    <div className="sc-page pr-page">
      <main className="sc-container">
        <section className="pr-hero" aria-labelledby="pr-title">
          <div className="pr-hero__intro">
            <span className="pr-eyebrow">{t('practice.history.eyebrow')}</span>
            <h1 id="pr-title">{t('practice.history.title')}</h1>
            <p>{streakMessage}</p>
            <div className="pr-hero__actions">
              {latest && (
                <Link className="pr-cta" to={`/studio/scores/${latest.scoreId}/play`}>
                  <Icon name="play" size={16} />
                  <span>
                    {t('practice.history.continue')}
                    <small>{latest.scoreTitle}</small>
                  </span>
                </Link>
              )}
              <Link className="pr-ghost" to="/practice-stats">
                <Icon name="chart" size={16} />
                {t('practice.history.statsLink')}
              </Link>
              <Link className="pr-ghost" to="/studio/history">
                <Icon name="clock" size={16} />
                {t('studioReport.history.open')}
              </Link>
            </div>
          </div>

          <div className="pr-streak" data-lit={streak?.practicedToday ? 'true' : 'false'}>
            <span className="pr-streak__flame" aria-hidden="true">
              <Icon name="flame" size={30} />
            </span>
            <strong>{streak ? current : '—'}</strong>
            <span className="pr-streak__label">{t('practice.history.streakLabel')}</span>
            {streak && streak.longestStreak > 0 && (
              <span className="pr-streak__best">
                {t('practice.history.streakBest', { count: streak.longestStreak })}
              </span>
            )}
          </div>

          <WeekKeys days={days} />
        </section>

        {result && sessions.length > 0 && (
          <section className="pr-bento" aria-label={t('practice.history.overview')}>
            <div className="pr-tile pr-tile--accuracy">
              <ScoreDial value={overview.accuracy} size="lg" />
              <div>
                <span className="pr-tile__label">{t('practice.history.statAccuracy')}</span>
                <span className="pr-tile__sub">
                  {t('practice.history.avgTiming', { pct: formatPct(overview.timing) })}
                </span>
              </div>
            </div>
            <div className="pr-tile pr-tile--sessions">
              <Icon name="activity" size={18} />
              <strong>{result.totalElements}</strong>
              <span className="pr-tile__label">{t('practice.history.statSessions')}</span>
            </div>
            <div className="pr-tile pr-tile--time">
              <Icon name="clock" size={18} />
              <strong>{formatTotal(overview.seconds)}</strong>
              <span className="pr-tile__label">{t('practice.history.statTime')}</span>
            </div>
            <div className="pr-tile pr-tile--best">
              <Icon name="star" size={18} />
              <strong>{formatPct(overview.best)}</strong>
              <span className="pr-tile__label">{t('practice.history.statBest')}</span>
            </div>
            {overview.totalNotes > 0 && (
              <div className="pr-tile pr-tile--notes">
                <div className="pr-tile__row">
                  <span className="pr-tile__label">{t('practice.history.notesTitle')}</span>
                  {overview.worst && (
                    <span className={`pr-insight pr-tag--${overview.worst}`}>
                      <Icon name="alert" size={14} />
                      {t('practice.history.topIssue', {
                        type: KIND_LABELS[overview.worst],
                        pct: overview.worstPct,
                      })}
                    </span>
                  )}
                </div>
                <KindBar counts={overview.counts} legend />
              </div>
            )}
          </section>
        )}

        {result && sessions.length === 0 && (
          <div className="pr-empty">
            <span className="pr-empty__icon">
              <Icon name="music" size={30} />
            </span>
            <h3>{t('practice.history.emptyTitle')}</h3>
            <p>{t('practice.history.emptyHint')}</p>
          </div>
        )}

        {groups.length > 0 && (
          <section className="pr-log" aria-labelledby="pr-log-title">
            <div className="pr-log__head">
              <h2 id="pr-log-title">{t('practice.history.logTitle')}</h2>
              {result && <span>{t('practice.history.count', { count: result.totalElements })}</span>}
            </div>
            {groups.map(([key, list]) => (
              <div className="pr-day" key={key}>
                <header className="pr-day__head">
                  <h3>{key === 'unknown' ? '—' : dayLabel(key)}</h3>
                  <span>
                    {t('practice.history.dayMeta', {
                      count: list.length,
                      time: formatTotal(list.reduce((a, s) => a + (s.durationSeconds ?? 0), 0)),
                    })}
                  </span>
                </header>
                <ol className="pr-day__list">
                  {list.map((s) => (
                    <li key={s.id} className="pr-session" data-tone={tone(s.accuracyPct)}>
                      <ScoreDial value={s.accuracyPct} />
                      <div className="pr-session__main">
                        <Link className="pr-session__title" to={`/scores/${s.scoreId}`} title={s.scoreTitle}>
                          {s.scoreTitle}
                        </Link>
                        <div className="pr-session__meta">
                          <span className={`pr-mode pr-mode--${s.mode}`}>{MODE_LABELS[s.mode] ?? s.mode}</span>
                          <span>{formatClock(s.startedAt)}</span>
                          <span>
                            <Icon name="clock" size={13} /> {formatDuration(s.durationSeconds)}
                          </span>
                          {s.tempoPercent != null && s.tempoPercent !== 100 && (
                            <span>{t('practice.history.tempoShort', { pct: s.tempoPercent })}</span>
                          )}
                        </div>
                      </div>
                      <div className="pr-session__stats">
                        <div className="pr-session__timing">
                          <span>{t('practice.history.timing')}</span>
                          <strong data-tone={tone(s.timingAccuracyPct)}>{formatPct(s.timingAccuracyPct)}</strong>
                        </div>
                        <KindBar counts={kindCounts(s)} />
                      </div>
                      <div className="pr-session__actions">
                        <Link
                          className="pr-icon-btn pr-icon-btn--play"
                          to={`/studio/scores/${s.scoreId}/play`}
                          aria-label={t('practice.history.practiceAgain')}
                          title={t('practice.history.practiceAgain')}
                        >
                          <Icon name="play" size={16} />
                        </Link>
                        <button className="sc-btn sc-btn--sm" onClick={() => openDetail(s.id)}>
                          {t('practice.history.details')}
                        </button>
                        <button
                          className="pr-icon-btn pr-icon-btn--danger"
                          onClick={() => remove(s)}
                          aria-label={t('practice.history.deleteSession')}
                          title={t('practice.history.deleteSession')}
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </section>
        )}

        {result && (
          <Pagination
            page={result.pageNumber}
            totalPages={result.totalPages}
            totalElements={result.totalElements}
            onChange={setPage}
          />
        )}
      </main>

      {detail && (
        <Modal
          className="pr-detail"
          title={t('practice.history.sessionTitle', { title: detail.scoreTitle })}
          onClose={() => setDetail(null)}
        >
          <div className="pr-detail__top">
            <ScoreDial value={detail.accuracyPct} size="lg" />
            <dl className="pr-facts">
              <div>
                <dt>{t('practice.history.mode')}</dt>
                <dd>
                  <span className={`pr-mode pr-mode--${detail.mode}`}>{MODE_LABELS[detail.mode] ?? detail.mode}</span>
                </dd>
              </div>
              <div>
                <dt>{t('practice.history.started')}</dt>
                <dd>{formatDate(detail.startedAt)}</dd>
              </div>
              <div>
                <dt>{t('practice.history.duration')}</dt>
                <dd>{formatDuration(detail.durationSeconds)}</dd>
              </div>
              <div>
                <dt>{t('practice.history.timing')}</dt>
                <dd>{formatPct(detail.timingAccuracyPct)}</dd>
              </div>
              {detail.tempoPercent != null && (
                <div>
                  <dt>{t('practice.history.tempo')}</dt>
                  <dd>{detail.tempoPercent}%</dd>
                </div>
              )}
              {detail.loopStartMeasure != null && (
                <div>
                  <dt>{t('practice.history.loopShort')}</dt>
                  <dd>
                    {detail.loopStartMeasure} – {detail.loopEndMeasure ?? '?'}
                  </dd>
                </div>
              )}
              {detail.scorePoints != null && (
                <div>
                  <dt>{t('practice.history.points')}</dt>
                  <dd>{detail.scorePoints}</dd>
                </div>
              )}
              <div>
                <dt>{t('practice.history.completed')}</dt>
                <dd>{detail.isCompleted ? t('common.yes') : t('common.no')}</dd>
              </div>
            </dl>
          </div>

          <h4 className="pr-detail__h">
            {t('practice.history.totalNotes')}: {detail.totalNotes ?? '—'}
          </h4>
          <KindBar counts={kindCounts(detail)} legend />

          <h4 className="pr-detail__h">{t('practice.history.errorLog', { count: detail.errorLog?.length ?? 0 })}</h4>
          {detail.errorLog && detail.errorLog.length > 0 ? (
            <ErrorLog entries={detail.errorLog} />
          ) : (
            <p className="pr-detail__none">{t('practice.history.noErrors')}</p>
          )}

          <div className="sc-modal__actions">
            <button className="sc-btn sc-btn--danger" onClick={() => remove(detail)}>
              {t('practice.history.deleteSession')}
            </button>
            <Link className="sc-btn sc-btn--primary" to={`/studio/scores/${detail.scoreId}/play`}>
              <Icon name="refresh" size={16} />
              {t('practice.history.practiceAgain')}
            </Link>
          </div>
        </Modal>
      )}
    </div>
  );
}
