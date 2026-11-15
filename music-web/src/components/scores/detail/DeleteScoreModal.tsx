import { useState } from 'react';
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

/** Xác nhận chuyển vào thùng rác: người dùng phải gõ lại đúng tên bản nhạc để tránh xóa nhầm. */
export default function DeleteScoreModal({ scoreId, title, moderating = false, onClose, onDeleted }: Props) {
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    setDeleting(true);
    setError('');
    try {
      await scoreApi.remove(scoreId, moderating ? reason.trim() : undefined);
      toast.success(t('scores.delete.done'));
      onDeleted();
    } catch (err) {
      setError(getErrorMessage(err, t('scores.trash.purgeFailed')));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal title={t('scores.hero.delete')} onClose={onClose}>
      <p className="sc-delete__text">
        <Rich text={t('scores.delete.text', { title })} />
      </p>
      <input
        className="sc-input"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder={t('scores.trash.retype')}
        autoFocus
      />
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
      {error && <div className="sc-error">{error}</div>}
      <div className="sc-modal__actions">
        <button className="sc-btn" onClick={onClose} disabled={deleting}>
          {t('common.cancel')}
        </button>
        <button
          className="sc-btn sc-btn--danger-solid"
          onClick={handleDelete}
          disabled={deleting || typed.trim() !== title.trim()}
        >
          {deleting ? t('scores.delete.moving') : t('scores.delete.move')}
        </button>
      </div>
    </Modal>
  );
}
