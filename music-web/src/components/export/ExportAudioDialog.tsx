import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { downloadFile, fetchFileBlob, taskApi } from '../../services';
import { exportApi } from '../../services/file/exportApi';
import type { AiTaskInfo } from '../../types';
import type { ExportFileInfo, ExportFormat, ExportHands, ExportOptions } from '../../types/export';
import Modal from '../scores/common/Modal';
import { clampTempoPercent, loadScoreSettings } from '../player/state/settings';
import { clampTranspose } from '../player/state/transposeRange';
import {
  DEFAULT_BITRATE,
  EXPORT_BITRATES,
  exportErrorMessage,
  exportFileName,
  handsFromMixer,
  isTaskFinished,
  translateTaskError,
  validateExportOptions,
} from './exportUtils';
import { reportPlanLimit } from '../../utils/planLimit';
import ExportRunningView from './ExportRunningView';
import { useExportTask } from './useExportTask';
import './export.css';

interface Props {
  scoreId: string;
  title: string;
  staffCount?: number | null;
  /** Định dạng đang mở hộp thoại; null là đóng (nhưng vẫn theo dõi tác vụ đang chạy). */
  format: ExportFormat | null;
  onClose: () => void;
}

const HAND_LABELS: Record<ExportHands, string> = { BOTH: 'Cả hai tay', RIGHT: 'Tay phải', LEFT: 'Tay trái' };

const formatSize = (bytes?: number | null): string =>
  bytes
    ? bytes >= 1048576
      ? `${(bytes / 1048576).toFixed(1)} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`
    : '';

/**
 * Hộp thoại "Xuất âm thanh" (MP3/WAV, mục 1.28). Component này luôn được gắn khi trang còn mở để vòng theo dõi tác vụ
 * không dừng khi người dùng đóng hộp thoại; khi tác vụ xong mà hộp thoại đang đóng thì hiện toast kèm nút Tải xuống.
 */
