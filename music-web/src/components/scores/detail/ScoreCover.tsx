import { useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { scoreApi } from '../../../services';
import { getErrorMessage } from '../../../utils/score';
import type { ScoreDetail } from '../../../types';
import { Icon } from '../../ui';
import { t } from '../../../i18n/core';

const MAX_BYTES = 3 * 1024 * 1024; // khớp BE (lỗi 2025)
const TYPES = ['image/jpeg', 'image/png'];

/**
 * Ô ảnh bìa ở đầu trang chi tiết. Người có quyền sửa tải ảnh lên (lưu trên Cloudinary như ảnh đại diện) hoặc gỡ;
 * người khác chỉ thấy ảnh khi bản nhạc có bìa. Chưa có bìa thì giao diện dùng ảnh trang 1 ở các danh sách.
 */
export default function ScoreCover({
  score,
  onChanged,
}: {
  score: ScoreDetail;
  onChanged: (score: ScoreDetail) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const editable = score.canEdit;
  if (!score.coverUrl && !editable) return null;

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!TYPES.includes(file.type) || file.size > MAX_BYTES) {
      toast.error(t('errors.2025'));
      return;
    }
    setBusy(true);
    try {
      const res = await scoreApi.uploadCover(score.id, file);
      onChanged(res.data.result);
      toast.success(t('scores.cover.updated'));
    } catch (err) {
      toast.error(getErrorMessage(err, t('scores.cover.failed')));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const res = await scoreApi.removeCover(score.id);
      onChanged(res.data.result);
      toast.success(t('scores.cover.removed'));
    } catch (err) {
      toast.error(getErrorMessage(err, t('scores.cover.removeFailed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sd-cover">
      {score.coverUrl ? (
        <img src={score.coverUrl} alt={t('scores.cover.alt', { title: score.title })} className="sd-cover__img" />
      ) : (
        <span className="sd-cover__empty" aria-hidden="true">
          <Icon name="music" size={28} />
        </span>
      )}
      {editable && (
        <div className="sd-cover__actions">
          <button
            type="button"
            className="sd-cover__btn"
            disabled={busy}
            title={score.coverUrl ? t('scores.cover.change') : t('scores.cover.add')}
            aria-label={score.coverUrl ? t('scores.cover.change') : t('scores.cover.add')}
            onClick={() => input.current?.click()}
          >
            <Icon name="upload" size={15} />
          </button>
          {score.coverUrl && (
            <button
              type="button"
              className="sd-cover__btn"
              disabled={busy}
              title={t('scores.cover.remove')}
              aria-label={t('scores.cover.remove')}
              onClick={remove}
            >
              <Icon name="trash" size={15} />
            </button>
          )}
          <input ref={input} type="file" accept="image/jpeg,image/png" hidden onChange={pick} />
        </div>
      )}
    </div>
  );
}
