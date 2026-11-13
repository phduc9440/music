import { useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'react-toastify';
import Modal from './Modal';
import { REPORT_REASONS } from '../../../types';
import type { ReportReason } from '../../../types';
import type { ReportPayload } from '../../../services';
import { getErrorMessage } from '../../../utils/score';
import { t } from '../../../i18n/core';

interface Props {
  title: string;
  /** Gửi báo cáo; ném lỗi nếu BE từ chối (đã báo cáo rồi, nội dung của chính mình...). */
  onSubmit: (payload: ReportPayload) => Promise<unknown>;
  onClose: () => void;
}

const MAX_DETAILS = 1000; // khớp BE

/** Hộp thoại báo cáo vi phạm dùng cho bản nhạc và góp ý: chọn lý do, mô tả thêm (bắt buộc khi chọn "Lý do khác"). */
export default function ReportModal({ title, onSubmit, onClose }: Props) {
  const [reason, setReason] = useState<ReportReason>('COPYRIGHT');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const needDetails = reason === 'OTHER';
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || (needDetails && !details.trim())) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit({ reason, details: details.trim() || undefined });
      toast.success(t('scores.report.sent'));
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, t('scores.report.failed')));
      setBusy(false);
    }
  };

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit}>
        <p className="sc-delete__text">{t('scores.report.intro')}</p>
        <fieldset className="rp-reasons">
          <legend className="sc-label">{t('scores.report.reason')}</legend>
          {REPORT_REASONS.map((r) => (
            <label key={r} className="rp-reason">
              <input type="radio" name="report-reason" checked={reason === r} onChange={() => setReason(r)} />
              {t(`scores.report.reasons.${r}`)}
            </label>
          ))}
        </fieldset>
        <label className="sc-label" htmlFor="report-details">
          {t('scores.report.details')}
          {!needDetails && <span className="sc-counter"> {t('scores.report.detailsOptional')}</span>}
          <span className="sc-counter">
            {details.length}/{MAX_DETAILS}
          </span>
        </label>
        <textarea
          id="report-details"
          className="sc-input"
          rows={4}
          value={details}
          maxLength={MAX_DETAILS}
          placeholder={t('scores.report.detailsPlaceholder')}
          onChange={(e) => setDetails(e.target.value)}
        />
        {error && <div className="sc-error">{error}</div>}
        <div className="sc-modal__actions">
          <button type="button" className="sc-btn" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="sc-btn sc-btn--primary" disabled={busy || (needDetails && !details.trim())}>
            {busy ? t('scores.report.sending') : t('scores.report.send')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