export default function ExportAudioDialog({ scoreId, title, staffCount, format, onClose }: Props) {
  const [result, setResult] = useState<ExportFileInfo | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const open = useRef(false);

  useEffect(() => {
    open.current = format !== null;
  });

  const notifyReady = (file: ExportFileInfo) => {
    const name = exportFileName(title, file.fileType as ExportFormat, file.options ?? {});
    toast.success(
      <span>
        File {file.fileType} đã sẵn sàng.{' '}
        <button
          className="ex-toast-btn"
          onClick={() => void downloadFile(file.downloadUrl, name).catch(() => toast.error('Không tải được file'))}
        >
          Tải xuống
        </button>
      </span>,
      { toastId: `export-${file.id}`, autoClose: 10000 },
    );
  };

  const handleFinished = async (finishedTask: AiTaskInfo) => {
    if (finishedTask.status === 'COMPLETED') {
      const fileId = (finishedTask.resultData as { fileId?: string } | null | undefined)?.fileId;
      try {
        const files = (await exportApi.list(scoreId)).data.result;
        const file = files.find((f) => f.id === fileId) ?? null;
        setResult(file);
        if (file && !open.current) notifyReady(file);
      } catch {
        if (!open.current) toast.error('Không lấy được file đã xuất');
      }
    } else if (finishedTask.status === 'FAILED' && !open.current) {
      toast.error(translateTaskError(finishedTask.errorMessage));
    }
  };

  const { task, track, reset } = useExportTask((finishedTask) => void handleFinished(finishedTask));

  const submit = async (target: ExportFormat, options: ExportOptions): Promise<string | null> => {
    try {
      const response = (await exportApi.create(scoreId, target, options)).data.result;
      if (response.cached && response.file) setResult(response.file);
      else if (response.task) track(response.task);
      return null;
    } catch (err) {
      reportPlanLimit(err);
      return exportErrorMessage(err);
    }
  };

  const cancel = async () => {
    if (!task) return;
    setCancelling(true);
    try {
      await taskApi.cancel(task.id);
      reset();
      toast.info('Đã hủy xuất file');
    } catch {
      toast.error('Không hủy được, tác vụ có thể đã xong');
    } finally {
      setCancelling(false);
    }
  };

  const again = () => {
    reset();
    setResult(null);
  };

  if (format === null) return null;

  const running = task !== null && !isTaskFinished(task.status);
  const failed = task !== null && (task.status === 'FAILED' || task.status === 'CANCELLED') && result === null;

  return (
    <Modal title="Xuất âm thanh" onClose={onClose}>
      {result ? (
        <ResultView key={result.id} file={result} title={title} onAgain={again} onClose={onClose} />
      ) : running ? (
        <ExportRunningView task={task} cancelling={cancelling} onCancel={() => void cancel()} onClose={onClose} />
      ) : failed ? (
        <div className="ex-body">
          <p className="ex-error" role="alert">
            {translateTaskError(task.errorMessage)}
          </p>
          <div className="sc-modal__actions">
            <button className="sc-btn" onClick={onClose}>
              Đóng
            </button>
            <button className="sc-btn sc-btn--primary" onClick={again}>
              Thử lại
            </button>
          </div>
        </div>
      ) : (
        <ExportForm
          scoreId={scoreId}
          staffCount={staffCount}
          initialFormat={format}
          onSubmit={submit}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------------------------------------ biểu mẫu

function ExportForm({
  scoreId,
  staffCount,
  initialFormat,
  onSubmit,
  onClose,
}: {
  scoreId: string;
  staffCount?: number | null;
  initialFormat: ExportFormat;
  onSubmit: (format: ExportFormat, options: ExportOptions) => Promise<string | null>;
  onClose: () => void;
}) {
  // Mặc định lấy từ cài đặt Player của bản nhạc này (tempo, chuyển giọng, Mute/Solo từng tay)
  const [initial] = useState(() => loadScoreSettings(scoreId));
  const canPickHand = staffCount === 2;
  const [format, setFormat] = useState<ExportFormat>(initialFormat);
  const [bitrate, setBitrate] = useState<number>(DEFAULT_BITRATE);
  const [tempo, setTempo] = useState(() => clampTempoPercent(initial.tempoPercent));
  const [transpose, setTranspose] = useState(() => clampTranspose(initial.transpose));
  const [hands, setHands] = useState<ExportHands>(() => handsFromMixer(initial.mixer, staffCount));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const options: ExportOptions = {
      ...(format === 'MP3' ? { bitrate } : {}),
      tempoPercent: tempo,
      transpose,
      hands: canPickHand ? hands : 'BOTH',
    };
    const invalid = validateExportOptions(format, options, staffCount);
    if (invalid) return setError(invalid);
    setBusy(true);
    setError(null);
    const message = await onSubmit(format, options);
    // Thành công thì hộp thoại chuyển sang màn hình tiến độ/kết quả nên biểu mẫu bị gỡ khỏi cây
    setBusy(false);
    if (message) setError(message);
  };

  return (
    <div className="ex-body">
      <p className="ex-hint">Mặc định lấy theo cài đặt đang dùng trong trình phát của bản nhạc này.</p>

      <span className="sc-label">Định dạng</span>
      <div className="ex-segment" role="group" aria-label="Định dạng">
        {(['MP3', 'WAV'] as const).map((f) => (
          <button key={f} type="button" aria-pressed={format === f} onClick={() => setFormat(f)}>
            {f}
          </button>
        ))}
      </div>

      {format === 'MP3' && (
        <>
          <label className="sc-label" htmlFor="ex-bitrate">
            Chất lượng
          </label>
          <select
            id="ex-bitrate"
            className="sc-input"
            value={bitrate}
            onChange={(e) => setBitrate(Number(e.target.value))}
          >
            {EXPORT_BITRATES.map((b) => (
              <option key={b} value={b}>
                {b} kbps
              </option>
            ))}
          </select>
        </>
      )}

      <label className="sc-label" htmlFor="ex-tempo">
        Tempo: <strong>{tempo}%</strong>
      </label>
      <input
        id="ex-tempo"
        className="ex-range"
        type="range"
        min={20}
        max={200}
        step={5}
        value={tempo}
        onChange={(e) => setTempo(clampTempoPercent(Number(e.target.value)))}
      />

      <label className="sc-label" htmlFor="ex-transpose">
        Chuyển giọng: <strong>{transpose > 0 ? `+${transpose}` : transpose} nửa cung</strong>
      </label>
      <input
        id="ex-transpose"
        className="ex-range"
        type="range"
        min={-12}
        max={12}
        step={1}
        value={transpose}
        onChange={(e) => setTranspose(clampTranspose(Number(e.target.value)))}
      />

      {canPickHand && (
        <>
          <span className="sc-label">Tay</span>
          <div className="ex-segment" role="group" aria-label="Tay">
            {(Object.keys(HAND_LABELS) as ExportHands[]).map((h) => (
              <button key={h} type="button" aria-pressed={hands === h} onClick={() => setHands(h)}>
                {HAND_LABELS[h]}
              </button>
            ))}
          </div>
        </>
      )}

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
          {busy ? 'Đang gửi...' : 'Xuất file'}
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ kết quả

function ResultView({
  file,
  title,
  onAgain,
  onClose,
}: {
  file: ExportFileInfo;
  title: string;
  onAgain: () => void;
  onClose: () => void;
}) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const name = exportFileName(title, file.fileType as ExportFormat, file.options ?? {});

  // Tải file về dạng blob để nghe thử (API cần cookie đăng nhập nên không gắn thẳng URL vào thẻ audio được)
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | undefined;
    fetchFileBlob(file.downloadUrl)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setAudioUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setPreviewFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
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
      <p className="ex-ok">File {file.fileType} đã sẵn sàng.</p>
      <p className="ex-hint">
        {name} {formatSize(file.sizeBytes) && `· ${formatSize(file.sizeBytes)}`}
      </p>
      {audioUrl ? (
        <audio className="ex-audio" controls src={audioUrl} />
      ) : previewFailed ? (
        <p className="ex-hint">Không nghe thử được, bạn vẫn có thể tải về.</p>
      ) : (
        <p className="ex-hint">Đang tải để nghe thử...</p>
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
