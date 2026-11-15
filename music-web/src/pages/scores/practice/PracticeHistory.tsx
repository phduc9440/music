import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import Modal from '../../../components/scores/common/Modal';
import Pagination from '../../../components/scores/common/Pagination';
import { practiceApi } from '../../../services';
import { getErrorMessage } from '../../../utils/score';
import type { PageResult, PracticeSessionRecord } from '../../../types';
import '../../../components/scores/scores.css';
import './practice-history.css';
import { Icon } from '../../../components/ui';
import { useDialog } from '../../../components/ui/dialog-context';
import { formatDateTime, labelMap, t } from '../../../i18n/core';

const PAGE_SIZE = 20;
const MODE_LABELS: Record<number, string> = labelMap('practice.modes', [1, 2, 3]);

const formatDuration = (seconds?: number | null) => {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? t('practice.durationMinutes', { m, s }) : t('practice.durationSeconds', { s });
};
const formatDate = (iso?: string | null) => (iso ? formatDateTime(iso) : '—');
const formatPct = (v?: number | null) => (v == null ? '—' : `${v.toFixed(1)}%`);
const tone = (v?: number | null) => (v == null ? 'none' : v >= 85 ? 'good' : v >= 60 ? 'mid' : 'low');
const avg = (xs: (number | null | undefined)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** Thanh tiến độ phần trăm, màu theo mức: tốt / khá / cần luyện. */
function Meter({ label, value }: { label: string; value?: number | null }) {
  return (
    <div className="ph-meter" data-tone={tone(value)}>
      <div className="ph-meter__row">
        <span>{label}</span>
        <strong>{formatPct(value)}</strong>
      </div>
      <div className="ph-meter__bar">
        <i style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} />
      </div>
    </div>
  );
}

