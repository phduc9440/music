import { useId, useState } from 'react';
import { t } from '../../i18n/core';
import { FORUM_BODY_MAX } from '../../types';
import Markdown from './Markdown';

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
}

/** Ô soạn Markdown có tab Soạn / Xem trước (xem trước dùng đúng bộ dựng của trang đọc nên thấy sao đăng vậy). */
export default function MarkdownEditor({ label, value, onChange, rows = 8, placeholder, disabled }: Props) {
  const id = useId();
  const [preview, setPreview] = useState(false);
  return (
    <div className="fm-editor">
      <div className="fm-editor__bar">
        <label className="sc-label" htmlFor={id}>
          {label}
        </label>
        <div className="fm-tabs" role="tablist" aria-label={t('forum.editor.mode')}>
          <button type="button" role="tab" aria-selected={!preview} className="fm-tab" onClick={() => setPreview(false)}>
            {t('forum.editor.write')}
          </button>
          <button type="button" role="tab" aria-selected={preview} className="fm-tab" onClick={() => setPreview(true)}>
            {t('forum.editor.preview')}
          </button>
        </div>
      </div>
      {preview ? (
        <div className="fm-editor__preview" style={{ minHeight: `${rows * 1.5}em` }}>
          {value.trim() ? <Markdown source={value} /> : <p className="fm-muted">{t('forum.editor.emptyPreview')}</p>}
        </div>
      ) : (
        <textarea
          id={id}
          className="sc-input"
          rows={rows}
          value={value}
          maxLength={FORUM_BODY_MAX}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      <div className="fm-editor__foot">
        <span className="fm-muted">{t('forum.editor.hint')}</span>
        <span className="sc-counter">
          {value.length}/{FORUM_BODY_MAX}
        </span>
      </div>
    </div>
  );
}
