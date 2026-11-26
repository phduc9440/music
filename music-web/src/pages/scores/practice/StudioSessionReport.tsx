import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { BackLink, Icon } from '../../../components/ui';
import { Link } from '../../../routes/transition-nav';
import { studioApi } from '../../../services/practice/studioApi';
import type { StudioSessionReport as StudioSessionReportData } from '../../../types';
import { formatDateTime, t } from '../../../i18n/core';
import '../../../components/scores/scores.css';
import './studio-report.css';

const formatPercent = (value?: number | null) => (value == null ? '—' : `${value.toFixed(1)}%`);

export default function StudioSessionReport() {
  const { sessionId } = useParams();
  const [report, setReport] = useState<StudioSessionReportData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!sessionId) return;
    studioApi
      .report(sessionId)
      .then((response) => {
        if (!cancelled) {
          setReport(response.data);
          setLoadFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadFailed(true);
          toast.error(t('studioReport.report.loadFailed'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return (
    <div className="sc-page">
      <main className="sc-container">
        <BackLink label={t('studioReport.report.back')} to="/practice-history" />
        {!report && <p>{t(loadFailed ? 'studioReport.report.loadFailed' : 'studioReport.report.loading')}</p>}
        {report && (
          <>
            <header className="sc-lib-head">
              <div>
                <h1>{t('studioReport.report.title')}</h1>
                <p className="sc-title-clamp" title={report.title}>
                  {report.title}
                </p>
              </div>
              {/* điểm của phiên và hai lối đi tiếp: luyện lại ngay bài này, hoặc về trang bản nhạc */}
              <div className="studio-report__head-side">
                <strong className="studio-report__grade">
                  {report.grade} · {report.scorePoints}
                </strong>
                <div className="studio-report__actions">
                  <Link className="sc-btn" to={`/scores/${report.scoreId}`}>
                    <Icon name="music" size={16} />
                    {t('studioReport.report.openScore')}
                  </Link>
                  <Link className="sc-btn sc-btn--primary" to={`/studio/scores/${report.scoreId}/play`}>
                    <Icon name="refresh" size={16} />
                    {t('studioReport.report.practiceAgain')}
                  </Link>
                </div>
              </div>
            </header>

            <section className="studio-report__cards" aria-label={t('studioReport.report.summary')}>
              <article>
                <span>{t('studioReport.report.accuracy')}</span>
                <strong>{formatPercent(report.accuracyPct)}</strong>
              </article>
              <article>
                <span>{t('studioReport.report.timing')}</span>
                <strong>{formatPercent(report.timingAccuracyPct)}</strong>
              </article>
              <article>
                <span>{t('studioReport.report.mode')}</span>
                <strong>{t(`studioReport.mode.${report.mode}`)}</strong>
              </article>
              <article>
                <span>{t('studioReport.report.date')}</span>
                <strong>{formatDateTime(report.startedAt)}</strong>
              </article>
            </section>

            <section className="studio-report__section">
              <h2>{t('studioReport.report.counts')}</h2>
              <div className="studio-report__counts">
                {(
                  [
                    ['total', report.counts.total],
                    ['perfect', report.counts.perfect],
                    ['early', report.counts.early],
                    ['late', report.counts.late],
                    ['wrongPitch', report.counts.wrongPitch],
                    ['missed', report.counts.missed],
                  ] as const
                ).map(([key, value]) => (
                  <div key={key}>
                    <span>{t(`studioReport.counts.${key}`)}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="studio-report__section">
              <h2>{t('studioReport.report.comparison')}</h2>
              <p>
                {t('studioReport.report.previous')}: {report.comparison.previousScorePoints ?? '—'} ·{' '}
                {t('studioReport.report.best')}: {report.comparison.bestScorePoints ?? '—'}
              </p>
              {report.comparison.isNewBest && <strong>{t('studioReport.report.newBest')}</strong>}
              <p>
                {t('studioReport.report.completed')}: {report.isCompleted ? t('common.yes') : t('common.no')}
              </p>
            </section>

            <section className="studio-report__section">
              <h2>{t('studioReport.report.measures')}</h2>
              {report.weakestMeasures.length > 0 && (
                <p>
                  {t('studioReport.report.weakest')}: {report.weakestMeasures.join(', ')}
                </p>
              )}
              {report.measureBreakdown.length > 0 ? (
                <div className="studio-report__table-wrap">
                  <table className="studio-report__table">
                    <thead>
                      <tr>
                        <th>{t('studioReport.report.measure')}</th>
                        {(['perfect', 'early', 'late', 'wrongPitch', 'missed'] as const).map((key) => (
                          <th key={key}>{t(`studioReport.counts.${key}`)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {report.measureBreakdown.map((measure) => (
                        <tr key={measure.measure}>
                          <th>{measure.measure}</th>
                          <td>{measure.perfect}</td>
                          <td>{measure.early}</td>
                          <td>{measure.late}</td>
                          <td>{measure.wrongPitch}</td>
                          <td>{measure.missed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>{t('studioReport.report.noMeasureData')}</p>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