/** Trang /practice-history: lịch sử phiên tập của tôi, xem log lỗi chi tiết và xóa phiên (mục 3.11). */
export default function PracticeHistory() {
  const { confirm } = useDialog();
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<PageResult<PracticeSessionRecord> | null>(null);
  const [detail, setDetail] = useState<PracticeSessionRecord | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    practiceApi
      .list({ page, size: PAGE_SIZE })
      .then((res) => setResult(res.data.result))
      .catch(() => toast.error(t('practice.history.loadFailed')));
  }, [page, reload]);

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

  return (
    <div className="sc-page">
      <main className="sc-container">
        <header className="sc-lib-head">
          <div>
            <h1>{t('practice.history.title')}</h1>
            <p>
              {result ? t('practice.history.count', { count: result.totalElements }) : t('practice.history.subtitle')}
            </p>
          </div>
        </header>

        {result && result.content.length > 0 && (
          <div className="ph-stats">
            <div className="ph-stat ph-stat--rose">
              <Icon name="activity" size={20} />
              <strong>{result.totalElements}</strong>
              <span>{t('practice.history.statSessions')}</span>
            </div>
            <div className="ph-stat ph-stat--teal">
              <Icon name="check" size={20} />
              <strong>{formatPct(avg(result.content.map((s) => s.accuracyPct)))}</strong>
              <span>{t('practice.history.statAccuracy')}</span>
            </div>
            <div className="ph-stat ph-stat--indigo">
              <Icon name="clock" size={20} />
              <strong>{formatDuration(result.content.reduce((a, s) => a + (s.durationSeconds ?? 0), 0))}</strong>
              <span>{t('practice.history.statTime')}</span>
            </div>
            <div className="ph-stat ph-stat--amber">
              <Icon name="star" size={20} />
              <strong>
                {formatPct(
                  result.content.reduce<number | null>(
                    (m, s) => (s.accuracyPct != null && (m == null || s.accuracyPct > m) ? s.accuracyPct : m),
                    null,
                  ),
                )}
              </strong>
              <span>{t('practice.history.statBest')}</span>
            </div>
          </div>
        )}

        {result && result.content.length === 0 && (
          <div className="sc-empty ph-empty">
            <span className="ph-empty__icon">
              <Icon name="music" size={30} />
            </span>
            <h3>{t('practice.history.emptyTitle')}</h3>
            <p>{t('practice.history.emptyHint')}</p>
          </div>
        )}

        {result && result.content.length > 0 && (
          <ul className="ph-list">
            {result.content.map((s) => (
              <li key={s.id} className="ph-item" data-tone={tone(s.accuracyPct)}>
                <div className="ph-item__main">
                  <strong className="ph-item__title" title={s.scoreTitle}>
                    {s.scoreTitle}
                  </strong>
                  <span className="ph-item__meta">
                    <span className={`ph-mode ph-mode--${s.mode}`}>{MODE_LABELS[s.mode] ?? s.mode}</span>
                    <span>{formatDate(s.startedAt)}</span>
                    <span>
                      <Icon name="clock" size={13} /> {formatDuration(s.durationSeconds)}
                    </span>
                  </span>
                </div>
                <div className="ph-item__meters">
                  <Meter label={t('practice.history.accuracy')} value={s.accuracyPct} />
                  <Meter label={t('practice.history.timing')} value={s.timingAccuracyPct} />
                </div>
                <div className="ph-item__actions">
                  <button className="sc-btn sc-btn--sm" onClick={() => openDetail(s.id)}>
                    {t('practice.history.details')}
                  </button>
                  <button
                    className="sc-btn sc-btn--sm sc-btn--danger"
                    onClick={() => remove(s)}
                    aria-label={t('common.delete')}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
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
        <Modal title={t('practice.history.sessionTitle', { title: detail.scoreTitle })} onClose={() => setDetail(null)}>
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 4 }}>
            <li>
              {t('practice.history.mode')}: {MODE_LABELS[detail.mode] ?? detail.mode}
            </li>
            <li>
              {t('practice.history.started')}: {formatDate(detail.startedAt)}
            </li>
            <li>
              {t('practice.history.duration')}: {formatDuration(detail.durationSeconds)}
            </li>
            {detail.tempoPercent != null && (
              <li>
                {t('practice.history.tempo')}: {detail.tempoPercent}%
              </li>
            )}
            {detail.loopStartMeasure != null && (
              <li>{t('practice.history.loop', { from: detail.loopStartMeasure, to: detail.loopEndMeasure ?? '?' })}</li>
            )}
            <li>
              {t('practice.history.totalNotes')}: {detail.totalNotes ?? '—'}
            </li>
            <li>
              {t('practice.history.breakdown', {
                perfect: detail.perfectCount ?? 0,
                early: detail.earlyCount ?? 0,
                late: detail.lateCount ?? 0,
                wrong: detail.wrongPitchCount ?? 0,
                missed: detail.missedCount ?? 0,
              })}
            </li>
            <li>
              {t('practice.history.accuracy')}: {formatPct(detail.accuracyPct)} · {t('practice.history.timing')}:{' '}
              {formatPct(detail.timingAccuracyPct)}
            </li>
            {detail.scorePoints != null && (
              <li>
                {t('practice.history.points')}: {detail.scorePoints}
              </li>
            )}
            <li>
              {t('practice.history.completed')}: {detail.isCompleted ? t('common.yes') : t('common.no')}
            </li>
          </ul>
          <h4 style={{ marginTop: 12 }}>{t('practice.history.errorLog', { count: detail.errorLog?.length ?? 0 })}</h4>
          {detail.errorLog && detail.errorLog.length > 0 ? (
            <pre style={{ maxHeight: 240, overflow: 'auto', fontSize: 12 }}>
              {JSON.stringify(detail.errorLog, null, 2)}
            </pre>
          ) : (
            <p>{t('practice.history.noErrors')}</p>
          )}
          <div className="sc-modal__actions">
            <button className="sc-btn sc-btn--danger" onClick={() => remove(detail)}>
              {t('practice.history.deleteSession')}
            </button>
            <button className="sc-btn" onClick={() => setDetail(null)}>
              {t('common.close')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
