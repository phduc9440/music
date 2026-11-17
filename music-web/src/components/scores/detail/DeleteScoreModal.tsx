import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { scoreApi } from '../../../services';
import Modal from '../common/Modal';
import { getErrorMessage } from '../../../utils/score';
import { t } from '../../../i18n/core';
import Rich from '../../../i18n/Rich';

interface Props {
  scoreId: string;
  title: string;
  /** Quản trị viên xóa bản của người khác để kiểm duyệt: có ô nhập lý do gửi tới chủ sở hữu. */
  moderating?: boolean;
  onClose: () => void;
  onDeleted: () => void;
}

const MAX_REASON = 500; // khớp BE

// Khóa localStorage viết gạch nối như các khóa khác; khóa cũ có dấu chấm bị lint:i18n nhầm là khóa dịch nên chỉ còn đọc
const SKIP_KEY = 'score-skip-delete-confirm';
const LEGACY_SKIP_KEY = ['scores', 'skipDeleteConfirm'].join('.');

/** Người dùng đã tick "Không hỏi lại" ở lần trước. Trình duyệt chặn localStorage thì coi như chưa tick. */
function readSkip(): boolean {
  try {
    return localStorage.getItem(SKIP_KEY) === '1' || localStorage.getItem(LEGACY_SKIP_KEY) === '1';
  } catch {
    return false;
  }
}

function writeSkip(): void {
  try {
    localStorage.setItem(SKIP_KEY, '1');
  } catch {
    /* bỏ qua: lần sau chỉ hỏi lại */
  }
}

/**
 * Hỏi "bạn có chắc chắn chuyển vào thùng rác?". Bản nhạc vẫn khôi phục được 30 ngày nên không bắt gõ lại tên.
 * Ô "Không hỏi lại" mặc định không tick; tick rồi thì lần sau chuyển thẳng vào thùng rác, không hiện hộp thoại.
 * Quản trị viên xóa bản của người khác (``moderating``) luôn bị hỏi vì phải nhập lý do gửi chủ sở hữu.
 */
export default function DeleteScoreModal({ scoreId, title, moderating = false, onClose, onDeleted }: Props) {
  const [dontAsk, setDontAsk] = useState(false);
  const [reason, setReason] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  // Đã chọn "Không hỏi lại" từ trước: xóa ngay khi mở, không vẽ hộp thoại
  const [skipped] = useState(() => !moderating && readSkip());
  const autoRan = useRef(false);

  const handleDelete = async () => {
    setDeleting(true);
    setError('');
    try {
      await scoreApi.remove(scoreId, moderating ? reason.trim() : undefined);
      if (dontAsk && !moderating) writeSkip();
      toast.success(t('scores.delete.done'));
      onDeleted();
    } catch (err) {
      setError(getErrorMessage(err, t('scores.trash.purgeFailed')));
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    if (!skipped || autoRan.current) return;
    autoRan.current = true; // StrictMode chạy effect hai lần
    void handleDelete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skipped]);

  if (skipped && !error) return null;

  return (
    <Modal title={t('scores.hero.delete')} onClose={onClose}>
      <p className="sc-delete__text">
        <Rich text={t('scores.delete.text', { title })} />
      </p>
      {moderating && (
        <>
          <label className="sc-label" htmlFor="sc-delete-reason">
            {t('scores.delete.reason')}
            <span className="sc-counter">
              {reason.length}/{MAX_REASON}
            </span>
          </label>
          <textarea
            id="sc-delete-reason"
            className="sc-input"
            rows={3}
            value={reason}
            maxLength={MAX_REASON}
            onChange={(e) => setReason(e.target.value)}
          />
        </>
      )}
      {!moderating && (
        <label className="sc-check">
          <input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} />
          <span>{t('scores.delete.dontAsk')}</span>
        </label>
      )}
      {error && <div className="sc-error">{error}</div>}
      <div className="sc-modal__actions">
        <button className="sc-btn" onClick={onClose} disabled={deleting}>
          {t('common.cancel')}
        </button>
        <button
          className="sc-btn sc-btn--danger-solid"
          onClick={handleDelete}
          disabled={deleting}
        >
          {deleting ? t('scores.delete.moving') : t('scores.delete.move')}
        </button>
      </div>
    </Modal>
  );
}
