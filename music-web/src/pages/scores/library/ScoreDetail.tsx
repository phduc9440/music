import { useCallback, useEffect, useState } from 'react';
import { useLocation, useParams, useSearchParams, useViewTransitionState } from 'react-router-dom';
import { useNavigate } from '../../../routes/useTransitionNavigate';
import { toast } from 'react-toastify';
import DeleteScoreModal from '../../../components/scores/detail/DeleteScoreModal';
import EditScoreModal from '../../../components/scores/detail/EditScoreModal';
import FilesTable from '../../../components/scores/detail/FilesTable';
import RequestAccess from '../../../components/scores/detail/RequestAccess';
import ReviewsSection from '../../../components/scores/detail/ReviewsSection';
import CommentsSection from '../../../components/scores/comments/CommentsSection';
import SuggestionsSection from '../../../components/scores/suggestions/SuggestionsSection';
import ScoreHero, { ScorePreview, ScoreSidebar } from '../../../components/scores/detail/ScoreHero';
import Modal from '../../../components/scores/common/Modal';
import ShareModal from '../../../components/scores/detail/ShareModal';
import ReportModal from '../../../components/scores/common/ReportModal';
import TasksTable from '../../../components/scores/detail/TasksTable';
import { getBackTarget } from '../../../components/layout/nav';
import { BackLink } from '../../../components/ui';
import { commentApi, reportApi, scoreApi, suggestionApi } from '../../../services';
import type { ScoreDetail as ScoreDetailData } from '../../../types';
import { getHttpStatus, POLL_INTERVAL_MS, useScoreBase } from '../../../utils/score';
import '../../../components/scores/scores.css';
import './ScoreDetail.css';
import { t } from '../../../i18n/core';

type LoadState =
  | { phase: 'loading' }
  | { phase: 'ready'; score: ScoreDetailData }
  | { phase: 'notFound' }
  | { phase: 'forbidden' }
  | { phase: 'error' };

type Tab = 'files' | 'tasks' | 'reviews' | 'comments' | 'suggestions';

/**
 * Trang /scores/:id: chi tiết bản nhạc (doc mục 2.0).
 * admin = true: dùng lại cho /admin/scores/:id, nằm trong khung AdminLayout (không vẽ navbar riêng) và quay về
 * danh sách quản lý bản nhạc thay vì thư viện của người dùng.
 */
