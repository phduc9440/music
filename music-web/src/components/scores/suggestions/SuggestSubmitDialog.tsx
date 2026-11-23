import { useState } from 'react';
import { suggestionApi } from '../../../services';
import { t } from '../../../i18n/core';
import { getErrorMessage } from '../../../utils/score';
import Modal from '../common/Modal';
import { SUGGESTION_DESCRIPTION_MAX, SUGGESTION_TITLE_MAX } from './suggestionUtils';
import './suggestions.css';

interface Props {
  scoreId: string;
  /** Phiên bản mà bản đã sửa dựa trên. */
  baseVersion: number;
  /** MusicXML đã sửa. */
  xml: string;
  onClose: () => void;
  /** Gọi khi gửi xong, kèm id đề xuất vừa tạo. */
  onSent: (suggestionId: string) => void;
}

/** Hộp gửi đề xuất sửa (mục 4.3): tiêu đề, mô tả, đếm ký tự, lỗi theo mã của máy chủ. */
export default function SuggestSubmitDialog({ scoreId, baseVersion, xml, onClose, onSent }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = title.trim().length > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await suggestionApi.create(scoreId, {
        musicXml: xml,
        baseVersion,
        title: title.trim(),
        description: description.trim() || undefined,
      });
      onSent(res.data.result.id);
    } catch (err) {
      setError(getErrorMessage(err, t('suggestions.dialog.failed')));
      setBusy(false);
    }
  };

  return (
    <Modal title={t('suggestions.dialog.title')} onClose={busy ? () => undefined : onClose}>
      <p className="sg-hint">{t('suggestions.dialog.hint')}</p>
      <label className="sc-label" htmlFor="sg-title">
        {t('suggestions.dialog.titleLabel')}
        <span className="sc-counter">
          {title.length}/{SUGGESTION_TITLE_MAX}
        </span>
      </label>
      <input
        id="sg-title"
        className="sc-input"
        value={title}
        maxLength={SUGGESTION_TITLE_MAX}
        placeholder={t('suggestions.dialog.titlePlaceholder')}
        autoFocus
        disabled={busy}
        onChange={(e) => setTitle(e.target.value)}
      />
      <label className="sc-label" htmlFor="sg-description">
        {t('suggestions.dialog.descriptionLabel')}
        <span className="sc-counter">
          {description.length}/{SUGGESTION_DESCRIPTION_MAX}
        </span>
      </label>
      <textarea
        id="sg-description"
        className="sc-input"
        rows={4}
        value={description}
        maxLength={SUGGESTION_DESCRIPTION_MAX}
        placeholder={t('suggestions.dialog.descriptionPlaceholder')}
        disabled={busy}
        onChange={(e) => setDescription(e.target.value)}
      />
      {error && (
        <div className="sc-error" role="alert">
          {error}
        </div>
      )}
      <div className="sc-modal__actions">
        <button type="button" className="sc-btn" onClick={onClose} disabled={busy}>
          {t('suggestions.dialog.cancel')}
        </button>
        <button type="button" className="sc-btn sc-btn--primary" onClick={() => void submit()} disabled={!canSubmit}>
          {busy ? t('suggestions.dialog.sending') : t('suggestions.dialog.submit')}
        </button>
      </div>
    </Modal>
  );
}
