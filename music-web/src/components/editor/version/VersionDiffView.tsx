import { useEffect, useState } from 'react';
import { t } from '../../../i18n/core';
import { versionApi } from '../../../services/score/versionApi';
import type { DiffErrorType, ScoreDiff } from '../../../types/version';
import { diffErrorLabel, diffMeasureLabel, diffMeasureTitle, formatRate, getDiffErrorMessage } from './versionUtils';
import './version.css';

interface Props {
  scoreId: string;
  version: number;
  /** Phiên bản gốc; bỏ trống thì BE dùng bản do OMR sinh ra. */
  base?: number;
}

const ERROR_ORDER: DiffErrorType[] = ['PITCH', 'ACCIDENTAL', 'DURATION', 'TIMING', 'EXTRA', 'MISSING'];

/**
 * So một phiên bản với bản gốc: thẻ "Chất lượng nhận diện" (tỉ lệ ô giữ nguyên, ô OMR sinh thừa/bỏ sót, lỗi nốt theo
 * loại) và dải ô nhịp tô màu (xám giữ nguyên, vàng sửa, đỏ gạch OMR sinh thừa, xanh OMR bỏ sót); rê chuột để xem lỗi.
 */
export default function VersionDiffView({ scoreId, version, base }: Props) {
  const [diff, setDiff] = useState<ScoreDiff | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    versionApi
      .diff(scoreId, version, base)
      .then((result) => !cancelled && setDiff(result))
      .catch((err) => !cancelled && setError(getDiffErrorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [scoreId, version, base]);

  if (error)
    return (
      <p className="vh-empty" role="alert">
        {error}
      </p>
    );
  if (diff === null)
    return (
      <p className="vh-empty" aria-busy="true">
        {t('editor.version.panel.comparing')}
      </p>
    );

  const s = diff.summary;
  const total = diff.measures.length;
  const kept = total ? s.same / total : 0;
  const facts: [string, string][] = [
    [
      t('editor.version.panel.kept'),
      t('editor.version.panel.keptValue', { rate: formatRate(kept), same: s.same, total }),
    ],
    [t('editor.version.panel.edited'), String(s.edited)],
    [t('editor.version.panel.extra'), String(s.deleted)],
    [t('editor.version.panel.missed'), String(s.added)],
    [
      t('editor.version.panel.noteErrors'),
      t('editor.version.panel.noteErrorsValue', { count: s.noteErrors, rate: formatRate(s.noteErrorRate) }),
    ],
  ];
  const errorTypes = ERROR_ORDER.filter((type) => s.byType[type] > 0);

  return (
    <div className="vh-diff">
      <p className="vh-hint">
        {t('editor.version.panel.summary', {
          target: diff.targetVersion,
          base: diff.baseVersion,
          cached: diff.cached ? t('editor.version.panel.cached') : '',
        })}
      </p>
      <dl className="sc-facts vh-diff__facts">
        {facts.map(([label, value]) => (
          <div key={label} className="sc-fact">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {errorTypes.length > 0 && (
        <p className="vh-diff__types">
          {errorTypes.map((type) => (
            <span key={type} className="vh-badge">
              {diffErrorLabel(type)}: {s.byType[type]}
            </span>
          ))}
        </p>
      )}
      <ul className="vh-diff__strip" aria-label={t('editor.version.panel.strip')}>
        {diff.measures.map((m, i) => (
          <li key={i} className={`vh-cell vh-cell--${m.status}`} title={diffMeasureTitle(m)}>
            {diffMeasureLabel(m)}
          </li>
        ))}
      </ul>
      <p className="vh-diff__legend">
        <span className="vh-cell vh-cell--same">{t('editor.version.panel.legend.same')}</span>
        <span className="vh-cell vh-cell--edited">{t('editor.version.panel.legend.edited')}</span>
        <span className="vh-cell vh-cell--deleted">{t('editor.version.panel.legend.extra')}</span>
        <span className="vh-cell vh-cell--added">{t('editor.version.panel.legend.missed')}</span>
      </p>
    </div>
  );
}
