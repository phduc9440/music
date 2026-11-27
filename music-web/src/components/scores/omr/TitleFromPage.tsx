import { useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'react-toastify';
import { scoreApi } from '../../../services';
import { MAX_COMPOSER, MAX_TITLE, UNTITLED_TITLE, getErrorMessage } from '../../../utils/score';
import type { ScoreDetail } from '../../../types';
import AuthImage from '../common/AuthImage';
import { t } from '../../../i18n/core';
import './titleFromPage.css';

interface Props {
  score: ScoreDetail;
  /** Ảnh trang 1 đã xử lý (PNG); không có thì không hiện khung. */
  pageUrl?: string | null;
  /** Tên bài, tác giả đọc từ lớp chữ của PDF xuất từ phần mềm chép nhạc (OmrResult.pageText); không có với ảnh/PDF scan. */
  suggested?: { title?: string | null; composer?: string | null } | null;
  onSaved: (updated: ScoreDetail) => void;
}

/**
 * T46: đặt tên bài ngay ở trang Kết quả, nhìn phần đầu trang 1 của ảnh gốc (thường in tên bài và tác giả, ví dụ
 * "Bèo dạt mây trôi · Dân ca Việt Nam"). Tên lấy từ file ảnh thường vô nghĩa hoặc là "Untitled" (T37).
 */
export default function TitleFromPage({ score, pageUrl, suggested, onSaved }: Props) {
  const suggestedTitle = suggested?.title?.trim().slice(0, MAX_TITLE) ?? '';
  const suggestedComposer = suggested?.composer?.trim().slice(0, MAX_COMPOSER) ?? '';
  // Bài chưa có tên thật (Untitled) mà PDF có tên in sẵn: điền luôn, người dùng chỉ cần bấm Lưu
  const untitled = score.title === UNTITLED_TITLE;
  const [title, setTitle] = useState(untitled ? suggestedTitle : score.title);
  const [composer, setComposer] = useState(score.composer || (untitled ? suggestedComposer : ''));
  const [saving, setSaving] = useState(false);
  if (!score.canEdit || !pageUrl) return null;

  const trimmed = title.trim();
  const changed = trimmed !== score.title || composer.trim() !== (score.composer ?? '');
  const canSuggest =
    !!suggestedTitle && (suggestedTitle !== trimmed || (!!suggestedComposer && suggestedComposer !== composer.trim()));
  const useSuggestion = () => {
    setTitle(suggestedTitle);
    if (suggestedComposer) setComposer(suggestedComposer);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!trimmed || !changed || saving) return;
    setSaving(true);
    try {
      const res = await scoreApi.update(score.id, { title: trimmed, composer: composer.trim() });
      onSaved(res.data.result);
      toast.success(t('upload.titleFromPage.saved'));
    } catch (err) {
      toast.error(getErrorMessage(err, t('upload.titleFromPage.failed')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="tfp" aria-label={t('upload.titleFromPage.label')}>
      <figure className="tfp__crop">
        <AuthImage src={pageUrl} alt={t('upload.titleFromPage.cropAlt')} className="tfp__img" />
        <figcaption>{t('upload.titleFromPage.caption')}</figcaption>
      </figure>
      <form className="tfp__form" onSubmit={(e) => void submit(e)}>
        {suggestedTitle && (
          <p className="tfp__suggest">
            <span>
              {t('upload.titleFromPage.fromPdf')}{' '}
              <strong>{suggestedTitle}</strong>
              {suggestedComposer ? ` · ${suggestedComposer}` : ''}
            </span>
            {canSuggest && (
              <button type="button" className="sc-btn sc-btn--sm" onClick={useSuggestion}>
                {t('upload.titleFromPage.useSuggestion')}
              </button>
            )}
          </p>
        )}
        <label className="sc-label" htmlFor="tfp-title">
          {t('scores.edit.scoreTitle')}
          <span className="sc-counter">
            {title.length}/{MAX_TITLE}
          </span>
        </label>
        <input
          id="tfp-title"
          className="sc-input"
          value={title}
          maxLength={MAX_TITLE}
          placeholder={t('upload.titleFromPage.placeholder')}
          onChange={(e) => setTitle(e.target.value)}
        />
        <label className="sc-label" htmlFor="tfp-composer">
          {t('scores.edit.composer')}
        </label>
        <input
          id="tfp-composer"
          className="sc-input"
          value={composer}
          maxLength={MAX_COMPOSER}
          onChange={(e) => setComposer(e.target.value)}
        />
        <button type="submit" className="sc-btn sc-btn--primary sc-btn--sm" disabled={!trimmed || !changed || saving}>
          {saving ? t('upload.titleFromPage.saving') : t('upload.titleFromPage.save')}
        </button>
      </form>
    </section>
  );
}
