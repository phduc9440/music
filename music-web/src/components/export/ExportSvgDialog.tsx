import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { downloadFile, saveBlob } from '../../services';
import { exportApi } from '../../services/file/exportApi';
import type { ExportFileInfo, SvgOptions } from '../../types/export';
import Modal from '../scores/common/Modal';
import ExportRunningView from './ExportRunningView';
import { translateTaskError } from './exportUtils';
import { useExportFlow } from './useExportFlow';
import PreviewBlock from './PreviewBlock';
import Icon from '../ui/Icon';
import { useClickPreview } from './local/useClickPreview';
import { loadScoreXml, makeLocalSvgPages, safeBaseName, svgBlob, zipSvgPages } from './local/localExport';
import { t } from '../../i18n/core';
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
 * trang cần tải chỉ là lựa chọn của người dùng nên không làm đổi kết quả đã lưu. Máy chủ chưa cài MuseScore thì dàn trang
 * và tạo SVG ngay trên trình duyệt.
 */
export default function ExportSvgDialog({ scoreId, title, open, onOpen, onClose }: Props) {
  const flow = useExportFlow({ scoreId, isOpen: open, readyMessage: t('export.svg.ready'), reopen: onOpen });
  /** Trang người dùng đã chọn lúc gửi yêu cầu (null là tất cả); dùng để chọn nút tải chính ở màn hình kết quả. */
  const [wantedPage, setWantedPage] = useState<number | null>(null);
  /** Đang tạo SVG trên trình duyệt (máy chủ chưa cài MuseScore). */
  const [local, setLocal] = useState(false);
  // Đóng hộp thoại thì bỏ kết quả tạo trên trình duyệt (không có tác vụ nền nào để theo dõi)
  const close = () => {
    setLocal(false);
    onClose();
  };
  if (!open) return null;

  const files = flow.results;
  return (
    <Modal title={t('export.svg.title')} onClose={close}>
      {local ? (
        <LocalSvgView
          scoreId={scoreId}
          title={title}
          wantedPage={wantedPage}
          onAgain={() => setLocal(false)}
          onClose={close}
        />
      ) : files && files.length > 0 ? (
        <SvgResultView
          files={files}
          scoreId={scoreId}
          title={title}
          wantedPage={wantedPage}
          onAgain={flow.again}
          onClose={close}
        />
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
        <SvgForm
          scoreId={scoreId}
          title={title}
          onSubmit={(options) => {
            setWantedPage(options.page === 'ALL' ? null : options.page);
            return flow.submit('SVG', options, () => setLocal(true));
          }}
          onClose={close}
        />
      )}
    </Modal>
  );
}

