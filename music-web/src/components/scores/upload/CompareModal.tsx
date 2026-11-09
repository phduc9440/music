import { useEffect, useRef, useState } from 'react';
import { fetchFileBlob } from '../../services';
import { renderPdfPageToUrl } from '../../utils/pdfRender';
import { useOverlayClose } from './useOverlayClose';

interface Props {
  /** Số trang đang xem (bắt đầu từ 1). */
  pageNumber: number;
  /** Link tải ảnh trang đã xử lý (PNG). */
  processedUrl: string;
  /** Link tải file gốc của trang này: ảnh gốc, hoặc cả file PDF. Không có thì chỉ xem ảnh đã xử lý. */
  originalUrl?: string;
  /** File gốc là PDF (cần vẽ đúng trang bằng pdf.js). */
  originalIsPdf: boolean;
  onClose: () => void;
}

type Loaded = { processed: string; original: string | null };

/**
 * Hộp thoại so sánh ảnh gốc (trái) và ảnh đã xử lý (phải) bằng thanh kéo.
 * Ảnh được tải kèm token rồi tạo object URL; object URL được giải phóng khi đóng.
 */
export default function CompareModal({ pageNumber, processedUrl, originalUrl, originalIsPdf, onClose }: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  // Vị trí đường chia theo %: bên trái đường chia là ảnh gốc, bên phải là ảnh đã xử lý
  const [split, setSplit] = useState(50);
  const overlayProps = useOverlayClose(onClose);
  const closeButton = useRef<HTMLButtonElement>(null);

  // Đưa focus vào hộp thoại khi mở để người dùng bàn phím đóng bằng Esc/Enter được ngay
  useEffect(() => closeButton.current?.focus(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    (async () => {
      try {
        const processed = URL.createObjectURL(await fetchFileBlob(processedUrl));
        urls.push(processed);
        let original: string | null = null;
        if (originalUrl) {
          try {
            const blob = await fetchFileBlob(originalUrl);
            original = originalIsPdf ? await renderPdfPageToUrl(blob, pageNumber) : URL.createObjectURL(blob);
            urls.push(original);
          } catch {
            original = null; // Không có ảnh gốc thì vẫn xem được ảnh đã xử lý
          }
        }
        if (!cancelled) setLoaded({ processed, original });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [processedUrl, originalUrl, originalIsPdf, pageNumber]);

  const canCompare = loaded?.original != null;

  return (
    <div className="sc-modal-overlay" {...overlayProps}>
      <div
        className="sc-modal sp-compare"
        role="dialog"
        aria-modal="true"
        aria-label={`So sánh trang ${pageNumber}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sc-modal__header">
          <h3>So sánh trang {pageNumber}</h3>
          <button ref={closeButton} className="sc-icon-btn" onClick={onClose} aria-label="Đóng">
            ×
          </button>
        </div>

        {failed && <div className="sc-error">Không tải được ảnh trang này</div>}
        {!failed && !loaded && <div className="sp-compare__loading">Đang tải ảnh...</div>}

        {loaded && (
          <>
            <div className="sp-compare__labels">
              <span>{canCompare ? 'Ảnh gốc' : ''}</span>
              <span>Sau xử lý</span>
            </div>
            <div className="sp-compare__stage">
              <img className="sp-compare__img" src={loaded.processed} alt={`Trang ${pageNumber} sau xử lý`} />
              {canCompare && (
                <>
                  <img
                    className="sp-compare__img sp-compare__img--top"
                    src={loaded.original ?? ''}
                    alt={`Trang ${pageNumber} ảnh gốc`}
                    style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
                  />
                  <span className="sp-compare__line" style={{ left: `${split}%` }} aria-hidden="true" />
                  <input
                    className="sp-compare__range"
                    type="range"
                    min={0}
                    max={100}
                    value={split}
                    onChange={(e) => setSplit(Number(e.target.value))}
                    aria-label="Kéo để so sánh ảnh gốc và ảnh đã xử lý"
                  />
                </>
              )}
            </div>
            {!canCompare && <p className="sp-compare__note">Không còn ảnh gốc để so sánh, đang hiện ảnh đã xử lý.</p>}
          </>
        )}
      </div>
    </div>
  );
}
