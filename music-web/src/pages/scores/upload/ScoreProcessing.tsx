import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import CompareModal from '../../../components/scores/upload/CompareModal';
import Modal from '../../../components/scores/common/Modal';
import PageStrip from '../../../components/scores/upload/PageStrip';
import ProcessingSteps from '../../../components/scores/upload/ProcessingSteps';
import { omrApi, scoreApi, taskApi } from '../../../services';
import type { AiTaskInfo, ScoreDetail as ScoreDetailData, ScoreFileInfo } from '../../../types';
import {
  PROCESSING_POLL_MS,
  computeStepStates,
  describeTaskError,
  getTaskWarnings,
  isTerminalStatus,
  isValidScoreId,
  pickLatestOmrTask,
  stoppedEarly,
} from '../../../utils/omr';
import { getErrorMessage, getHttpStatus, getUploadErrorMessage, useScoreBase } from '../../../utils/score';
import '../../../components/scores/scores.css';
import '../library/ScoreLibrary.css';
import './ScoreProcessing.css';
import { t } from '../../../i18n/core';

type LoadState = 'loading' | 'ready' | 'notFound' | 'error';

/** Số cảnh báo tối đa hiện ở trang tiến độ; phần còn lại xem ở trang kết quả. */
const MAX_WARNINGS_SHOWN = 3;

/** Mã lỗi nghiệp vụ khi tác vụ đã kết thúc nên không hủy được nữa (AI_TASK_NOT_CANCELLABLE). */
const NOT_CANCELLABLE_HTTP = 409;

/**
 * Trang /scores/:id/processing: tiến độ số hóa bản nhạc (đặc tả mục 2.4).
 * Hỏi tiến độ mỗi 2 giây, hiện các bước, ảnh từng trang đã xử lý, cho hủy hoặc thử lại.
 */