export default function ScoreDetail({ admin = false }: { admin?: boolean }) {
  const location = useLocation();
  // Người dùng quay lại đúng nơi đã đi từ đó tới (Khám phá, Kho bản nhạc mẫu, Được chia sẻ, playlist...), mặc định là Thư viện
  const back = admin
    ? { to: '/admin/scores', label: t('common.nav.back') }
    : getBackTarget(location.state, { to: '/scores', label: t('common.nav.items.library') });
  const backPath = back.to;
  const backLabel = admin ? back.label : `‹ ${back.label}`;
  // Admin vào từ nhiều trang (quản lý, chờ duyệt, kho mẫu) nên quay về trang trước đó
  const goBack = () => (admin && window.history.length > 1 ? navigate(-1) : navigate(backPath));
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const arriving = useViewTransitionState(useLocation().pathname);
  const [state, setState] = useState<LoadState>({ phase: 'loading' });
  const [tick, setTick] = useState(0); // tăng lên để tải lại (polling)
  // ?tab=comments&comment=ID (từ thông báo góp ý): mở tab Góp ý và cuộn tới góp ý đó
  const [searchParams] = useSearchParams();
  const focusCommentId = searchParams.get('comment');
  const [tab, setTab] = useState<Tab>(
    searchParams.get('tab') === 'suggestions'
      ? 'suggestions'
      : searchParams.get('tab') === 'comments' || focusCommentId
        ? 'comments'
        : 'files',
  );
  const [openComments, setOpenComments] = useState<number | null>(null);
  const [openSuggestions, setOpenSuggestions] = useState<number | null>(null);
  const scoreBase = useScoreBase();
  const onOpenComments = useCallback((n: number) => setOpenComments(n), []);
  const onOpenSuggestions = useCallback((n: number) => setOpenSuggestions(n), []);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [requestingEdit, setRequestingEdit] = useState(false);

  // Tải chi tiết bản nhạc
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    scoreApi
      .detail(id)
      .then((res) => {
        if (!cancelled) setState({ phase: 'ready', score: res.data.result });
      })
      .catch((err) => {
        if (cancelled) return;
        const code = getHttpStatus(err);
        // 404: không tồn tại. 403: chưa có quyền xem -> cho xin quyền
        if (code === 404) {
          setState({ phase: 'notFound' });
        } else if (code === 403) {
          setState({ phase: 'forbidden' });
        } else {
          setState((prev) => (prev.phase === 'ready' ? prev : { phase: 'error' }));
          toast.error(t('scores.detail.loadFailed'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, tick]);

  // Còn tác vụ đang chạy thì tự làm mới mỗi 5 giây để thấy tiến độ
  const score = state.phase === 'ready' ? state.score : null;
  const running = score?.processingStatus === 'PENDING' || score?.processingStatus === 'PROCESSING';
  // File gốc và lịch sử tác vụ chỉ dành cho người có quyền sửa; người xem chỉ thấy tab Nhận xét
  const canSeeSources = score?.accessLevel === 'OWNER' || score?.accessLevel === 'EDIT';
  // Người không có quyền sửa không thấy tab File / Tác vụ: rơi về tab Nhận xét
  const activeTab: Tab =
    canSeeSources || tab === 'reviews' || tab === 'comments' || tab === 'suggestions' ? tab : 'reviews';

  // Số góp ý đang mở hiện trên tab (tab Góp ý cập nhật lại khi người dùng thêm / xử lý góp ý)
  useEffect(() => {
    if (!id || state.phase !== 'ready') return;
    let cancelled = false;
    commentApi
      .list(id, 'OPEN')
      .then((res) => !cancelled && setOpenComments(res.data.result.openCount))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [id, state.phase]);
  // Số đề xuất đang mở hiện trên tab Đề xuất (chỉ người có quyền nhận xét trở lên xem được)
  const canSuggest = score?.canReview === true;
  useEffect(() => {
    if (!id || state.phase !== 'ready' || !canSuggest) return;
    let cancelled = false;
    suggestionApi
      .list(id, 'OPEN', 0, 1)
      .then((res) => !cancelled && setOpenSuggestions(res.data.result.totalElements))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [id, state.phase, canSuggest]);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTick((n) => n + 1), POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [running]);

  // Trang admin dùng cùng nút quay lại với các trang chi tiết admin khác (ví dụ chi tiết thành viên)
  const navbar = (
    <div className="sc-backbar">
      {admin ? (
        <BackLink label={backLabel} onClick={goBack} />
      ) : (
        <button type="button" className="sc-backlink" onClick={goBack}>
          {backLabel}
        </button>
      )}
    </div>
  );

  if (state.phase === 'loading') {
    return (
      <div className="sc-page">
        {navbar}
        <main className="sc-container" aria-busy="true">
          <div
            className="sc-skeleton sc-skeleton--hero"
            style={arriving ? { viewTransitionName: 'ui-shared-cover' } : undefined}
          />
        </main>
      </div>
    );
  }

  if (state.phase === 'forbidden' && id) {
    return (
      <div className="sc-page">
        {navbar}
        <main className="sc-container">
          <RequestAccess scoreId={id} onGranted={() => setTick((n) => n + 1)} />
        </main>
      </div>
    );
  }

  if (!score) {
    const notFound = state.phase === 'notFound';
    return (
      <div className="sc-page">
        {navbar}
        <main className="sc-container">
          <div className="sc-empty">
            <h3>{notFound ? t('scores.detail.notFound') : t('scores.detail.loadFailed')}</h3>
            <p>{notFound ? t('scores.detail.notFoundHint') : t('scores.detail.retryLater')}</p>
            <button className="sc-btn sc-btn--primary" onClick={goBack}>
              {admin ? t('scores.detail.toList') : t('scores.detail.backTo', { name: back.label })}
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="sc-page">
      {navbar}
      <main className="sc-container">
        <ScoreHero score={score} onVisibilityChanged={(updated) => setState({ phase: 'ready', score: updated })} />

        <div className="sd-layout">
          <div className="sd-main">
            <ScorePreview score={score} />

            <div className="sc-tabs" role="tablist">
              {canSeeSources && (
                <>
                  <button
                    role="tab"
                    aria-selected={activeTab === 'files'}
                    className="sc-tab"
                    onClick={() => setTab('files')}
                  >
                    File <span className="sc-tab__count">{score.files.length}</span>
                  </button>
                  <button
                    role="tab"
                    aria-selected={activeTab === 'tasks'}
                    className="sc-tab"
                    onClick={() => setTab('tasks')}
                  >
                    {t('scores.detail.tasks')} <span className="sc-tab__count">{score.latestTasks.length}</span>
                  </button>
                </>
              )}
              <button
                role="tab"
                aria-selected={activeTab === 'reviews'}
                className="sc-tab"
                onClick={() => setTab('reviews')}
              >
                {t('scores.detail.reviews')}
                {score.ratingCount ? <span className="sc-tab__count">{score.ratingCount}</span> : null}
              </button>
              <button
                role="tab"
                aria-selected={activeTab === 'comments'}
                className="sc-tab"
                onClick={() => setTab('comments')}
              >
                {t('scores.comments.tab')}
                {openComments ? <span className="sc-tab__count">{openComments}</span> : null}
              </button>
              {score.canReview && (
                <button
                  role="tab"
                  aria-selected={activeTab === 'suggestions'}
                  className="sc-tab"
                  onClick={() => setTab('suggestions')}
                >
                  {t('suggestions.section.tab')}
                  {openSuggestions ? <span className="sc-tab__count">{openSuggestions}</span> : null}
                </button>
              )}
            </div>

            {activeTab === 'files' && <FilesTable files={score.files} />}
            {activeTab === 'tasks' && <TasksTable tasks={score.latestTasks} files={score.files} />}
            {activeTab === 'comments' && (
              <CommentsSection
                scoreId={score.id}
                focusId={focusCommentId}
                onOpenCount={onOpenComments}
                // Bản đã có MusicXML: bấm nhãn ô để mở trang xem bản nhạc tại đúng góp ý
                viewerHref={
                  score.files.some((f) => f.fileType === 'MUSICXML')
                    ? (c) => `${scoreBase}/${score.id}/edit?comment=${c.id}`
                    : undefined
                }
              />
            )}
            {activeTab === 'suggestions' && score.canReview && (
              <SuggestionsSection scoreId={score.id} onOpenCount={onOpenSuggestions} />
            )}
            {activeTab === 'reviews' && (
              <ReviewsSection scoreId={score.id} canReview={score.canReview} onChanged={() => setTick((n) => n + 1)} />
            )}
          </div>

          <ScoreSidebar
            score={score}
            onEdit={() => setEditing(true)}
            onDelete={() => setDeleting(true)}
            onShare={() => setSharing(true)}
            onRequestEdit={() => setRequestingEdit(true)}
            onReport={() => setReporting(true)}
          />
        </div>
      </main>

      {requestingEdit && (
        <Modal title={t('scores.detail.requestEditTitle')} onClose={() => setRequestingEdit(false)}>
          <RequestAccess
            scoreId={score.id}
            levels={[3]}
            hasViewAccess
            onGranted={() => {
              setRequestingEdit(false);
              setTick((n) => n + 1);
            }}
          />
        </Modal>
      )}

      {sharing && <ShareModal scoreId={score.id} onClose={() => setSharing(false)} />}

      {reporting && (
        <ReportModal
          title={t('scores.report.title')}
          onSubmit={(payload) => reportApi.reportScore(score.id, payload)}
          onClose={() => setReporting(false)}
        />
      )}

      {editing && (
        <EditScoreModal
          score={score}
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            setState({ phase: 'ready', score: updated });
            setEditing(false);
          }}
        />
      )}
      {deleting && (
        <DeleteScoreModal
          scoreId={score.id}
          title={score.title}
          moderating={score.accessLevel !== 'OWNER'}
          onClose={() => setDeleting(false)}
          onDeleted={() => navigate(backPath, { replace: true })}
        />
      )}
    </div>
  );
}
