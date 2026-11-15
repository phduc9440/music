import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Link } from '../../routes/transition-nav';
import { useNavigate } from '../../routes/useTransitionNavigate';
import Author from '../../components/forum/Author';
import Markdown from '../../components/forum/Markdown';
import MarkdownEditor from '../../components/forum/MarkdownEditor';
import VoteButton from '../../components/forum/VoteButton';
import ReportModal from '../../components/scores/common/ReportModal';
import { BackLink, Icon } from '../../components/ui';
import { useDialog } from '../../components/ui/dialog-context';
import { forumApi, reportApi } from '../../services';
import type { ForumPost, ForumThreadDetail } from '../../types';
import { getErrorCode, getErrorMessage } from '../../utils/score';
import { formatDateTime, formatNumber, formatRelativeTime, t } from '../../i18n/core';
import '../../components/scores/scores.css';
import './forum.css';

type Reporting = { kind: 'thread' } | { kind: 'post'; id: string } | null;

/** Trang /forum/threads/:id: chủ đề, các câu trả lời (bài hay nhất đứng đầu), bình chọn, báo cáo và ô trả lời. */
export default function ForumThread() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const focusPostId = params.get('post');
  const navigate = useNavigate();
  const { confirm } = useDialog();
  const [detail, setDetail] = useState<ForumThreadDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [reporting, setReporting] = useState<Reporting>(null);
  const [busy, setBusy] = useState(false);
  // Bài đang được trả lời trực tiếp (người đó nhận thông báo riêng)
  const [replyTarget, setReplyTarget] = useState<ForumPost | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const replyBox = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await forumApi.thread(id);
      setDetail(res.data.result);
      setNotFound(false);
    } catch (err) {
      if (getErrorCode(err) === 4102) setNotFound(true);
      else toast.error(getErrorMessage(err, t('forum.loadFailed')));
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  /**
   * Mở từ thông báo (?post=ID): cuộn tới đúng bài và nháy viền vài giây. Bài chưa có trong trang (mới đăng sau khi mở)
   * thì nạp lại một lần; đã xóa hoặc bị ẩn thì thôi.
   */
  const reloadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!focusPostId || !detail) return;
    const el = document.getElementById(`post-${focusPostId}`);
    if (!el) {
      if (reloadedFor.current !== focusPostId) {
        reloadedFor.current = focusPostId;
        void load();
      }
      return;
    }
    el.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFocusedId(focusPostId);
    const timer = setTimeout(() => setFocusedId(null), 2600);
    return () => clearTimeout(timer);
  }, [focusPostId, detail, load]);

  /** Chạy một thao tác rồi nạp lại; báo lỗi bằng thông báo của BE. */
  const act = async (fn: () => Promise<unknown>, failed: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err, failed));
    } finally {
      setBusy(false);
    }
  };

  if (notFound) {
    return (
      <div className="sc-page">
        <main className="sc-container">
          <BackLink label={t('forum.title')} to="/forum" />
          <div className="sc-empty">
            <h3>{t('forum.notFoundTitle')}</h3>
            <p>{t('forum.notFoundText')}</p>
          </div>
        </main>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="sc-page">
        <main className="sc-container">
          <BackLink label={t('forum.title')} to="/forum" />
          <div className="fm-row fm-row--skeleton" aria-hidden="true" />
        </main>
      </div>
    );
  }

  const { thread, posts } = detail;

  const removeThread = async () => {
    const ok = await confirm({
      title: t('forum.deleteThreadTitle'),
      message: t('forum.deleteThreadText'),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await forumApi.deleteThread(thread.id);
      toast.success(t('forum.threadDeleted'));
      navigate('/forum');
    } catch (err) {
      toast.error(getErrorMessage(err, t('forum.actionFailed')));
    }
  };

  const removePost = async (post: ForumPost) => {
    const ok = await confirm({
      title: t('forum.deletePostTitle'),
      message: t('forum.deletePostText'),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    });
    if (ok) await act(() => forumApi.deletePost(post.id), t('forum.actionFailed'));
  };

  const submitReply = async () => {
    if (!reply.trim() || sending) return;
    setSending(true);
    try {
      await forumApi.reply(thread.id, reply, replyTarget?.id);
      setReply('');
      setReplyTarget(null);
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err, t('forum.replyFailed')));
    } finally {
      setSending(false);
    }
  };

  const saveEdit = async () => {
    if (!editing || !editing.body.trim()) return;
    const { id: postId, body } = editing;
    await act(() => forumApi.updatePost(postId, body), t('forum.actionFailed'));
    setEditing(null);
  };

  return (
    <div className="sc-page">
      <main className="sc-container fm-thread">
        <BackLink label={t('forum.title')} to="/forum" />

        <article className="fm-post fm-post--head">
          <VoteButton
            count={thread.voteCount}
            voted={thread.votedByMe}
            own={thread.mine}
            busy={busy}
            onToggle={() => act(() => forumApi.voteThread(thread.id), t('forum.actionFailed'))}
          />
          <div className="fm-post__main">
            <div className="fm-tags">
              <Link to={`/forum?category=${thread.categoryId}`} className="fm-tag">
                {thread.categoryName}
              </Link>
              {thread.answered && (
                <span className="fm-tag fm-tag--ok">
                  <Icon name="check" size={12} /> {t('forum.answered')}
                </span>
              )}
            </div>
            <h1 className="fm-thread__title">{thread.title}</h1>
            <div className="fm-post__meta">
              <Author author={thread.author} />
              <span className="fm-muted" title={formatDateTime(thread.createdAt)}>
                {formatRelativeTime(thread.createdAt)}
              </span>
              {thread.editedAt && <span className="fm-muted">{t('forum.edited')}</span>}
            </div>

            {thread.body && <Markdown source={thread.body} />}

            {thread.score && (
              <Link to={`/scores/${thread.score.id}`} state={{ from: '/forum' }} className="fm-scorecard">
                <Icon name="music" size={18} />
                <span>
                  <span className="fm-muted">{t('forum.attachedScore')}</span>
                  <strong>{thread.score.title}</strong>
                </span>
              </Link>
            )}

            <div className="fm-actions">
              <button
                type="button"
                className="sc-btn sc-btn--sm"
                aria-pressed={thread.subscribed}
                disabled={busy}
                onClick={() =>
                  act(() => forumApi.subscribe(thread.id, !thread.subscribed), t('forum.actionFailed'))
                }
              >
                <Icon name="bell" size={14} />
                {thread.subscribed ? t('forum.unfollow') : t('forum.follow')}
              </button>
              {thread.mine ? (
                <>
                  <Link to={`/forum/threads/${thread.id}/edit`} className="sc-btn sc-btn--sm">
                    <Icon name="edit" size={14} />
                    {t('common.edit')}
                  </Link>
                  <button type="button" className="sc-btn sc-btn--sm sc-btn--danger" onClick={removeThread}>
                    <Icon name="trash" size={14} />
                    {t('common.delete')}
                  </button>
                </>
              ) : (
                <button type="button" className="sc-btn sc-btn--sm" onClick={() => setReporting({ kind: 'thread' })}>
                  <Icon name="alert" size={14} />
                  {t('scores.report.commentLink')}
                </button>
              )}
            </div>
          </div>
        </article>

        <h2 className="fm-section">{t('forum.replies', { count: posts.length })}</h2>

        {posts.length === 0 && <p className="fm-muted">{t('forum.noReplies')}</p>}

        <ol className="fm-posts">
          {posts.map((p) => (
            <li key={p.id} id={`post-${p.id}`}>
              <article
                className={`fm-post${p.accepted ? ' fm-post--accepted' : ''}${focusedId === p.id ? ' is-focused' : ''}`}
              >
                <VoteButton
                  count={p.voteCount}
                  voted={p.votedByMe}
                  own={p.mine}
                  busy={busy}
                  onToggle={() => act(() => forumApi.votePost(p.id), t('forum.actionFailed'))}
                />
                <div className="fm-post__main">
                  {p.accepted && (
                    <span className="fm-tag fm-tag--ok">
                      <Icon name="check" size={12} /> {t('forum.bestAnswer')}
                    </span>
                  )}
                  <div className="fm-post__meta">
                    <Author author={p.author} />
                    <span className="fm-muted" title={formatDateTime(p.createdAt)}>
                      {formatRelativeTime(p.createdAt)}
                    </span>
                    {p.editedAt && <span className="fm-muted">{t('forum.edited')}</span>}
                  </div>

                  {p.replyTo && (
                    <a
                      className="fm-quote"
                      href={`#post-${p.replyTo.postId}`}
                      onClick={(e) => {
                        e.preventDefault();
                        document
                          .getElementById(`post-${p.replyTo?.postId}`)
                          ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                      }}
                    >
                      <strong>{t('forum.inReplyTo', { name: p.replyTo.authorName || t('forum.anonymous') })}</strong>
                      <span>{p.replyTo.excerpt}</span>
                    </a>
                  )}

                  {editing?.id === p.id ? (
                    <div className="fm-edit">
                      <MarkdownEditor
                        label={t('forum.editReply')}
                        value={editing.body}
                        rows={6}
                        onChange={(body) => setEditing({ id: p.id, body })}
                      />
                      <div className="fm-actions">
                        <button type="button" className="sc-btn sc-btn--sm" onClick={() => setEditing(null)}>
                          {t('common.cancel')}
                        </button>
                        <button
                          type="button"
                          className="sc-btn sc-btn--sm sc-btn--primary"
                          disabled={busy || !editing.body.trim()}
                          onClick={saveEdit}
                        >
                          {t('common.save')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <Markdown source={p.body} />
                  )}

                  {editing?.id !== p.id && (
                    <div className="fm-actions">
                      {!p.mine && (
                        <button
                          type="button"
                          className="sc-btn sc-btn--sm"
                          onClick={() => {
                            setReplyTarget(p);
                            replyBox.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                          }}
                        >
                          <Icon name="send" size={14} />
                          {t('forum.replyTo')}
                        </button>
                      )}
                      {thread.mine && !p.mine && (
                        <button
                          type="button"
                          className="sc-btn sc-btn--sm"
                          aria-pressed={p.accepted}
                          disabled={busy}
                          onClick={() => act(() => forumApi.accept(p.id), t('forum.actionFailed'))}
                        >
                          <Icon name="check" size={14} />
                          {p.accepted ? t('forum.unaccept') : t('forum.accept')}
                        </button>
                      )}
                      {p.mine ? (
                        <>
                          <button
                            type="button"
                            className="sc-btn sc-btn--sm"
                            onClick={() => setEditing({ id: p.id, body: p.body })}
                          >
                            <Icon name="edit" size={14} />
                            {t('common.edit')}
                          </button>
                          <button
                            type="button"
                            className="sc-btn sc-btn--sm sc-btn--danger"
                            onClick={() => removePost(p)}
                          >
                            <Icon name="trash" size={14} />
                            {t('common.delete')}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="sc-btn sc-btn--sm"
                          onClick={() => setReporting({ kind: 'post', id: p.id })}
                        >
                          <Icon name="alert" size={14} />
                          {t('scores.report.commentLink')}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </article>
            </li>
          ))}
        </ol>

        <section className="fm-reply" aria-label={t('forum.yourReply')} ref={replyBox}>
          {replyTarget && (
            <div className="fm-replying" role="status">
              <span>
                <strong>
                  {t('forum.replyingTo', { name: replyTarget.author.fullName || t('forum.anonymous') })}
                </strong>
                <span className="fm-muted"> “{replyTarget.body.replace(/\s+/g, ' ').slice(0, 100)}”</span>
              </span>
              <button
                type="button"
                className="sc-icon-btn"
                aria-label={t('forum.cancelReplyTo')}
                onClick={() => setReplyTarget(null)}
              >
                ×
              </button>
            </div>
          )}
          <MarkdownEditor
            label={t('forum.yourReply')}
            value={reply}
            rows={6}
            placeholder={t('forum.replyPlaceholder')}
            onChange={setReply}
            disabled={sending}
          />
          <div className="fm-actions fm-actions--end">
            <span className="fm-muted">{t('forum.replyCount', { count: formatNumber(posts.length) })}</span>
            <button
              type="button"
              className="sc-btn sc-btn--primary"
              disabled={sending || !reply.trim()}
              onClick={submitReply}
            >
              {sending ? t('forum.sending') : t('forum.send')}
            </button>
          </div>
        </section>
      </main>

      {reporting && (
        <ReportModal
          title={t(reporting.kind === 'thread' ? 'forum.reportThread' : 'forum.reportPost')}
          onSubmit={(payload) =>
            reporting.kind === 'thread'
              ? reportApi.reportForumThread(thread.id, payload)
              : reportApi.reportForumPost(reporting.id, payload)
          }
          onClose={() => setReporting(null)}
        />
      )}
    </div>
  );
}
