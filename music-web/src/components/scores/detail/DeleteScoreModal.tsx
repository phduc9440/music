import { useState } from 'react';
import { toast } from 'react-toastify';
import { scoreApi } from '../../../services';
import Modal from '../common/Modal';
import { getErrorMessage } from '../../../utils/score';

interface Props {
  scoreId: string;
  title: string;
  onClose: () => void;
  onDeleted: () => void;
}

/** Xác nhận xóa: người dùng phải gõ lại đúng tên bản nhạc để tránh xóa nhầm. */
export default function DeleteScoreModal({ scoreId, title, onClose, onDeleted }: Props) {
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    setDeleting(true);
    setError('');
    try {
      await scoreApi.remove(scoreId);
      toast.success('Đã xóa bản nhạc');
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
        Toàn bộ file (ảnh gốc, MusicXML, MIDI, ...) và lịch sử xử lý sẽ bị xóa <strong>vĩnh viễn</strong>. Gõ{' '}
        <code>{title}</code> để xác nhận.
      </p>
      <input
        className="sc-input"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder="Nhập lại tên bản nhạc"
        autoFocus
      />
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
          {deleting ? 'Đang xóa...' : 'Xóa vĩnh viễn'}
        </button>
      </div>
    </Modal>
  );
}
