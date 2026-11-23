import { useNavigate } from '../../../routes/useTransitionNavigate';
import { t } from '../../../i18n/core';

export type CreateAlternative = 'omr' | 'import' | 'blank';

const ROUTES: Record<CreateAlternative, string> = {
  omr: '/scores/upload',
  import: '/scores/import',
  blank: '/scores/blank',
};

/** Biểu tượng nét mảnh cho từng cách tạo: ảnh/PDF, file số, trang trắng. */
const Icon = ({ kind }: { kind: CreateAlternative }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
    {kind === 'omr' && (
      <path
        d="M4 7a2 2 0 0 1 2-2h2l1.5-2h5L16 5h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Zm8 9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        strokeLinejoin="round"
      />
    )}
    {kind === 'import' && (
      <path
        d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5M10 13l-2 2 2 2m4-4 2 2-2 2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    )}
    {kind === 'blank' && (
      <path
        d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5M12 11v6m-3-3h6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    )}
  </svg>
);

interface Props {
  options: CreateAlternative[];
  disabled?: boolean;
}

/**
 * Các cách tạo bản nhạc khác, đặt dưới vùng kéo-thả của trang tải lên / nhập file. Tách khỏi khối đầu trang để khối đó
 * chỉ còn tiêu đề, còn lựa chọn phụ nằm cạnh nội dung chính như một lối rẽ rõ ràng.
 */
export default function CreateAlternatives({ options, disabled }: Props) {
  const navigate = useNavigate();
  return (
    <nav className="sc-create-alt" aria-label={t('upload.alt.heading')}>
      <div className="sc-create-alt__divider">
        <span>{t('upload.alt.heading')}</span>
      </div>
      <div className="sc-create-alt__grid">
        {options.map((kind) => (
          <button
            key={kind}
            type="button"
            className="sc-create-alt__card"
            disabled={disabled}
            onClick={() => navigate(ROUTES[kind])}
          >
            <span className="sc-create-alt__icon">
              <Icon kind={kind} />
            </span>
            <span className="sc-create-alt__text">{t(`upload.alt.${kind}Title`)}</span>
            <svg
              className="sc-create-alt__arrow"
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ))}
      </div>
    </nav>
  );
}
