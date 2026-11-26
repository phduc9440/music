import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import Modal from '../common/Modal';
import { omrApi } from '../../../services';
import type { AiTaskInfo, OmrRetryInfo, OmrSourceType } from '../../../types';
import { OMR_SOURCE_LABELS, getUploadErrorMessage } from '../../../utils/score';
import { reportPlanLimit } from '../../../utils/planLimit';
import { t } from '../../../i18n/core';
import './omr.css';

const SOURCE_TYPES = Object.keys(OMR_SOURCE_LABELS) as OmrSourceType[];

/** Lỗi lần trước cho thấy ảnh khó đọc: gợi ý đổi loại nguồn và bật làm sạch ảnh thay vì chạy lại y hệt. */
const IMAGE_ERRORS = ['NO_STAFF_DETECTED', 'PAGE_UNREADABLE', 'RECOGNITION_EMPTY'];

interface Props {
  scoreId: string;
  onClose: () => void;
  /** Đã gửi xong: trang gọi tự chuyển sang trang tiến độ hoặc cập nhật tác vụ. */
  onStarted: (task: AiTaskInfo) => void;
}

/**
 * Hộp "Nhận diện lại" dùng chung cho trang kết quả, trang tiến độ và trang chi tiết (OMR-01, OMR-06): nói trước hậu quả
 * (bản đã sửa tay vẫn ở Lịch sử phiên bản, kết quả mới thành phiên bản kế tiếp; số trang sẽ trừ vào hạn mức tháng) và cho
 * đổi loại nguồn, tiền xử lý, kèm gợi ý theo lỗi của lần trước.
 */
export default function OmrRedoDialog({ scoreId, onClose, onStarted }: Props) {
  const [info, setInfo] = useState<OmrRetryInfo | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [sourceType, setSourceType] = useState<OmrSourceType | null>(null);
  const [preprocess, setPreprocess] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    omrApi
      .retryInfo(scoreId)
      .then((res) => {
        if (cancelled) return;
        const data = res.data.result;
        setInfo(data);
        setSourceType(data.sourceType);
        setPreprocess(data.preprocess);
      })
      .catch(() => !cancelled && setLoadFailed(true));
    return () => {
      cancelled = true;
    };
  }, [scoreId]);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await omrApi.retry(scoreId, { preprocess, sourceType: sourceType ?? undefined });
      toast.success(t('upload.review.redoSent'));
      onStarted(res.data.result);
    } catch (err) {
      if (!reportPlanLimit(err)) toast.error(getUploadErrorMessage(err));
      setBusy(false);
    }
  };

  const remaining = info?.monthlyLimit != null ? Math.max(0, info.monthlyLimit - info.monthlyUsed) : null;
  const notEnough = info != null && remaining != null && info.pages > remaining;
  const imageError = info?.lastErrorCode && IMAGE_ERRORS.includes(info.lastErrorCode);

  return (
    <Modal title={t('upload.redo.title')} onClose={() => !busy && onClose()}>
      {!info && !loadFailed && <p aria-busy="true">{t('common.loading')}</p>}
      {loadFailed && <p>{t('upload.redo.loadFailed')}</p>}
      {info && (
        <>
          <p>{t('upload.redo.text')}</p>
          {info.editedVersions > 0 && (
            <div className="om-note om-note--warning" role="alert">
              {t('upload.redo.edited', {
                count: info.editedVersions,
                next: (info.currentVersion ?? 0) + 1,
              })}
            </div>
          )}
          <div className={`om-note ${notEnough ? 'om-note--warning' : 'om-note--info'}`}>
            {remaining == null
              ? t('upload.redo.pagesUnlimited', { count: info.pages })
              : t('upload.redo.pages', {
                  count: info.pages,
                  used: info.monthlyUsed,
                  limit: info.monthlyLimit ?? 0,
                })}
            {notEnough && ` ${t('upload.redo.notEnough', { remaining: remaining ?? 0 })}`}
          </div>
          {imageError && (
            <div className="om-note om-note--info">
              {t('upload.redo.imageErrorHint', { code: info.lastErrorCode ?? '' })}
            </div>
          )}

          <div className="om-field">
            <span className="om-field__label" id="om-redo-source">
              {t('upload.sourceType')}
            </span>
            <div className="om-segment" role="radiogroup" aria-labelledby="om-redo-source">
              {SOURCE_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={sourceType === type}
                  className={`om-segment__opt${sourceType === type ? ' is-active' : ''}`}
                  disabled={busy}
                  onClick={() => setSourceType(type)}
                >
                  {OMR_SOURCE_LABELS[type]}
                </button>
              ))}
            </div>
            <p className="om-field__hint">{t('upload.sourceHint')}</p>
          </div>

          <label className="om-check">
            <input
              type="checkbox"
              checked={preprocess}
              disabled={busy}
              onChange={(e) => setPreprocess(e.target.checked)}
            />
            {t('upload.review.redoPreprocess')}
          </label>
        </>
      )}
      <div className="sc-modal__actions">
        <button className="sc-btn" disabled={busy} onClick={onClose}>
          {t('upload.review.later')}
        </button>
        <button className="sc-btn sc-btn--primary" disabled={busy || !info} onClick={submit}>
          {busy ? t('scores.request.sending') : t('upload.review.redo')}
        </button>
      </div>
    </Modal>
  );
}
