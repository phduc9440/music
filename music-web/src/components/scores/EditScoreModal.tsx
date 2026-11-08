import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'react-toastify';
import { scoreApi, tagApi } from '../../services';
import { MAX_COMPOSER, MAX_NOTES, MAX_TITLE, getErrorMessage } from '../../utils/score';
import Modal from './Modal';
import type { Difficulty, ScoreDetail, Tag, Visibility } from '../../types';

const MAX_TAGS = 10; // khớp BE (mã lỗi 2302)

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
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const initialTagIds = (score.tags ?? []).map((t) => t.id);
  const [tagIds, setTagIds] = useState<string[]>(initialTagIds);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    tagApi
      .list()
      .then((res) => setAllTags(res.data.result))
      .catch(() => setError('Không tải được danh sách thể loại'));
  }, []);

  const toggleTag = (id: string) =>
    setTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

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
      let saved = res.data.result;
      // Chỉ gọi API thể loại khi người dùng có đổi lựa chọn
      const tagsChanged =
        tagIds.length !== initialTagIds.length || tagIds.some((id) => !initialTagIds.includes(id));
      if (tagsChanged) saved = (await scoreApi.updateTags(score.id, tagIds)).data.result;
      toast.success('Đã lưu thông tin bản nhạc');
      onSaved(saved);
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
          <option value="EXPERT">Chuyên gia</option>
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

        <span className="sc-label">
          Thể loại
          <span className="sc-counter">
            {tagIds.length}/{MAX_TAGS}
          </span>
        </span>
        <div className="sc-tagpick" role="group" aria-label="Thể loại">
          {allTags.map((t) => {
            const active = tagIds.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={active}
                className={`sc-tagpick__opt ${active ? 'is-active' : ''}`}
                disabled={!active && tagIds.length >= MAX_TAGS}
                onClick={() => toggleTag(t.id)}
              >
                {t.name}
              </button>
            );
          })}
        </div>

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
