import { useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'react-toastify';
import { scoreApi } from '../../services';
import { MAX_COMPOSER, MAX_NOTES, MAX_TITLE, getErrorMessage } from '../../utils/score';
import Modal from './Modal';
import type { Difficulty, ScoreDetail, Visibility } from '../../types';

interface Props {
  score: ScoreDetail;
  onClose: () => void;
  onSaved: (updated: ScoreDetail) => void;
}

export default function EditScoreModal({ score, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(score.title);
  const [composer, setComposer] = useState(score.composer ?? '');
  const [difficulty, setDifficulty] = useState<Difficulty | ''>(score.difficulty ?? '');
  const [studyNotes, setStudyNotes] = useState(score.studyNotes ?? '');
  const [visibility, setVisibility] = useState<Visibility>(score.visibility);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // Validate phía client trước khi gọi API (BE vẫn validate lại)
    if (!title.trim()) return setError('Tên bản nhạc không được để trống');
    if (title.length > MAX_TITLE) return setError(`Tên tối đa ${MAX_TITLE} ký tự`);
    if (composer.length > MAX_COMPOSER) return setError(`Tác giả tối đa ${MAX_COMPOSER} ký tự`);
    if (studyNotes.length > MAX_NOTES) return setError(`Ghi chú tối đa ${MAX_NOTES} ký tự`);

    setError('');
    setSaving(true);
    try {
      const res = await scoreApi.update(score.id, {
        title: title.trim(),
        composer,
        studyNotes,
        // Chưa chọn độ khó thì không gửi, tránh gửi chuỗi rỗng làm BE báo lỗi
        ...(difficulty ? { difficulty } : {}),
        // Chỉ chủ sở hữu (hoặc admin) mới được đổi chế độ hiển thị
        ...(score.canDelete ? { visibility } : {}),
      });
      toast.success('Đã lưu thông tin bản nhạc');
      onSaved(res.data.result);
    } catch (err) {
      setError(getErrorMessage(err, 'Không lưu được, vui lòng thử lại'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Sửa thông tin bản nhạc" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <label className="sc-label" htmlFor="sc-title">
          Tên bản nhạc *
        </label>
        <input
          id="sc-title"
          className="sc-input"
          value={title}
          maxLength={MAX_TITLE}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />

        <label className="sc-label" htmlFor="sc-composer">
          Tác giả
        </label>
        <input
          id="sc-composer"
          className="sc-input"
          value={composer}
          maxLength={MAX_COMPOSER}
          onChange={(e) => setComposer(e.target.value)}
        />

        <label className="sc-label" htmlFor="sc-difficulty">
          Độ khó
        </label>
        <select
          id="sc-difficulty"
          className="sc-input"
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as Difficulty | '')}
        >
          <option value="">-- Không đổi --</option>
          <option value="EASY">Dễ</option>
          <option value="MEDIUM">Trung bình</option>
          <option value="HARD">Khó</option>
        </select>

        {score.canDelete && (
          <>
            <label className="sc-label" htmlFor="sc-visibility">
              Hiển thị
            </label>
            <select
              id="sc-visibility"
              className="sc-input"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as Visibility)}
            >
              <option value="PRIVATE">Riêng tư (chỉ mình tôi)</option>
              <option value="PUBLIC">Công khai</option>
            </select>
          </>
        )}

        <label className="sc-label" htmlFor="sc-notes">
          Ghi chú luyện tập
          <span className="sc-counter">
            {studyNotes.length}/{MAX_NOTES}
          </span>
        </label>
        <textarea
          id="sc-notes"
          className="sc-input"
          rows={4}
          value={studyNotes}
          maxLength={MAX_NOTES}
          onChange={(e) => setStudyNotes(e.target.value)}
        />

        {error && <div className="sc-error">{error}</div>}

        <div className="sc-modal__actions">
          <button type="button" className="sc-btn" onClick={onClose} disabled={saving}>
            Hủy
          </button>
          <button type="submit" className="sc-btn sc-btn--primary" disabled={saving}>
            {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
