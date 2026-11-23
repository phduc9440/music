import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import Pagination from '../../../components/scores/common/Pagination';
import { studioApi } from '../../../services/practice/studioApi';
import type { PageResult, StudioSessionSummary } from '../../../types';
import { formatDateTime, t } from '../../../i18n/core';
import '../../../components/scores/scores.css';
import './studio-report.css';

const PAGE_SIZE = 20;

const formatDuration = (seconds?: number | null) => {
  if (seconds == null) return '—';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes > 0
    ? t('studioReport.durationMinutes', { minutes, seconds: remainingSeconds })
    : t('studioReport.durationSeconds', { seconds: remainingSeconds });
};

const formatPercent = (value?: number | null) => (value == null ? '—' : `${value.toFixed(1)}%`);

export default function StudioHistory() {
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<PageResult<StudioSessionSummary> | null>(null);

  useEffect(() => {
    let cancelled = false;
    studioApi
      .list({ page, size: PAGE_SIZE })
      .then((response) => !cancelled && setResult(response.data))
      .catch(() => !cancelled && toast.error(t('studioReport.history.loadFailed')));
    return () => {
      cancelled = true;
    };
  }, [page]);

  return (
    <div className="sc-page">
      <main className="sc-container">
        <header className="sc-lib-head">
          <div>
            <h1>{t('studioReport.history.title')}</h1>
            <p>
              {result
                ? t('studioReport.history.count', { count: result.totalElements })
                : t('studioReport.history.subtitle')}
            </p>
          </div>
        </header>

        {result && result.content.length === 0 && (
          <div className="sc-empty studio-report__empty">
            <h3>{t('studioReport.history.emptyTitle')}</h3>
            <p>{t('studioReport.history.emptyHint')}</p>
          </div>
        )}

        {result && result.content.length > 0 && (
          <ul className="studio-report__list">
            {result.content.map((session) => (
              <li className="studio-report__session" key={session.id}>
                <div>
                  <strong>{session.title}</strong>
                  <p>
                    {t(`studioReport.mode.${session.mode}`)} · {formatDateTime(session.startedAt)}
                  </p>
                </div>
                <div className="studio-report__session-metrics">
                  <span>{t('studioReport.score', { score: session.scorePoints, grade: session.grade })}</span>
                  <span>{formatPercent(session.accuracyPct)}</span>
                  <span>{formatDuration(session.durationSeconds)}</span>
                </div>
                <Link className="sc-btn sc-btn--sm" to={`/studio/sessions/${session.id}/report`}>
                  {t('studioReport.history.viewReport')}
                </Link>
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
    </div>
  );
}
