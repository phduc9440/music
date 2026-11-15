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
import ScoreSettingsSection from '../../../components/scores/detail/ScoreSettingsSection';
import ReportModal from '../../../components/scores/common/ReportModal';
import TasksTable from '../../../components/scores/detail/TasksTable';
import { getBackTarget } from '../../../components/layout/nav';
import { BackLink } from '../../../components/ui';
import { commentApi, reportApi, scoreApi, sharingApi, suggestionApi } from '../../../services';
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

type Tab = 'info' | 'files' | 'tasks' | 'reviews' | 'comments' | 'suggestions' | 'settings';

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
  const requestedTab = searchParams.get('tab');
  const [tab, setTab] = useState<Tab>(
    requestedTab === 'settings' || requestedTab === 'suggestions' || requestedTab === 'info'
      ? requestedTab
      : requestedTab === 'comments' || focusCommentId
        ? 'comments'
        : 'info',
  );
  const [pendingRequests, setPendingRequests] = useState(0); // số yêu cầu xin quyền đang chờ (nhãn trên tab Cài đặt)
  const [openComments, setOpenComments] = useState<number | null>(null);
  const [openSuggestions, setOpenSuggestions] = useState<number | null>(null);
  const scoreBase = useScoreBase();
  const onOpenComments = useCallback((n: number) => setOpenComments(n), []);
  const onOpenSuggestions = useCallback((n: number) => setOpenSuggestions(n), []);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [shareTick, setShareTick] = useState(0); // đổi khi đóng hộp Chia sẻ để danh sách người có quyền tải lại
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
  const isOwnerView = score?.accessLevel === 'OWNER' && !!score.canManageSharing && !scoreBase.startsWith('/admin');
  // Ai có việc quản lý (chia sẻ, sửa thông tin, xóa) thì có tab Cài đặt; riêng danh sách người có quyền chỉ chủ thấy
  const showSettings = !!score && (isOwnerView || !!score.canEdit || !!score.canDelete);

  // Người không có quyền sửa không thấy tab File / Tác vụ: rơi về tab Nhận xét
  const activeTab: Tab =
    canSeeSources ||
    tab === 'info' ||
    tab === 'reviews' ||
    tab === 'comments' ||
    tab === 'suggestions' ||
    (tab === 'settings' && showSettings)
      ? tab
      : 'info';

  // Số yêu cầu xin quyền đang chờ, hiện trên tab Cài đặt để chủ bản nhạc biết có việc cần xử lý
  useEffect(() => {
    if (!id || !isOwnerView) return;
    let cancelled = false;
    sharingApi
      .get(id)
      .then((res) => !cancelled && setPendingRequests(res.data.result.pendingRequests))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [id, isOwnerView, shareTick]);

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
        <ScoreHero
          score={score}
          onVisibilityChanged={(updated) => setState({ phase: 'ready', score: updated })}
          onRequestMore={() => setRequestingEdit(true)}
          onReport={() => setReporting(true)}
        />

        <div className="sd-repo">
          <div className="sc-tabs sd-tabs" role="tablist">
            <button role="tab" aria-selected={activeTab === 'info'} className="sc-tab" onClick={() => setTab('info')}>
              {t('scores.detail.info')}
            </button>
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
            {showSettings && (
              <button
                role="tab"
                aria-selected={activeTab === 'settings'}
                className="sc-tab sc-tab--end"
                onClick={() => setTab('settings')}
              >
                {t('scores.detail.settings')}
                {pendingRequests > 0 ? (
                  <span className="sc-tab__count sc-tab__count--alert">{pendingRequests}</span>
                ) : null}
              </button>
            )}
          </div>

          {activeTab === 'info' && (
            <div className="sd-info">
              <ScorePreview score={score} />
              <ScoreSidebar score={score} />
            </div>
          )}
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
          {activeTab === 'settings' && showSettings && (
            <ScoreSettingsSection
              scoreId={score.id}
              score={score}
              onVisibilityChanged={(updated) => setState({ phase: 'ready', score: updated })}
              isOwner={isOwnerView}
              canShare={!!score.canManageSharing}
              canEdit={!!score.canEdit}
              canDelete={!!score.canDelete}
              pendingRequests={pendingRequests}
              refreshKey={shareTick}
              onChanged={() => setShareTick((n) => n + 1)}
              onShare={() => setSharing(true)}
              onEdit={() => setEditing(true)}
              onDelete={() => setDeleting(true)}
            />
          )}
          {activeTab === 'reviews' && (
            <ReviewsSection scoreId={score.id} canReview={score.canReview} onChanged={() => setTick((n) => n + 1)} />
          )}
        </div>
      </main>

      {requestingEdit && (
        <Modal title={t('scores.detail.requestMoreTitle')} onClose={() => setRequestingEdit(false)}>
          <RequestAccess
            scoreId={score.id}
            levels={score.accessLevel === 'VIEW' ? [2, 3] : [3]}
            hasViewAccess
            onGranted={() => {
              setRequestingEdit(false);
              setTick((n) => n + 1);
            }}
          />
        </Modal>
      )}

      {sharing && (
        <ShareModal
          scoreId={score.id}
          onClose={() => {
            setSharing(false);
            setShareTick((n) => n + 1);
          }}
        />
      )}

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
