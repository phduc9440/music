import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { downloadFile, fetchFileBlob, saveBlob } from '../../services';
import type { ExportFileInfo, MeasureNumbers, PdfOptions, PdfOrientation, PdfPageSize } from '../../types/export';
import { renderPdfPageToUrl } from '../../utils/pdfRender';
import { scoreDownloadName } from '../../utils/score';
import Modal from '../scores/common/Modal';
import ExportRunningView from './ExportRunningView';
import { translateTaskError, validatePdfOptions } from './exportUtils';
import { useExportFlow } from './useExportFlow';
import PreviewBlock from './PreviewBlock';
import { useClickPreview } from './local/useClickPreview';
import { loadScoreXml, makeLocalPdf, previewFirstPage, safeBaseName, svgBlob } from './local/localExport';
import type { LocalPdf } from './local/localExport';
import { t } from '../../i18n/core';
import './export.css';

interface Props {
  scoreId: string;
  /** Tên bản nhạc, dùng đặt tên file PDF tải về (T37). */
  title: string;
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

const MEASURE_NUMBERS: MeasureNumbers[] = ['SYSTEM', 'EVERY', 'NONE'];

/**
 * Hộp thoại "Xuất PDF" (mục 1.30): chọn khổ giấy, hướng, cỡ khuông, lề, tiêu đề, đánh số ô nhịp, hợp âm; chạy nền;
 * xong thì bấm để xem trước trang 1 rồi tải về. Máy chủ chưa cài MuseScore thì tạo PDF ngay trên trình duyệt. Luôn được
 * gắn khi trang còn mở để đóng hộp thoại không dừng theo dõi tác vụ.
 */
export default function ExportPdfDialog({ scoreId, title, open, onOpen, onClose }: Props) {
  const flow = useExportFlow({ scoreId, isOpen: open, readyMessage: t('export.pdf.ready'), reopen: onOpen });
  /** Tùy chọn của lần xuất đang làm trên trình duyệt (máy chủ chưa cài MuseScore). */
  const [local, setLocal] = useState<PdfOptions | null>(null);
  // Đóng hộp thoại thì bỏ kết quả tạo trên trình duyệt (không có tác vụ nền nào để theo dõi)
  const close = () => {
    setLocal(null);
    onClose();
  };
  if (!open) return null;

  const file = flow.results?.[0] ?? null;
  return (
    <Modal title={t('export.pdf.title')} onClose={close}>
      {local ? (
        <LocalPdfView
          key={JSON.stringify(local)}
          scoreId={scoreId}
          title={title}
          options={local}
          onAgain={() => setLocal(null)}
          onClose={close}
        />
      ) : file ? (
        <PdfResultView key={file.id} file={file} title={title} onAgain={flow.again} onClose={close} />
      ) : flow.running && flow.task ? (
        <ExportRunningView
          task={flow.task}
          cancelling={flow.cancelling}
          onCancel={() => void flow.cancel()}
          onClose={close}
        />
      ) : flow.failed && flow.task ? (
        <div className="ex-body">
          <p className="ex-error" role="alert">
            {translateTaskError(flow.task.errorMessage)}
          </p>
          <div className="sc-modal__actions">
            <button className="sc-btn" onClick={onClose}>
              {t('common.close')}
            </button>
            <button className="sc-btn sc-btn--primary" onClick={flow.again}>
              {t('common.retry')}
            </button>
          </div>
        </div>
      ) : (
        <PdfForm
          scoreId={scoreId}
          title={title}
          onSubmit={(options) => flow.submit('PDF', options, () => setLocal(options))}
          onClose={close}
        />
      )}
    </Modal>
  );
}

function PdfForm({
  scoreId,
  title,
  onSubmit,
  onClose,
}: {
  scoreId: string;
  title: string;
  onSubmit: (options: PdfOptions) => Promise<string | null>;
  onClose: () => void;
}) {
  const [options, setOptions] = useState<PdfOptions>(DEFAULT_OPTIONS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<number | null>(null);
  const patch = (change: Partial<PdfOptions>) => setOptions((prev) => ({ ...prev, ...change }));
  // Xem trước trang 1 theo tùy chọn đang chọn: chỉ dựng khi bấm, đang mở thì đổi tùy chọn sẽ dựng lại
  const preview = useClickPreview(async () => {
    const made = await previewFirstPage(await loadScoreXml(scoreId), options, { title });
    setPages(made.pages);
    return svgBlob(made.svg);
  }, JSON.stringify(options));

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
      <span className="sc-label">{t('export.pdf.paper')}</span>
      <div className="ex-segment" role="group" aria-label={t('export.pdf.paper')}>
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

      <span className="sc-label">{t('export.pdf.orientation')}</span>
      <div className="ex-segment" role="group" aria-label={t('export.pdf.orientation')}>
        {(['PORTRAIT', 'LANDSCAPE'] as PdfOrientation[]).map((orientation) => (
          <button
            key={orientation}
            type="button"
            aria-pressed={options.orientation === orientation}
            onClick={() => patch({ orientation })}
          >
            {t(`export.pdf.${orientation}`)}
          </button>
        ))}
      </div>

      <label className="sc-label" htmlFor="ex-staff">
        {t('export.pdf.staffSize')}: <strong>{options.staffSpaceMm.toFixed(2)} mm</strong>
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
        {t('export.pdf.margin')}: <strong>{options.marginMm} mm</strong>
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
        {t('export.pdf.measureNumbers')}
      </label>
      <select
        id="ex-measures"
        className="sc-input"
        value={options.measureNumbers}
        onChange={(e) => patch({ measureNumbers: e.target.value as MeasureNumbers })}
      >
        {MEASURE_NUMBERS.map((value) => (
          <option key={value} value={value}>
            {t(`export.pdf.numbering.${value}`)}
          </option>
        ))}
      </select>

      <label className="ex-check">
        <input type="checkbox" checked={options.showTitle} onChange={(e) => patch({ showTitle: e.target.checked })} />
        {t('export.pdf.showTitle')}
      </label>
      <label className="ex-check">
        <input type="checkbox" checked={options.showChords} onChange={(e) => patch({ showChords: e.target.checked })} />
        {t('export.pdf.showChords')}
      </label>

      <PreviewBlock
        state={preview.state}
        url={preview.url}
        kind="image"
        alt={t('export.pdf.previewAlt')}
        note={pages ? t('export.preview.pages', { count: pages }) : null}
      />
      {error && (
        <p className="ex-error" role="alert">
          {error}
        </p>
      )}
      <div className="sc-modal__actions">
        <button className="sc-btn" onClick={onClose} disabled={busy}>
          {t('common.cancel')}
        </button>
        <button className="sc-btn" onClick={preview.toggle} aria-pressed={preview.state !== 'idle'}>
          {preview.state === 'idle' ? t('export.preview.show') : t('export.preview.hide')}
        </button>
        <button className="sc-btn sc-btn--primary" onClick={() => void submit()} disabled={busy}>
          {busy ? t('export.sending') : t('export.pdf.submit')}
        </button>
      </div>
    </div>
  );
}

function PdfResultView({
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
  const [downloading, setDownloading] = useState(false);
  const name = scoreDownloadName(title, file, 'pdf');
  // Bấm "Xem trước" mới tải PDF về dạng blob rồi vẽ trang 1 bằng pdf.js (API cần cookie đăng nhập)
  const preview = useClickPreview(async () => renderPdfPageToUrl(await fetchFileBlob(file.downloadUrl), 1, 700));

  const download = async () => {
    setDownloading(true);
    try {
      await downloadFile(file.downloadUrl, name);
    } catch {
      toast.error(t('export.downloadFailed'));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="ex-body">
      <p className="ex-ok">{t('export.pdf.ready')}</p>
      <PreviewBlock state={preview.state} url={preview.url} kind="image" alt={t('export.pdf.previewAlt')} />
      <div className="sc-modal__actions">
        <button className="sc-btn" onClick={onAgain}>
          {t('export.again')}
        </button>
        <button className="sc-btn" onClick={onClose}>
          {t('common.close')}
        </button>
        <button className="sc-btn" onClick={preview.toggle} aria-pressed={preview.state !== 'idle'}>
          {preview.state === 'idle' ? t('export.preview.show') : t('export.preview.hide')}
        </button>
        <button className="sc-btn sc-btn--primary" onClick={() => void download()} disabled={downloading}>
          {downloading ? t('export.downloading') : t('export.download')}
        </button>
      </div>
    </div>
  );
}

/** Tạo PDF ngay trên trình duyệt (máy chủ chưa cài MuseScore), báo tiến độ theo trang, xong thì xem trước / tải về. */
function LocalPdfView({
  scoreId,
  title,
  options,
  onAgain,
  onClose,
}: {
  scoreId: string;
  title: string;
  options: PdfOptions;
  onAgain: () => void;
  onClose: () => void;
}) {
  const [result, setResult] = useState<LocalPdf | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const preview = useClickPreview(async () => svgBlob(result?.firstPage ?? ''));

  useEffect(() => {
    let cancelled = false;
    loadScoreXml(scoreId)
      .then((xml) =>
        makeLocalPdf(xml, options, { title }, title, (done, total) => !cancelled && setProgress({ done, total })),
      )
      .then((made) => !cancelled && setResult(made))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [scoreId, title, options, attempt]);

  if (failed)
    return (
      <div className="ex-body">
        <p className="ex-error" role="alert">
          {t('export.local.failed')}
        </p>
        <div className="sc-modal__actions">
          <button className="sc-btn" onClick={onClose}>
            {t('common.close')}
          </button>
          <button
            className="sc-btn sc-btn--primary"
            onClick={() => {
              setFailed(false);
              setProgress(null);
              setAttempt((n) => n + 1);
            }}
          >
            {t('common.retry')}
          </button>
        </div>
      </div>
    );

  if (!result)
    return (
      <div className="ex-body">
        <p className="ex-hint">{t('export.local.notice')}</p>
        <p className="ex-step" role="status">
          {progress && progress.total > 0
            ? t('export.local.pdfProgress', {
                done: Math.min(progress.done + 1, progress.total),
                total: progress.total,
              })
            : t('export.local.making')}
        </p>
        <div className="sc-modal__actions">
          <button className="sc-btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
        </div>
      </div>
    );

  return (
    <div className="ex-body">
      <p className="ex-ok">{t('export.pdf.ready')}</p>
      <p className="ex-hint">
        {t('export.preview.pages', { count: result.pages })} · {t('export.local.notice')}
      </p>
      <PreviewBlock state={preview.state} url={preview.url} kind="image" alt={t('export.pdf.previewAlt')} />
      <div className="sc-modal__actions">
        <button className="sc-btn" onClick={onAgain}>
          {t('export.again')}
        </button>
        <button className="sc-btn" onClick={onClose}>
          {t('common.close')}
        </button>
        <button className="sc-btn" onClick={preview.toggle} aria-pressed={preview.state !== 'idle'}>
          {preview.state === 'idle' ? t('export.preview.show') : t('export.preview.hide')}
        </button>
        <button className="sc-btn sc-btn--primary" onClick={() => saveBlob(result.blob, `${safeBaseName(title)}.pdf`)}>
          {t('export.download')}
        </button>
      </div>
    </div>
  );
}
