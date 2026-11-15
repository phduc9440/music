import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'react-toastify';
import { scoreApi, tagApi } from '../../../services';
import {
  COVER_MAX_BYTES,
  COVER_TYPES,
  MAX_COMPOSER,
  MAX_NOTES,
  MAX_TITLE,
  getErrorMessage,
} from '../../../utils/score';
import Modal from '../common/Modal';
import { Icon } from '../../ui';
import ComposerDatalist from '../../composers/ComposerDatalist';
import type { Difficulty, ScoreDetail, Tag, Visibility } from '../../../types';
import { t } from '../../../i18n/core';

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
  const [visibility, setVisibility] = useState<Visibility>(
    score.visibility === 'PENDING' ? 'PUBLIC' : score.visibility,
  );
  const [allowDownload, setAllowDownload] = useState(score.allowDownload);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const initialTagIds = (score.tags ?? []).map((t) => t.id);
  const [tagIds, setTagIds] = useState<string[]>(initialTagIds);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Ảnh bìa: chọn hoặc gỡ chỉ có hiệu lực khi bấm Lưu (như các trường khác); previewUrl là ảnh vừa chọn, chưa tải lên
  const coverInput = useRef<HTMLInputElement>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverRemoved, setCoverRemoved] = useState(false);
  const previewUrl = useMemo(() => (coverFile ? URL.createObjectURL(coverFile) : null), [coverFile]);
  const shownCover = coverRemoved ? null : (previewUrl ?? score.coverUrl ?? null);

  useEffect(() => {
    // Giải phóng địa chỉ xem trước khi đổi ảnh hoặc đóng hộp thoại
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const pickCover = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!COVER_TYPES.includes(file.type) || file.size > COVER_MAX_BYTES) return setError(t('errors.2025'));
    setError('');
    setCoverRemoved(false);
    setCoverFile(file);
  };

  const removeCover = () => {
    setCoverFile(null);
    setCoverRemoved(true);
  };

  useEffect(() => {
    tagApi
      .list()
      .then((res) => setAllTags(res.data.result))
      .catch(() => setError(t('scores.edit.tagsFailed')));
  }, []);

  const toggleTag = (id: string) =>
    setTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // Validate phía client trước khi gọi API (BE vẫn validate lại)
    if (!title.trim()) return setError(t('scores.edit.titleRequired'));
    if (title.length > MAX_TITLE) return setError(t('scores.edit.titleMax', { max: MAX_TITLE }));
    if (composer.length > MAX_COMPOSER) return setError(t('scores.edit.composerMax', { max: MAX_COMPOSER }));
    if (studyNotes.length > MAX_NOTES) return setError(t('scores.edit.notesMax', { max: MAX_NOTES }));

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
        // Cho phép tải chỉ chủ sở hữu được đổi (BE trả 1002 với người khác)
        ...(score.canManageSharing && allowDownload !== score.allowDownload ? { allowDownload } : {}),
      });
      let saved = res.data.result;
      // Chỉ gọi API thể loại khi người dùng có đổi lựa chọn
      const tagsChanged = tagIds.length !== initialTagIds.length || tagIds.some((id) => !initialTagIds.includes(id));
      if (tagsChanged) saved = (await scoreApi.updateTags(score.id, tagIds)).data.result;
      if (coverFile) saved = (await scoreApi.uploadCover(score.id, coverFile)).data.result;
      else if (coverRemoved && score.coverUrl) saved = (await scoreApi.removeCover(score.id)).data.result;
      toast.success(t('scores.edit.saved'));
      onSaved(saved);
    } catch (err) {
      setError(getErrorMessage(err, t('scores.edit.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={t('scores.edit.title')} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <span className="sc-label">{t('scores.cover.label')}</span>
        <div className="sc-coveredit">
          <span className="sc-coveredit__thumb">
            {shownCover ? (
              <img src={shownCover} alt={t('scores.cover.alt', { title: score.title })} />
            ) : (
              <Icon name="music" size={26} />
            )}
          </span>
          <div className="sc-coveredit__body">
            <div className="sc-coveredit__btns">
              <button type="button" className="sc-btn sc-btn--sm" onClick={() => coverInput.current?.click()}>
                <Icon name="upload" size={14} />
                {shownCover ? t('scores.cover.change') : t('scores.cover.add')}
              </button>
              {shownCover && (
                <button type="button" className="sc-btn sc-btn--sm sc-btn--danger" onClick={removeCover}>
                  {t('scores.cover.remove')}
                </button>
              )}
            </div>
            <p className="sc-upload__hint">
              {coverFile || coverRemoved ? t('scores.cover.pending') : t('scores.cover.hint')}
            </p>
          </div>
          <input ref={coverInput} type="file" accept="image/jpeg,image/png" hidden onChange={pickCover} />
        </div>

        <label className="sc-label" htmlFor="sc-title">
          {t('scores.edit.scoreTitle')}
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
          {t('scores.edit.composer')}
        </label>
        <input
          id="sc-composer"
          className="sc-input"
          list="sc-composer-list"
          value={composer}
          maxLength={MAX_COMPOSER}
          onChange={(e) => setComposer(e.target.value)}
        />
        <ComposerDatalist id="sc-composer-list" />

        <label className="sc-label" htmlFor="sc-difficulty">
          {t('scores.hero.difficulty')}
        </label>
        <select
          id="sc-difficulty"
          className="sc-input"
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as Difficulty | '')}
        >
          <option value="">{t('scores.edit.keep')}</option>
          <option value="EASY">{t('scores.labels.difficulty.EASY')}</option>
          <option value="MEDIUM">{t('scores.labels.difficulty.MEDIUM')}</option>
          <option value="HARD">{t('scores.labels.difficulty.HARD')}</option>
          <option value="EXPERT">{t('scores.labels.difficulty.EXPERT')}</option>
        </select>

        {score.canDelete && (
          <>
            <label className="sc-label" htmlFor="sc-visibility">
              {t('scores.edit.visibility')}
            </label>
            <select
              id="sc-visibility"
              className="sc-input"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as Visibility)}
            >
              <option value="PRIVATE">{t('scores.edit.visPrivate')}</option>
              <option value="PUBLIC">{t('scores.edit.visPublic')}</option>
            </select>
            {visibility === 'PUBLIC' && score.visibility !== 'PUBLIC' && (
              <p className="sc-upload__hint">{t('scores.edit.visHint')}</p>
            )}
          </>
        )}

        {score.canManageSharing && (
          <label className="sc-check">
            <input type="checkbox" checked={allowDownload} onChange={(e) => setAllowDownload(e.target.checked)} />
            <span>{t('scores.edit.allowDownload')}</span>
          </label>
        )}

        <span className="sc-label">
          {t('scores.explore.tag')}
          <span className="sc-counter">
            {tagIds.length}/{MAX_TAGS}
          </span>
        </span>
        <div className="sc-tagpick" role="group" aria-label={t('scores.explore.tag')}>
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
          {t('scores.hero.studyNotes')}
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
            {t('common.cancel')}
          </button>
          <button type="submit" className="sc-btn sc-btn--primary" disabled={saving}>
            {saving ? t('scores.edit.saving') : t('scores.edit.saveChanges')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
