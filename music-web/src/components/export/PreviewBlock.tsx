import type { PreviewState } from './local/useClickPreview';
import { t } from '../../i18n/core';

interface Props {
  state: PreviewState;
  url: string | null;
  kind: 'image' | 'audio';
  /** Chữ thay thế của ảnh xem trước. */
  alt?: string;
  /** Dòng nhỏ dưới bản xem trước, ví dụ số trang. */
  note?: string | null;
}

/** Vùng hiện bản xem trước (ảnh trang 1 hoặc đoạn nghe thử) sau khi bấm nút Xem trước / Nghe thử. */
export default function PreviewBlock({ state, url, kind, alt, note }: Props) {
  if (state === 'idle') return null;
  if (state === 'failed')
    return (
      <p className="ex-hint" role="status">
        {t('export.preview.failed')}
      </p>
    );
  if (state === 'loading' || !url)
    return (
      <p className="ex-hint" role="status">
        {kind === 'audio' ? t('export.preview.rendering') : t('export.preview.loading')}
      </p>
    );
  return (
    <>
      {kind === 'audio' ? (
        <audio className="ex-audio" controls autoPlay src={url} />
      ) : (
        <img className="ex-preview" src={url} alt={alt ?? ''} />
      )}
      {note && <p className="ex-hint">{note}</p>}
    </>
  );
}
