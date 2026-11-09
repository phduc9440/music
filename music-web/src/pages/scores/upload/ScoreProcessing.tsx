import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import CompareModal from '../../components/scores/CompareModal';
import Modal from '../../components/scores/Modal';
import PageStrip from '../../components/scores/PageStrip';
import ProcessingSteps from '../../components/scores/ProcessingSteps';
import { omrApi, scoreApi, taskApi } from '../../services';
import type { AiTaskInfo, ScoreDetail as ScoreDetailData, ScoreFileInfo } from '../../types';
import {
  PROCESSING_POLL_MS,
  computeStepStates,
  describeTaskError,
  getTaskWarnings,
  isTerminalStatus,
  isValidScoreId,
  pickLatestOmrTask,
  stoppedEarly,
} from '../../utils/omr';
import { getErrorMessage, getHttpStatus, getUploadErrorMessage, useScoreBase } from '../../utils/score';
import '../../components/scores/scores.css';
import './ScoreLibrary.css';
import './ScoreProcessing.css';

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
      toast.info('Đã hủy tác vụ');
    } catch (err) {
      if (getHttpStatus(err) === NOT_CANCELLABLE_HTTP) {
        toast.info('Tác vụ đã kết thúc nên không hủy được');
        // Lấy trạng thái mới nhất để màn hình khớp với thực tế
        try {
          setTask((await taskApi.get(taskId)).data.result);
        } catch {
          /* giữ nguyên */
        }
      } else {
        toast.error(getErrorMessage(err, 'Không hủy được tác vụ'));
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
      toast.success('Đã gửi lại để số hóa');
    } catch (err) {
      toast.error(getUploadErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const navbar = (
    <div className="sc-backbar">
      <button type="button" className="sc-backlink" onClick={() => navigate(base)}>
        ‹ Thư viện
      </button>
    </div>
  );

  if (loadState === 'loading') {
    return (
      <div className="sc-page">
        {navbar}
        <main className="sc-container" aria-busy="true">
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
        <main className="sc-container">
          <div className="sc-empty">
            <h3>{notFound ? 'Không tìm thấy bản nhạc' : 'Không tải được tiến độ'}</h3>
            <p>{notFound ? 'Bản nhạc không tồn tại hoặc bạn không có quyền xem.' : 'Vui lòng thử lại sau.'}</p>
            <button className="sc-btn sc-btn--primary" onClick={() => navigate(base)}>
              Về thư viện
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
        <main className="sc-container">
          <div className="sc-empty">
            <h3>Bản nhạc này chưa có tác vụ số hóa</h3>
            <p>Bạn có thể xem chi tiết bản nhạc hoặc tải một file mới lên.</p>
            <button className="sc-btn sc-btn--primary" onClick={() => navigate(`${base}/${score.id}`)}>
              Xem bản nhạc
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
  const sourceLabel = usesPdf ? 'File PDF' : 'Ảnh chụp hoặc scan';

  let headline = 'Đang xử lý ảnh...';
  if (completed) headline = 'Số hóa xong';
  else if (failed) headline = task.status === 'CANCELLED' ? 'Đã hủy' : 'Số hóa thất bại';
  else if (queued) headline = 'Đang xếp hàng chờ xử lý...';
  else if (task.step === 'SPLIT_PDF') headline = 'Đang tách các trang PDF...';
  else if (task.step === 'PREPROCESS') headline = 'Đang làm sạch và căn thẳng ảnh...';
  else if (task.step === 'INFERENCE') headline = 'Đang nhận diện ký hiệu nhạc...';
  else if (task.step === 'MERGE') headline = 'Đang ghép các trang...';
  else if (task.step === 'EXPORT') headline = 'Đang xuất MusicXML và MIDI...';

  const activeNote =
    task.step === 'PREPROCESS' && totalPages > 0
      ? `Đã xử lý ${Math.min(pages.length, totalPages)}/${totalPages} trang`
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
              Tiến độ số hóa{sourceLabel ? ` · ${sourceLabel}` : ''}
              {totalPages > 0 ? ` · ${totalPages} trang` : ''}
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
            aria-label="Tiến độ số hóa"
          >
            <div
              className={`sp-bar__fill sp-bar__fill--${task.status.toLowerCase()}`}
              style={{ width: `${progress}%` }}
            />
          </div>

          <ProcessingSteps states={stepStates} activeNote={activeNote} />

          {completed && (
            <p className="sp-note">
              {stoppedEarly(task)
                ? 'Quy trình đã dừng sớm theo cấu hình. Bấm "Xem kết quả" để xem phần đã có.'
                : 'Đã nhận diện và xuất MusicXML, MIDI. Bấm "Xem kết quả" để xem bản nhạc.'}
            </p>
          )}

          {warnings.length > 0 && (
            <ul className="sp-warnings">
              {warnings.slice(0, MAX_WARNINGS_SHOWN).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
              {warnings.length > MAX_WARNINGS_SHOWN && (
                <li>Và {warnings.length - MAX_WARNINGS_SHOWN} cảnh báo khác, xem đầy đủ ở trang kết quả.</li>
              )}
            </ul>
          )}

          {error && (
            <div className="sp-error" role="alert">
              <strong>{error.title}</strong>
              <p>{error.hint}</p>
              {error.detail && <p className="sp-error__detail">Chi tiết: {error.detail}</p>}
            </div>
          )}

          <div className="sp-actions">
            {running && (
              <button className="sc-btn sc-btn--danger" disabled={busy} onClick={() => setConfirmCancel(true)}>
                Hủy
              </button>
            )}
            {failed && (
              <>
                {score.canEdit && (
                  <button className="sc-btn sc-btn--primary" disabled={busy} onClick={handleRetry}>
                    {busy ? 'Đang gửi...' : 'Thử lại'}
                  </button>
                )}
                <button className="sc-btn" disabled={busy} onClick={() => navigate('/scores/upload')}>
                  Tải file khác
                </button>
              </>
            )}
            {completed && (
              <button
                className="sc-btn sc-btn--primary"
                onClick={() => navigate(`${base}/${score.id}/review`, { replace: true })}
              >
                Xem kết quả
              </button>
            )}
          </div>
        </section>

        {(pages.length > 0 || (running && totalPages > 0)) && (
          <section className="sp-pages">
            <h2>Các trang</h2>
            <p className="sp-pages__hint">Bấm vào một trang để so sánh với ảnh gốc.</p>
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
        <Modal title="Hủy số hóa?" onClose={() => !busy && setConfirmCancel(false)}>
          <p>Tác vụ đang chạy sẽ dừng lại. Bạn có thể bấm "Thử lại" sau đó.</p>
          <div className="sc-modal__actions">
            <button className="sc-btn" disabled={busy} onClick={() => setConfirmCancel(false)}>
              Tiếp tục xử lý
            </button>
            <button className="sc-btn sc-btn--danger-solid" disabled={busy} onClick={handleCancel}>
              {busy ? 'Đang hủy...' : 'Hủy tác vụ'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
