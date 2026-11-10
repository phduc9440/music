import { useState } from 'react';
import { toast } from 'react-toastify';
import { scoreApi } from '../../../services';
import Modal from '../common/Modal';
import { getErrorMessage } from '../../../utils/score';

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
      toast.success('Đã chuyển bản nhạc vào thùng rác');
      onDeleted();
    } catch (err) {
      setError(getErrorMessage(err, 'Không xóa được, vui lòng thử lại'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal title="Xóa bản nhạc" onClose={onClose}>
      <p className="sc-delete__text">
        Chuyển vào thùng rác. Bản nhạc sẽ bị xóa hẳn sau 30 ngày, trong thời gian đó chủ sở hữu có thể khôi phục. Gõ{' '}
        <code>{title}</code> để xác nhận.
      </p>
      <input
        className="sc-input"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder="Nhập lại tên bản nhạc"
        autoFocus
      />
      {moderating && (
        <>
          <label className="sc-label" htmlFor="sc-delete-reason">
            Lý do (gửi tới chủ sở hữu)
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
          Hủy
        </button>
        <button
          className="sc-btn sc-btn--danger-solid"
          onClick={handleDelete}
          disabled={deleting || typed.trim() !== title.trim()}
        >
          {deleting ? 'Đang chuyển...' : 'Chuyển vào thùng rác'}
        </button>
      </div>
    </Modal>
  );
}
