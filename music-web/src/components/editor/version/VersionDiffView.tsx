import { useEffect, useState } from 'react';
import { versionApi } from '../../../services/versionApi';
import type { DiffErrorType, ScoreDiff } from '../../../types/version';
import { DIFF_ERROR_LABELS, diffMeasureLabel, diffMeasureTitle, formatRate, getDiffErrorMessage } from './versionUtils';
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
        Đang so sánh...
      </p>
    );

  const s = diff.summary;
  const total = diff.measures.length;
  const kept = total ? s.same / total : 0;
  const facts: [string, string][] = [
    ['Ô giữ nguyên', `${formatRate(kept)} (${s.same}/${total})`],
    ['Ô đã sửa', String(s.edited)],
    ['Ô OMR sinh thừa', String(s.deleted)],
    ['Ô OMR bỏ sót', String(s.added)],
    ['Lỗi nốt', `${s.noteErrors} (${formatRate(s.noteErrorRate)} số nốt)`],
  ];
  const errorTypes = ERROR_ORDER.filter((t) => s.byType[t] > 0);

  return (
    <div className="vh-diff">
      <p className="vh-hint">
        So phiên bản {diff.targetVersion} với phiên bản {diff.baseVersion}
        {diff.cached ? ' (kết quả đã lưu)' : ''}.
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
          {errorTypes.map((t) => (
            <span key={t} className="vh-badge">
              {DIFF_ERROR_LABELS[t]}: {s.byType[t]}
            </span>
          ))}
        </p>
      )}
      <ul className="vh-diff__strip" aria-label="Các ô nhịp">
        {diff.measures.map((m, i) => (
          <li key={i} className={`vh-cell vh-cell--${m.status}`} title={diffMeasureTitle(m)}>
            {diffMeasureLabel(m)}
          </li>
        ))}
      </ul>
      <p className="vh-diff__legend">
        <span className="vh-cell vh-cell--same">Giữ nguyên</span>
        <span className="vh-cell vh-cell--edited">Đã sửa</span>
        <span className="vh-cell vh-cell--deleted">OMR sinh thừa</span>
        <span className="vh-cell vh-cell--added">OMR bỏ sót</span>
      </p>
    </div>
  );
}