function SvgForm({
  scoreId,
  title,
  onSubmit,
  onClose,
}: {
  scoreId: string;
  title: string;
  onSubmit: (options: SvgOptions) => Promise<string | null>;
  onClose: () => void;
}) {
  const [all, setAll] = useState(true);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<number | null>(null);
  // Xem trước trang đang chọn (tất cả trang thì trang 1); chỉ dựng khi bấm
  const shownPage = all ? 1 : page;
  const preview = useClickPreview(async () => {
    const svgs = await makeLocalSvgPages(await loadScoreXml(scoreId), { title });
    setPages(svgs.length);
    return svgBlob(svgs[Math.min(shownPage, svgs.length) - 1]);
  }, String(shownPage));

  const submit = async () => {
    if (!all && (!Number.isInteger(page) || page < 1)) return setError(t('export.validation.page'));
    setBusy(true);
    setError(null);
    const message = await onSubmit({ page: all ? 'ALL' : page });
    setBusy(false);
    if (message) setError(all ? message : t('export.svg.retryHint', { message }));
  };

  return (
    <div className="ex-body">
      <p className="ex-hint">{t('export.svg.hint')}</p>
      <label className="ex-radio">
        <input type="radio" name="svg-scope" checked={all} onChange={() => setAll(true)} />
        {t('export.svg.all')}
      </label>
      <label className="ex-radio">
        <input type="radio" name="svg-scope" checked={!all} onChange={() => setAll(false)} />
        {t('export.svg.one')}
        <input
          className="sc-input"
          type="number"
          min={1}
          step={1}
          value={page}
          disabled={all}
          aria-label={t('export.svg.pageNumber')}
          onChange={(e) => setPage(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
        />
      </label>
      <PreviewBlock
        state={preview.state}
        url={preview.url}
        kind="image"
        alt={t('export.svg.page', { n: shownPage })}
        note={
          pages
            ? shownPage > pages
              ? t('export.svg.tooFar', { count: pages, page: shownPage })
              : t('export.preview.pageOf', { page: shownPage, count: pages })
            : null
        }
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
          {busy ? t('export.sending') : t('export.svg.submit')}
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
      toast.error(t('export.downloadFailed'));
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
      <p className="ex-ok">{t('export.svg.done', { count: files.length })}</p>
      {tooFar && (
        <p className="ex-error" role="alert">
          {t('export.svg.tooFar', { count: files.length, page: wantedPage })}
        </p>
      )}
      <div className="ex-pages" aria-label={t('export.svg.pages')}>
        {files.map((file) => (
          <button key={file.id} className="sc-btn sc-btn--sm" disabled={busy} onClick={() => void downloadPage(file)}>
            {t('export.svg.page', { n: file.pageNumber ?? '?' })}
          </button>
        ))}
      </div>
      <div className="sc-modal__actions">
        <button className="sc-btn" onClick={onAgain}>
          {t('export.svg.again')}
        </button>
        <button className="sc-btn" onClick={onClose}>
          {t('common.close')}
        </button>
        {wanted ? (
          <button className="sc-btn sc-btn--primary" disabled={busy} onClick={() => void downloadPage(wanted)}>
            {t('export.svg.downloadPage', { page: wantedPage ?? '' })}
          </button>
        ) : (
          <button className="sc-btn sc-btn--primary" disabled={busy || !taskId} onClick={() => void downloadZip()}>
            {busy ? t('export.downloading') : t('export.svg.downloadZip', { count: files.length })}
          </button>
        )}
      </div>
    </div>
  );
}

/** Tạo các trang SVG ngay trên trình duyệt (máy chủ chưa cài MuseScore): tải từng trang hoặc cả ZIP, bấm để xem trước. */
function LocalSvgView({
  scoreId,
  title,
  wantedPage,
  onAgain,
  onClose,
}: {
  scoreId: string;
  title: string;
  wantedPage: number | null;
  onAgain: () => void;
  onClose: () => void;
}) {
  const [svgs, setSvgs] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);
  /** Trang đang xem trước (null là chưa mở); các trang đã có sẵn trong bộ nhớ nên hiện ngay. */
  const [shown, setShown] = useState<number | null>(null);
  const base = safeBaseName(title);
  const previewUrl = useMemo(
    () => (svgs && shown !== null && svgs[shown - 1] ? URL.createObjectURL(svgBlob(svgs[shown - 1])) : null),
    [svgs, shown],
  );
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  useEffect(() => {
    let cancelled = false;
    loadScoreXml(scoreId)
      .then((xml) => makeLocalSvgPages(xml, { title }))
      .then((made) => !cancelled && setSvgs(made))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [scoreId, title]);

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
          <button className="sc-btn sc-btn--primary" onClick={onAgain}>
            {t('common.retry')}
          </button>
        </div>
      </div>
    );

  if (!svgs)
    return (
      <div className="ex-body">
        <p className="ex-hint">{t('export.local.notice')}</p>
        <p className="ex-step" role="status">
          {t('export.local.making')}
        </p>
        <div className="sc-modal__actions">
          <button className="sc-btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
        </div>
      </div>
    );

  const wanted = wantedPage !== null && wantedPage <= svgs.length ? wantedPage : null;
  const downloadPage = (page: number) => saveBlob(svgBlob(svgs[page - 1]), `${base}-trang-${page}.svg`);
  return (
    <div className="ex-body">
      <p className="ex-ok">{t('export.svg.done', { count: svgs.length })}</p>
      <p className="ex-hint">{t('export.local.notice')}</p>
      {wantedPage !== null && !wanted && (
        <p className="ex-error" role="alert">
          {t('export.svg.tooFar', { count: svgs.length, page: wantedPage })}
        </p>
      )}
      <div className="ex-pages" aria-label={t('export.svg.pages')}>
        {svgs.map((_, i) => (
          <span key={i} className="ex-page">
            <button className="sc-btn sc-btn--sm" onClick={() => downloadPage(i + 1)}>
              {t('export.svg.page', { n: i + 1 })}
            </button>
            <button
              className={`sc-btn sc-btn--sm ex-page-eye${shown === i + 1 ? ' is-active' : ''}`}
              aria-pressed={shown === i + 1}
              aria-label={t('export.preview.showPage', { page: i + 1 })}
              title={t('export.preview.showPage', { page: i + 1 })}
              onClick={() => setShown(shown === i + 1 ? null : i + 1)}
            >
              <Icon name="eye" size={14} />
            </button>
          </span>
        ))}
      </div>
      {previewUrl && <img className="ex-preview" src={previewUrl} alt={t('export.svg.page', { n: shown ?? 1 })} />}
      <div className="sc-modal__actions">
        <button className="sc-btn" onClick={onAgain}>
          {t('export.svg.again')}
        </button>
        <button className="sc-btn" onClick={onClose}>
          {t('common.close')}
        </button>
        {wanted ? (
          <button className="sc-btn sc-btn--primary" onClick={() => downloadPage(wanted)}>
            {t('export.svg.downloadPage', { page: wanted })}
          </button>
        ) : (
          <button
            className="sc-btn sc-btn--primary"
            onClick={() => saveBlob(zipSvgPages(svgs, base), `${base}-svg.zip`)}
          >
            {t('export.svg.downloadZip', { count: svgs.length })}
          </button>
        )}
      </div>
    </div>
  );
}
