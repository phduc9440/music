import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { downloadFile, fetchFileBlob } from '../../services';
import type { ExportFileInfo, MeasureNumbers, PdfOptions, PdfOrientation, PdfPageSize } from '../../types/export';
import { renderPdfPageToUrl } from '../../utils/pdfRender';
import Modal from '../scores/common/Modal';
import ExportRunningView from './ExportRunningView';
import { translateTaskError, validatePdfOptions } from './exportUtils';
import { useExportFlow } from './useExportFlow';
import './export.css';

interface Props {
  scoreId: string;
  /** Hộp thoại đang mở; đóng thì vẫn theo dõi tác vụ đang chạy. */
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}

const DEFAULT_OPTIONS: PdfOptions = {
  pageSize: 'A4',
  orientation: 'PORTRAIT',
  staffSpaceMm: 1.75,
  marginMm: 15,
  showTitle: true,
  measureNumbers: 'SYSTEM',
  showChords: true,
};

const MEASURE_NUMBER_LABELS: Record<MeasureNumbers, string> = {
  SYSTEM: 'Đầu mỗi hàng nhạc',
  EVERY: 'Mọi ô nhịp',
  NONE: 'Không đánh số',
};

/**
 * Hộp thoại "Xuất PDF" (mục 1.30): chọn khổ giấy, hướng, cỡ khuông, lề, tiêu đề, đánh số ô nhịp, hợp âm; chạy nền;
 * xong thì xem trước trang 1 và tải về. Luôn được gắn khi trang còn mở để đóng hộp thoại không dừng theo dõi tác vụ.
 */
export default function ExportPdfDialog({ scoreId, open, onOpen, onClose }: Props) {
  const flow = useExportFlow({ scoreId, isOpen: open, readyMessage: 'File PDF đã sẵn sàng.', reopen: onOpen });
  if (!open) return null;

  const file = flow.results?.[0] ?? null;
  return (
    <Modal title="Xuất PDF" onClose={onClose}>
      {file ? (
        <PdfResultView key={file.id} file={file} onAgain={flow.again} onClose={onClose} />
      ) : flow.running && flow.task ? (
        <ExportRunningView
          task={flow.task}
          cancelling={flow.cancelling}
          onCancel={() => void flow.cancel()}
          onClose={onClose}
        />
      ) : flow.failed && flow.task ? (
        <div className="ex-body">
          <p className="ex-error" role="alert">
            {translateTaskError(flow.task.errorMessage)}
          </p>
          <div className="sc-modal__actions">
            <button className="sc-btn" onClick={onClose}>
              Đóng
            </button>
            <button className="sc-btn sc-btn--primary" onClick={flow.again}>
              Thử lại
            </button>
          </div>
        </div>
      ) : (
        <PdfForm onSubmit={(options) => flow.submit('PDF', options)} onClose={onClose} />
      )}
    </Modal>
  );
}

