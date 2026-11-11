import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import Modal from '../../../components/scores/common/Modal';
import Pagination from '../../../components/scores/common/Pagination';
import { practiceApi } from '../../../services';
import { getErrorMessage } from '../../../utils/score';
import type { PageResult, PracticeSessionRecord } from '../../../types';
import '../../../components/scores/scores.css';
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

        {result && result.content.length === 0 && (
          <div className="sc-empty">
            <h3>{t('practice.history.emptyTitle')}</h3>
            <p>{t('practice.history.emptyHint')}</p>
          </div>
        )}

        {result && result.content.length > 0 && (
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('practice.history.started')}</th>
                  <th>{t('practice.history.score')}</th>
                  <th>{t('practice.history.mode')}</th>
                  <th>{t('practice.history.duration')}</th>
                  <th>{t('practice.history.accuracy')}</th>
                  <th>{t('practice.history.timing')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {result.content.map((s) => (
                  <tr key={s.id}>
                    <td>{formatDate(s.startedAt)}</td>
                    <td>{s.scoreTitle}</td>
                    <td>{MODE_LABELS[s.mode] ?? s.mode}</td>
                    <td>{formatDuration(s.durationSeconds)}</td>
                    <td>{formatPct(s.accuracyPct)}</td>
                    <td>{formatPct(s.timingAccuracyPct)}</td>
                    <td>
                      <div className="d-flex gap-2">
                        <button className="sc-btn sc-btn--sm" onClick={() => openDetail(s.id)}>
                          {t('practice.history.details')}
                        </button>
                        <button className="sc-btn sc-btn--sm sc-btn--danger" onClick={() => remove(s)}>
                          {t('common.delete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