export default function ScoreProcessing() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const base = useScoreBase();

  const [loadStateRaw, setLoadState] = useState<LoadState>('loading');
  const loadState: LoadState = isValidScoreId(id) ? loadStateRaw : 'notFound';
  const [score, setScore] = useState<ScoreDetailData | null>(null);
  const [task, setTask] = useState<AiTaskInfo | null>(null);
  const [pages, setPages] = useState<ScoreFileInfo[]>([]);
  const [compare, setCompare] = useState<ScoreFileInfo | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);

  // Tải bản nhạc, tác vụ OMR mới nhất và các ảnh trang đã có
  useEffect(() => {
    if (!isValidScoreId(id)) return; // mã trên đường dẫn không hợp lệ: không gọi API
    let cancelled = false;
    (async () => {
      try {
        const [detail, tasks, png] = await Promise.all([
          scoreApi.detail(id),
          taskApi.listOfScore(id),
          scoreApi.files(id, 'PNG'),
        ]);
        if (cancelled) return;
        setScore(detail.data.result);
        setTask(pickLatestOmrTask(tasks.data.result) ?? null);
        setPages(png.data.result);
        setLoadState('ready');
      } catch (err) {
        if (cancelled) return;
        const status = getHttpStatus(err);
        setLoadState(status === 404 || status === 403 ? 'notFound' : 'error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const taskId = task?.id;
  const running = task != null && !isTerminalStatus(task.status);

  // Hỏi tiến độ mỗi 2 giây: không gửi chồng yêu cầu, dừng khi tab bị ẩn và hỏi lại ngay khi tab hiện ra
  useEffect(() => {
    if (!id || !taskId || !running) return;
    let stopped = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      if (!stopped) timer = setTimeout(tick, PROCESSING_POLL_MS);
    };
    async function tick() {
      if (stopped || inFlight) return;
      if (document.hidden) return; // sẽ chạy lại khi tab hiện ra
      inFlight = true;
      try {
        const [latest, png] = await Promise.all([taskApi.get(taskId!), scoreApi.files(id!, 'PNG')]);
        if (stopped) return;
        setTask(latest.data.result);
        setPages(png.data.result);
      } catch (err) {
        const status = getHttpStatus(err);
        if (!stopped && (status === 404 || status === 403)) setLoadState('notFound');
        // Lỗi mạng thoáng qua: bỏ qua, lần sau hỏi lại
      } finally {
        inFlight = false;
        schedule();
      }
    }
    const onVisible = () => {
      if (document.hidden) return;
      clearTimeout(timer);
      void tick();
    };

    document.addEventListener('visibilitychange', onVisible);
    schedule();
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [id, taskId, running]);

  const completed = task?.status === 'COMPLETED';

  const usesPdf = useMemo(() => !!score?.files.some((f) => f.fileType === 'ORIGINAL_PDF'), [score]);
  const originalImages = useMemo(() => score?.files.filter((f) => f.fileType === 'ORIGINAL_IMAGE') ?? [], [score]);
  const originalPdf = useMemo(() => score?.files.find((f) => f.fileType === 'ORIGINAL_PDF'), [score]);
  const totalPages = Math.max(score?.pageCount ?? 0, originalImages.length, pages.length);

  const handleCancel = useCallback(async () => {
    if (!taskId) return;
    setBusy(true);
    try {
      const res = await taskApi.cancel(taskId);
      setTask(res.data.result);
      toast.info(t('upload.processing.cancelled'));
    } catch (err) {
      if (getHttpStatus(err) === NOT_CANCELLABLE_HTTP) {
        toast.info(t('upload.processing.cantCancel'));
        // Lấy trạng thái mới nhất để màn hình khớp với thực tế
        try {
          setTask((await taskApi.get(taskId)).data.result);
        } catch {
          /* giữ nguyên */
        }
      } else {
        toast.error(getErrorMessage(err, t('upload.processing.cancelFailed')));
      }
    } finally {
      setBusy(false);
      setConfirmCancel(false);
    }
  }, [taskId]);

  const handleRetry = async () => {
    if (!id) return;
    setBusy(true);
    try {
      const res = await omrApi.retry(id);
      setTask(res.data.result);
      setPages([]);
      toast.success(t('upload.processing.resent'));
    } catch (err) {
      toast.error(getUploadErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const navbar = (
    <div className="sc-backbar">
      <button type="button" className="sc-backlink" onClick={() => navigate(base)}>
        {t('upload.processing.backToLibrary')}
      </button>
    </div>
  );

  if (loadState === 'loading') {
    return (
      <div className="sc-page">
        {navbar}
        <main className="sc-container sp-container" aria-busy="true">
          <div className="sc-skeleton sp-skeleton" />
        </main>
      </div>
    );
  }

  if (loadState !== 'ready' || !score) {
    const notFound = loadState === 'notFound';
    return (
      <div className="sc-page">
        {navbar}
        <main className="sc-container sp-container">
          <div className="sc-empty">
            <h3>{notFound ? t('scores.detail.notFound') : t('upload.processing.loadFailed')}</h3>
            <p>{notFound ? t('scores.detail.notFoundHint') : t('scores.detail.retryLater')}</p>
            <button className="sc-btn sc-btn--primary" onClick={() => navigate(base)}>
              {t('upload.processing.toLibrary')}
            </button>
          </div>
        </main>
      </div>
    );
  }

  // Chưa có tác vụ OMR nào (ví dụ bản nhạc tự soạn): không có gì để theo dõi
  if (!task) {
    return (
      <div className="sc-page">
        {navbar}
        <main className="sc-container sp-container">
          <div className="sc-empty">
            <h3>{t('upload.processing.noTask')}</h3>
            <p>{t('upload.processing.noTaskHint')}</p>
            <button className="sc-btn sc-btn--primary" onClick={() => navigate(`${base}/${score.id}`)}>
              {t('scores.hero.viewScore')}
            </button>
          </div>
        </main>
      </div>
    );
  }

  const failed = task.status === 'FAILED' || task.status === 'CANCELLED';
  const queued = task.status === 'PENDING' || task.step === 'QUEUED' || !task.step;
  const progress = completed ? 100 : Math.min(100, Math.max(0, task.progress ?? 0));
  const stepStates = computeStepStates(task, usesPdf);
  const warnings = getTaskWarnings(task);
  const error = failed ? describeTaskError(task) : null;
  const sourceLabel = usesPdf ? t('upload.processing.sourcePdf') : t('upload.processing.sourceImage');

  let headline = t('upload.processing.headline.default');
  if (completed) headline = t('upload.processing.headline.completed');
  else if (failed)
    headline =
      task.status === 'CANCELLED' ? t('upload.processing.headline.cancelled') : t('upload.processing.headline.failed');
  else if (queued) headline = t('upload.processing.headline.queued');
  else if (task.step === 'SPLIT_PDF') headline = t('upload.processing.headline.SPLIT_PDF');
  else if (task.step === 'PREPROCESS') headline = t('upload.processing.headline.PREPROCESS');
  else if (task.step === 'INFERENCE') headline = t('upload.processing.headline.INFERENCE');
  else if (task.step === 'MERGE') headline = t('upload.processing.headline.MERGE');
  else if (task.step === 'EXPORT') headline = t('upload.processing.headline.EXPORT');

  const activeNote =
    task.step === 'PREPROCESS' && totalPages > 0
      ? t('upload.processing.pagesDone', { done: Math.min(pages.length, totalPages), total: totalPages })
      : '';

  const originalFor = (page: ScoreFileInfo) =>
    usesPdf ? originalPdf : originalImages.find((f) => f.pageNumber === page.pageNumber);

  return (
    <div className="sc-page">
      {navbar}
      <main className="sc-container sp-container">
        <header className="sc-lib-head">
          <div>
            <h1>{score.title}</h1>
            <p>
              {t('upload.processing.progress')}
              {sourceLabel ? ` · ${sourceLabel}` : ''}
              {totalPages > 0 ? ` · ${t('upload.pages', { count: totalPages })}` : ''}
            </p>
          </div>
        </header>

        <section className={`sp-card sp-card--${task.status.toLowerCase()}`} aria-live="polite">
          <div className="sp-card__top">
            <h2 className="sp-headline">{headline}</h2>
            <span className="sp-percent">{failed ? '' : `${progress}%`}</span>
          </div>
          <div
            className="sp-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-label={t('upload.processing.progress')}
          >
            <div
              className={`sp-bar__fill sp-bar__fill--${task.status.toLowerCase()}`}
              style={{ width: `${progress}%` }}
            />
          </div>

          <ProcessingSteps states={stepStates} activeNote={activeNote} />

          {completed && (
            <p className="sp-note">
              {stoppedEarly(task) ? t('upload.processing.stoppedEarly') : t('upload.processing.finished')}
            </p>
          )}

          {warnings.length > 0 && (
            <ul className="sp-warnings">
              {warnings.slice(0, MAX_WARNINGS_SHOWN).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
              {warnings.length > MAX_WARNINGS_SHOWN && (
                <li>{t('upload.processing.moreWarnings', { count: warnings.length - MAX_WARNINGS_SHOWN })}</li>
              )}
            </ul>
          )}

          {error && (
            <div className="sp-error" role="alert">
              <strong>{error.title}</strong>
              <p>{error.hint}</p>
              {error.detail && (
                <p className="sp-error__detail">{t('upload.processing.detail', { detail: error.detail })}</p>
              )}
            </div>
          )}

          <div className="sp-actions">
            {running && (
              <button className="sc-btn sc-btn--danger" disabled={busy} onClick={() => setConfirmCancel(true)}>
                {t('common.cancel')}
              </button>
            )}
            {failed && (
              <>
                {score.canEdit && (
                  <button className="sc-btn sc-btn--primary" disabled={busy} onClick={handleRetry}>
                    {busy ? t('scores.request.sending') : t('common.retry')}
                  </button>
                )}
                <button className="sc-btn" disabled={busy} onClick={() => navigate('/scores/upload')}>
                  {t('upload.processing.uploadOther')}
                </button>
              </>
            )}
            {completed && (
              <button
                className="sc-btn sc-btn--primary"
                onClick={() => navigate(`${base}/${score.id}/review`, { replace: true })}
              >
                {t('upload.processing.viewResult')}
              </button>
            )}
          </div>
        </section>

        {(pages.length > 0 || (running && totalPages > 0)) && (
          <section className="sp-pages">
            <h2>{t('upload.processing.pages')}</h2>
            <p className="sp-pages__hint">{t('upload.processing.pagesHint')}</p>
            <PageStrip pages={pages} total={running ? totalPages : 0} onSelect={setCompare} />
          </section>
        )}
      </main>

      {compare && (
        <CompareModal
          pageNumber={compare.pageNumber ?? 1}
          processedUrl={compare.downloadUrl}
          originalUrl={originalFor(compare)?.downloadUrl}
          originalIsPdf={usesPdf}
          onClose={() => setCompare(null)}
        />
      )}

      {confirmCancel && (
        <Modal title={t('upload.processing.cancelTitle')} onClose={() => !busy && setConfirmCancel(false)}>
          <p>{t('upload.processing.cancelText')}</p>
          <div className="sc-modal__actions">
            <button className="sc-btn" disabled={busy} onClick={() => setConfirmCancel(false)}>
              {t('upload.processing.keepGoing')}
            </button>
            <button className="sc-btn sc-btn--danger-solid" disabled={busy} onClick={handleCancel}>
              {busy ? t('upload.processing.cancelling') : t('upload.processing.cancelTask')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