function PdfForm({
  onSubmit,
  onClose,
}: {
  onSubmit: (options: PdfOptions) => Promise<string | null>;
  onClose: () => void;
}) {
  const [options, setOptions] = useState<PdfOptions>(DEFAULT_OPTIONS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const patch = (change: Partial<PdfOptions>) => setOptions((prev) => ({ ...prev, ...change }));

  const submit = async () => {
    const invalid = validatePdfOptions(options);
    if (invalid) return setError(invalid);
    setBusy(true);
    setError(null);
    const message = await onSubmit(options);
    // Thành công thì hộp thoại chuyển sang tiến độ/kết quả nên biểu mẫu bị gỡ khỏi cây
    setBusy(false);
    if (message) setError(message);
  };

  return (
    <div className="ex-body">
      <span className="sc-label">Khổ giấy</span>
      <div className="ex-segment" role="group" aria-label="Khổ giấy">
        {(['A4', 'LETTER'] as PdfPageSize[]).map((size) => (
          <button
            key={size}
            type="button"
            aria-pressed={options.pageSize === size}
            onClick={() => patch({ pageSize: size })}
          >
            {size === 'A4' ? 'A4' : 'Letter'}
          </button>
        ))}
      </div>

      <span className="sc-label">Hướng giấy</span>
      <div className="ex-segment" role="group" aria-label="Hướng giấy">
        {(['PORTRAIT', 'LANDSCAPE'] as PdfOrientation[]).map((orientation) => (
          <button
            key={orientation}
            type="button"
            aria-pressed={options.orientation === orientation}
            onClick={() => patch({ orientation })}
          >
            {orientation === 'PORTRAIT' ? 'Dọc' : 'Ngang'}
          </button>
        ))}
      </div>

      <label className="sc-label" htmlFor="ex-staff">
        Cỡ khuông nhạc: <strong>{options.staffSpaceMm.toFixed(2)} mm</strong>
      </label>
      <input
        id="ex-staff"
        className="ex-range"
        type="range"
        min={1.5}
        max={2.2}
        step={0.05}
        value={options.staffSpaceMm}
        onChange={(e) => patch({ staffSpaceMm: Math.round(Number(e.target.value) * 100) / 100 })}
      />

      <label className="sc-label" htmlFor="ex-margin">
        Lề: <strong>{options.marginMm} mm</strong>
      </label>
      <input
        id="ex-margin"
        className="ex-range"
        type="range"
        min={10}
        max={25}
        step={1}
        value={options.marginMm}
        onChange={(e) => patch({ marginMm: Math.round(Number(e.target.value)) })}
      />

      <label className="sc-label" htmlFor="ex-measures">
        Đánh số ô nhịp
      </label>
      <select
        id="ex-measures"
        className="sc-input"
        value={options.measureNumbers}
        onChange={(e) => patch({ measureNumbers: e.target.value as MeasureNumbers })}
      >
        {(Object.keys(MEASURE_NUMBER_LABELS) as MeasureNumbers[]).map((value) => (
          <option key={value} value={value}>
            {MEASURE_NUMBER_LABELS[value]}
          </option>
        ))}
      </select>

      <label className="ex-check">
        <input type="checkbox" checked={options.showTitle} onChange={(e) => patch({ showTitle: e.target.checked })} />
        Hiện tiêu đề và tác giả
      </label>
      <label className="ex-check">
        <input type="checkbox" checked={options.showChords} onChange={(e) => patch({ showChords: e.target.checked })} />
        Hiện hợp âm
      </label>

      {error && (
        <p className="ex-error" role="alert">
          {error}
        </p>
      )}
      <div className="sc-modal__actions">
        <button className="sc-btn" onClick={onClose} disabled={busy}>
          Hủy
        </button>
        <button className="sc-btn sc-btn--primary" onClick={() => void submit()} disabled={busy}>
          {busy ? 'Đang gửi...' : 'Xuất PDF'}
        </button>
      </div>
    </div>
  );
}

function PdfResultView({ file, onAgain, onClose }: { file: ExportFileInfo; onAgain: () => void; onClose: () => void }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const name = file.originalFileName || 'ban-nhac.pdf';

  // Tải PDF về dạng blob rồi vẽ trang 1 bằng pdf.js làm ảnh xem trước (API cần cookie đăng nhập)
  useEffect(() => {
    let cancelled = false;
    let url: string | undefined;
    fetchFileBlob(file.downloadUrl)
      .then((blob) => renderPdfPageToUrl(blob, 1, 700))
      .then((made) => {
        if (cancelled) return URL.revokeObjectURL(made);
        url = made;
        setPreviewUrl(made);
      })
      .catch(() => {
        if (!cancelled) setPreviewFailed(true);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file.downloadUrl]);

  const download = async () => {
    setDownloading(true);
    try {
      await downloadFile(file.downloadUrl, name);
    } catch {
      toast.error('Không tải được file');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="ex-body">
      <p className="ex-ok">File PDF đã sẵn sàng.</p>
      {previewUrl ? (
        <img className="ex-preview" src={previewUrl} alt="Xem trước trang 1 của file PDF" />
      ) : previewFailed ? (
        <p className="ex-hint">Không xem trước được, bạn vẫn có thể tải về.</p>
      ) : (
        <p className="ex-hint">Đang dựng bản xem trước trang 1...</p>
      )}
      <div className="sc-modal__actions">
        <button className="sc-btn" onClick={onAgain}>
          Xuất với tùy chọn khác
        </button>
        <button className="sc-btn" onClick={onClose}>
          Đóng
        </button>
        <button className="sc-btn sc-btn--primary" onClick={() => void download()} disabled={downloading}>
          {downloading ? 'Đang tải...' : 'Tải xuống'}
        </button>
      </div>
    </div>
  );
}
