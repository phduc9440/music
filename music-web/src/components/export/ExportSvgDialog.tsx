import { useState } from 'react';
import { toast } from 'react-toastify';
import { downloadFile } from '../../services';
import { exportApi } from '../../services/exportApi';
import type { ExportFileInfo, SvgOptions } from '../../types/export';
import Modal from '../scores/Modal';
import ExportRunningView from './ExportRunningView';
import { translateTaskError } from './exportUtils';
import { useExportFlow } from './useExportFlow';
import './export.css';

interface Props {
  scoreId: string;
  title: string;
  /** Hộp thoại đang mở; đóng thì vẫn theo dõi tác vụ đang chạy. */
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}

/**
 * Hộp thoại "Xuất SVG" (mục 1.29): tải mọi trang trong một file ZIP hoặc chỉ một trang. Tác vụ luôn kết xuất mọi trang,
 * trang cần tải chỉ là lựa chọn của người dùng nên không làm đổi kết quả đã lưu.
 */
export default function ExportSvgDialog({ scoreId, title, open, onOpen, onClose }: Props) {
  const flow = useExportFlow({ scoreId, isOpen: open, readyMessage: 'File SVG đã sẵn sàng.', reopen: onOpen });
  /** Trang người dùng đã chọn lúc gửi yêu cầu (null là tất cả); dùng để chọn nút tải chính ở màn hình kết quả. */
  const [wantedPage, setWantedPage] = useState<number | null>(null);
  if (!open) return null;

  const files = flow.results;
  return (
    <Modal title="Xuất SVG" onClose={onClose}>
      {files && files.length > 0 ? (
        <SvgResultView
          files={files}
          scoreId={scoreId}
          title={title}
          wantedPage={wantedPage}
          onAgain={flow.again}
          onClose={onClose}
        />
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
        <SvgForm
          onSubmit={(options) => {
            setWantedPage(options.page === 'ALL' ? null : options.page);
            return flow.submit('SVG', options);
          }}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}

function SvgForm({
  onSubmit,
  onClose,
}: {
  onSubmit: (options: SvgOptions) => Promise<string | null>;
  onClose: () => void;
}) {
  const [all, setAll] = useState(true);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!all && (!Number.isInteger(page) || page < 1)) return setError('Số trang phải từ 1 trở lên');
    setBusy(true);
    setError(null);
    const message = await onSubmit({ page: all ? 'ALL' : page });
    setBusy(false);
    if (message) setError(all ? message : `${message}. Kiểm tra lại số trang, bản nhạc có thể ít trang hơn.`);
  };

  return (
    <div className="ex-body">
      <p className="ex-hint">
        SVG là ảnh vector, mỗi trang nhạc một file. Bạn có thể tải tất cả trang trong một file ZIP.
      </p>
      <label className="ex-radio">
        <input type="radio" name="svg-scope" checked={all} onChange={() => setAll(true)} />
        Tất cả trang (tải ZIP)
      </label>
      <label className="ex-radio">
        <input type="radio" name="svg-scope" checked={!all} onChange={() => setAll(false)} />
        Một trang, số
        <input
          className="sc-input"
          type="number"
          min={1}
          step={1}
          value={page}
          disabled={all}
          aria-label="Số trang"
          onChange={(e) => setPage(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
        />
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
          {busy ? 'Đang gửi...' : 'Xuất SVG'}
        </button>
      </div>
    </div>
  );
}

function SvgResultView({
  files,
  scoreId,
  title,
  wantedPage,
  onAgain,
  onClose,
}: {
  files: ExportFileInfo[];
  scoreId: string;
  title: string;
  wantedPage: number | null;
  onAgain: () => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const taskId = files[0].taskId;
  const wanted = wantedPage === null ? undefined : files.find((f) => f.pageNumber === wantedPage);
  const tooFar = wantedPage !== null && !wanted;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch {
      toast.error('Không tải được file');
    } finally {
      setBusy(false);
    }
  };
  const downloadZip = () =>
    run(() => exportApi.downloadSvgZip(scoreId, taskId ?? '', `${title.replace(/[\\/:*?"<>|]/g, ' ').trim()}-svg.zip`));
  const downloadPage = (file: ExportFileInfo) =>
    run(() => downloadFile(file.downloadUrl, file.originalFileName || `trang-${file.pageNumber ?? 1}.svg`));

  return (
    <div className="ex-body">
      <p className="ex-ok">Đã xuất {files.length} trang SVG.</p>
      {tooFar && (
        <p className="ex-error" role="alert">
          Bản nhạc chỉ có {files.length} trang nên không có trang {wantedPage}.
        </p>
      )}
      <div className="ex-pages" aria-label="Các trang">
        {files.map((file) => (
          <button key={file.id} className="sc-btn sc-btn--sm" disabled={busy} onClick={() => void downloadPage(file)}>
            Trang {file.pageNumber ?? '?'}
          </button>
        ))}
      </div>
      <div className="sc-modal__actions">
        <button className="sc-btn" onClick={onAgain}>
          Xuất lại
        </button>
        <button className="sc-btn" onClick={onClose}>
          Đóng
        </button>
        {wanted ? (
          <button className="sc-btn sc-btn--primary" disabled={busy} onClick={() => void downloadPage(wanted)}>
            Tải trang {wantedPage}
          </button>
        ) : (
          <button className="sc-btn sc-btn--primary" disabled={busy || !taskId} onClick={() => void downloadZip()}>
            {busy ? 'Đang tải...' : `Tải ZIP (${files.length} trang)`}
          </button>
        )}
      </div>
    </div>
  );
}
