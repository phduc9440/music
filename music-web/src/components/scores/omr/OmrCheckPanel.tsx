import { useState } from 'react';
import type { OmrMeasure } from '../../../types';
import { MEASURE_FLAG_LABELS, confidencePercent } from '../../../utils/omr';
import { t } from '../../../i18n/core';
import MeasureCrop from './MeasureCrop';
import type { OmrCheckState } from './useOmrCheck';
import './omr.css';

interface Props {
  check: OmrCheckState;
  /** Nhảy tới ô (chỉ số từ 0) trên bản nhạc đang sửa. */
  onFocusMeasure: (index: number) => void;
  onClose: () => void;
}

const reasonsOf = (m: OmrMeasure): string[] =>
  m.reasons?.length ? m.reasons : m.flags.map((f) => MEASURE_FLAG_LABELS[f] ?? f);

/**
 * Bảng "Cần kiểm tra" ở cột phải Editor (OMR-03): các ô OMR chưa chắc chắn, bấm để nhảy tới ô và xem ô đó cắt từ ảnh trang
 * gốc, đánh dấu "Đã kiểm" khi đã sửa hoặc thấy đúng. Danh sách và ảnh lấy từ kết quả nhận diện, không phải mở trang Kết quả.
 */
export default function OmrCheckPanel({ check, onFocusMeasure, onClose }: Props) {
  const [active, setActive] = useState<number | null>(null);
  const [hideChecked, setHideChecked] = useState(false);
  const { flagged, checked, pages } = check;
  const done = flagged.filter((m) => checked.has(m.measure)).length;
  const shown = hideChecked ? flagged.filter((m) => !checked.has(m.measure)) : flagged;

  const open = (m: OmrMeasure) => {
    setActive((cur) => (cur === m.measure ? null : m.measure));
    onFocusMeasure(m.measure - 1);
  };

  return (
    <aside className="sv-comments om-panel" aria-label={t('upload.check.title')}>
      <div className="sv-comments__head">
        <h2>{t('upload.check.title')}</h2>
        <button
          type="button"
          className="sv-comments__close"
          onClick={onClose}
          aria-label={t('upload.check.close')}
          title={t('upload.check.close')}
        >
          ×
        </button>
      </div>
      <p className="om-panel__intro">{t('upload.check.intro')}</p>
      {check.editedSinceOmr && <div className="om-note om-note--warning">{t('upload.check.edited')}</div>}
      <div className="om-panel__progress">
        <span>{t('upload.check.progress', { done, total: flagged.length })}</span>
        <label className="om-check" style={{ margin: 0 }}>
          <input type="checkbox" checked={hideChecked} onChange={(e) => setHideChecked(e.target.checked)} />
          {t('upload.check.hideChecked')}
        </label>
      </div>
      {shown.length === 0 ? (
        <p className="om-panel__intro">{t('upload.check.allDone')}</p>
      ) : (
        <ul className="om-panel__list">
          {shown.map((m) => {
            const isActive = active === m.measure;
            const isChecked = checked.has(m.measure);
            const reasons = reasonsOf(m);
            const confidence = confidencePercent(m);
            return (
              <li key={m.measure} className={`om-item${isActive ? ' is-active' : ''}${isChecked ? ' is-checked' : ''}`}>
                <button type="button" className="om-item__head" aria-expanded={isActive} onClick={() => open(m)}>
                  <span>
                    <span className="om-item__title">
                      {isChecked ? '✓ ' : ''}
                      {t('upload.review.selected', { measure: m.measure, page: m.page })}
                    </span>
                    <span className="om-item__reason">{reasons[0] ?? ''}</span>
                  </span>
                  {confidence !== null && (
                    <span className="om-item__reason">{t('upload.review.confidence', { value: confidence })}</span>
                  )}
                </button>
                {isActive && (
                  <div className="om-item__body">
                    <MeasureCrop measure={m} pageUrl={pages.get(m.page)?.downloadUrl} />
                    {reasons.slice(1).map((text, i) => (
                      <span key={i} className="om-item__reason">
                        {text}
                      </span>
                    ))}
                    <div className="om-item__actions">
                      <button type="button" className="sc-btn sc-btn--sm" onClick={() => onFocusMeasure(m.measure - 1)}>
                        {t('upload.check.jump')}
                      </button>
                      <button
                        type="button"
                        className={`sc-btn sc-btn--sm${isChecked ? '' : ' sc-btn--primary'}`}
                        onClick={() => check.toggleChecked(m.measure)}
                      >
                        {isChecked ? t('upload.check.uncheck') : t('upload.check.markChecked')}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
