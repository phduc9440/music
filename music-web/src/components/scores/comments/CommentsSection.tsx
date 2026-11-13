import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '../../../routes/transition-nav';
import { toast } from 'react-toastify';
import { commentApi, reportApi } from '../../../services';
import ReportModal from '../common/ReportModal';
import type { CommentFilter, CommentMember, ScoreComment, ScoreComments } from '../../../types';
import { formatRelative, getErrorMessage } from '../../../utils/score';
import { useDialog } from '../../ui/dialog-context';
import Skeleton from '../../ui/Skeleton';
import { t } from '../../../i18n/core';
import MentionInput, { MemberAvatar } from './MentionInput';
import CommentCompareModal from './CommentCompareModal';
import { measureLabel, mentionIdsIn, splitMentions } from './commentUtils';
import type { CommentAnchor } from './commentUtils';
import './comments.css';

const FILTERS: CommentFilter[] = ['OPEN', 'RESOLVED', 'MENTIONED', 'ALL'];

interface Props {
  scoreId: string;
  /** Góp ý cần cuộn tới (từ thông báo: ?comment=ID); có thì mở bộ lọc Tất cả. */
  focusId?: string | null;
  /** Báo trang cha số góp ý đang mở để hiện trên tab. */
  onOpenCount?: (count: number) => void;
  // ---- dùng trong trang xem bản nhạc
  /** Vùng đang chọn trên bản nhạc: điền sẵn ô từ–đến (và bè, nốt) cho góp ý mới. */
  anchor?: CommentAnchor | null;
  /** Tăng lên để mở form góp ý (phím tắt Ctrl/Cmd+Alt+M). */
  composeKey?: number;
  /** Có giá trị: chưa cho viết góp ý, hiện lý do (ví dụ bản nhạc đang có thay đổi chưa lưu). */
  composeBlockedReason?: string | null;
  /** Bấm nhãn ô của một góp ý: trang cha cuộn bản nhạc tới vùng đó. */
  onSelectThread?: (comment: ScoreComment) => void;
  /** Gọi sau mỗi lần tải lại (thêm, sửa, xử lý, xóa) để trang cha cập nhật vùng tô trên bản nhạc. */
  onChanged?: () => void;
  /** Trang chi tiết: đường dẫn mở trang xem bản nhạc tại góp ý (null nếu bản chưa có MusicXML). */
  viewerHref?: (comment: ScoreComment) => string | null;
  /** Bố cục hẹp cho bảng bên phải trang xem bản nhạc. */
  compact?: boolean;
}

/**
 * Bảng "Góp ý" (mục 4.2): góp ý gắn vào đoạn ô nhịp, trả lời, @nhắc tên, đánh dấu đã xử lý, nhãn "Viết trên phiên bản vN"
 * khi số ô đã đổi. Dùng ở tab của trang chi tiết (nhập số ô) và ở bảng bên phải trang xem bản nhạc (điền theo vùng chọn).
 */
export default function CommentsSection({
  scoreId,
  focusId,
  onOpenCount,
  anchor,
  composeKey = 0,
  composeBlockedReason = null,
  onSelectThread,
  onChanged,
  viewerHref,
  compact = false,
}: Props) {
  const [filter, setFilter] = useState<CommentFilter>(focusId ? 'ALL' : 'OPEN');
  const [data, setData] = useState<ScoreComments | null>(null);
  const [composing, setComposing] = useState(false);

  const load = useCallback(() => {
    commentApi
      .list(scoreId, filter)
      .then((res) => {
        setData(res.data.result);
        onOpenCount?.(res.data.result.openCount);
        onChanged?.();
      })
      .catch((err) => toast.error(getErrorMessage(err, t('scores.comments.loadFailed'))));
  }, [scoreId, filter, onOpenCount, onChanged]);

  useEffect(load, [load]);

  // Cuộn tới góp ý được chỉ định (từ thông báo, hoặc bấm bong bóng trên bản nhạc) mỗi khi id đổi
  const focusedId = useRef<string | null>(null);
  useEffect(() => {
    if (!focusId || !data || focusedId.current === focusId) return;
    const el = document.getElementById(`cm-${focusId}`);
    if (el) {
      focusedId.current = focusId;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [focusId, data]);

  // Phím tắt ở trang xem bản nhạc: mỗi lần composeKey tăng thì mở form góp ý (điều chỉnh state khi prop đổi, không dùng effect)
  // (bảng vừa mở bằng phím tắt thì chờ tải xong rồi mới mở form)
  const [seenComposeKey, setSeenComposeKey] = useState(0);
  const [wantCompose, setWantCompose] = useState(false);
  if (composeKey !== seenComposeKey) {
    setSeenComposeKey(composeKey);
    if (composeKey > 0) setWantCompose(true);
  }
  if (wantCompose && data) {
    setWantCompose(false);
    if (data.canComment && !composeBlockedReason) setComposing(true);
  }

  const counts: Record<CommentFilter, number | null> = {
    OPEN: data?.openCount ?? null,
    RESOLVED: data?.resolvedCount ?? null,
    MENTIONED: data?.mentionedCount ?? null,
    ALL: data ? data.openCount + data.resolvedCount : null,
  };

  return (
    <section className={`cm-section${compact ? ' cm-section--panel' : ''}`} aria-label={t('scores.comments.tab')}>
      <div className="cm-toolbar">
        <div className="cm-filters" role="group" aria-label={t('scores.comments.tab')}>
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              className={`cm-filter${filter === f ? ' is-active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {t(`scores.comments.filters.${f}`)}
              {counts[f] !== null && <span className="cm-filter__count">{counts[f]}</span>}
            </button>
          ))}
        </div>
        {data?.canComment && !composing && (
          <button
            type="button"
            className="sc-btn sc-btn--primary sc-btn--sm"
            disabled={!!composeBlockedReason}
            title={composeBlockedReason ?? undefined}
            onClick={() => setComposing(true)}
          >
            {t('scores.comments.add')}
          </button>
        )}
      </div>
      <p className="cm-muted cm-hint">{t('scores.comments.hint')}</p>

      {data && !data.canComment && (
        <p className="cm-note">
          {data.measureCount ? t('scores.comments.cannotComment') : t('scores.comments.noMeasures')}
        </p>
      )}

      {data?.canComment && composeBlockedReason && <p className="cm-note">{composeBlockedReason}</p>}
      {data?.canComment && onSelectThread && !anchor && !composing && !composeBlockedReason && (
        <p className="cm-muted cm-hint">{t('scores.comments.selectHint')}</p>
      )}

      {composing && data && !composeBlockedReason && (
        <NewCommentForm
          scoreId={scoreId}
          anchor={anchor ?? null}
          measureCount={data.measureCount ?? 1}
          onCancel={() => setComposing(false)}
          onCreated={() => {
            setComposing(false);
            if (filter === 'RESOLVED') setFilter('OPEN');
            else load();
          }}
        />
      )}

      {!data && <Skeleton lines={4} />}
      {data && data.comments.length === 0 && (
        <div className="cm-empty">
          <strong>
            {data.openCount + data.resolvedCount === 0
              ? t('scores.comments.emptyTitle')
              : t('scores.comments.emptyFilter')}
          </strong>
          {data.openCount + data.resolvedCount === 0 && <span>{t('scores.comments.emptyHint')}</span>}
        </div>
      )}
      {data && data.comments.length > 0 && (
        <ol className="cm-list">
          {data.comments.map((c) => (
            <Thread
              key={c.id}
              scoreId={scoreId}
              comment={c}
              canComment={data.canComment}
              currentVersion={data.currentVersion ?? null}
              focused={focusId === c.id || (c.replies ?? []).some((r) => r.id === focusId)}
              onChanged={load}
              onSelect={onSelectThread}
              viewerHref={viewerHref?.(c) ?? null}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ viết góp ý mới

function NewCommentForm({
  scoreId,
  anchor,
  measureCount,
  onCancel,
  onCreated,
}: {
  scoreId: string;
  anchor: CommentAnchor | null;
  measureCount: number;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [start, setStart] = useState(anchor?.start ?? 1);
  const [end, setEnd] = useState(anchor?.end ?? anchor?.start ?? 1);
  // Chọn vùng khác trên bản nhạc khi form đang mở: điền lại ô từ–đến
  const [anchorKey, setAnchorKey] = useState(anchor ? `${anchor.start}-${anchor.end}` : '');
  const nextKey = anchor ? `${anchor.start}-${anchor.end}` : '';
  if (anchor && nextKey !== anchorKey) {
    setAnchorKey(nextKey);
    setStart(anchor.start);
    setEnd(anchor.end);
  }
  // Bè và nốt đã chọn chỉ gửi kèm khi ô từ–đến vẫn đúng vùng chọn (người dùng sửa tay thì bỏ)
  const fromSelection = !!anchor && anchor.start === start && anchor.end === end;
  const [content, setContent] = useState('');
  const [picked, setPicked] = useState(() => new Map<string, CommentMember>());
  const [busy, setBusy] = useState(false);
  const invalid = start < 1 || end < start || end > measureCount;

  const submit = async () => {
    if (!content.trim() || invalid || busy) return;
    setBusy(true);
    try {
      await commentApi.create(scoreId, {
        content: content.trim(),
        startMeasure: start,
        endMeasure: end,
        partId: fromSelection ? (anchor?.partId ?? null) : null,
        noteIds: fromSelection && anchor?.noteIds?.length ? anchor.noteIds : null,
        mentionIds: mentionIdsIn(content, picked),
      });
      toast.success(t('scores.comments.created'));
      onCreated();
    } catch (err) {
      toast.error(getErrorMessage(err, t('scores.comments.saveFailed')));
      setBusy(false);
    }
  };

  const clamp = (v: number) => Math.min(Math.max(Number.isFinite(v) ? v : 1, 1), measureCount);

  return (
    <form
      className="cm-compose"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="cm-range">
        <label>
          {t('scores.comments.fromMeasure')}
          <input
            type="number"
            className="sc-input"
            min={1}
            max={measureCount}
            value={start}
            onChange={(e) => {
              const v = clamp(e.target.valueAsNumber);
              setStart(v);
              if (end < v) setEnd(v);
            }}
          />
        </label>
        <label>
          {t('scores.comments.toMeasure')}
          <input
            type="number"
            className="sc-input"
            min={start}
            max={measureCount}
            value={end}
            onChange={(e) => setEnd(Math.max(clamp(e.target.valueAsNumber), start))}
          />
        </label>
        <span className="cm-muted">
          {fromSelection ? t('scores.comments.fromSelection') : t('scores.comments.measureOf', { count: measureCount })}
        </span>
      </div>
      <MentionInput
        scoreId={scoreId}
        value={content}
        onChange={setContent}
        onPick={(m) => setPicked((prev) => new Map(prev).set(m.id, m))}
        placeholder={t('scores.comments.placeholder')}
        autoFocus
        onSubmit={submit}
      />
      <div className="cm-actions">
        <button type="button" className="sc-btn sc-btn--sm" onClick={onCancel} disabled={busy}>
          {t('scores.comments.cancel')}
        </button>
        <button
          type="submit"
          className="sc-btn sc-btn--primary sc-btn--sm"
          disabled={busy || invalid || !content.trim()}
        >
          {busy ? t('scores.comments.sending') : t('scores.comments.send')}
        </button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------------------------------------ một luồng góp ý

function Thread({
  scoreId,
  comment,
  canComment,
  currentVersion,
  focused,
  onChanged,
  onSelect,
  viewerHref,
}: {
  scoreId: string;
  comment: ScoreComment;
  canComment: boolean;
  currentVersion: number | null;
  focused: boolean;
  onChanged: () => void;
  onSelect?: (comment: ScoreComment) => void;
  viewerHref: string | null;
}) {
  const resolved = comment.status === 'RESOLVED';
  const [expanded, setExpanded] = useState(!resolved || focused);
  const [replying, setReplying] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const replies = comment.replies ?? [];
  const canCompare =
    comment.outdated &&
    comment.scoreVersion != null &&
    currentVersion != null &&
    comment.scoreVersion !== currentVersion;

  const setStatus = async (status: 'OPEN' | 'RESOLVED') => {
    setBusy(true);
    try {
      await commentApi.update(comment.id, { status });
      toast.success(status === 'RESOLVED' ? t('scores.comments.resolved') : t('scores.comments.reopened'));
      onChanged();
    } catch (err) {
      toast.error(getErrorMessage(err, t('scores.comments.saveFailed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li id={`cm-${comment.id}`} className={`cm-thread${resolved ? ' is-resolved' : ''}${focused ? ' is-focused' : ''}`}>
      <div className="cm-thread__head">
        {(() => {
          const label = t('scores.comments.measure', {
            measures: measureLabel(comment.startMeasure, comment.endMeasure),
          });
          // Trang xem bản nhạc: bấm để cuộn tới vùng; trang chi tiết: mở trang xem tại góp ý
          if (onSelect)
            return (
              <button
                type="button"
                className="cm-measure cm-measure--link"
                title={t('scores.comments.showOnScore')}
                onClick={() => onSelect(comment)}
              >
                {label}
              </button>
            );
          if (viewerHref)
            return (
              <Link to={viewerHref} className="cm-measure cm-measure--link" title={t('scores.comments.openInViewer')}>
                {label}
              </Link>
            );
          return <span className="cm-measure">{label}</span>;
        })()}
        {comment.outdated && comment.scoreVersion != null && (
          <span className="cm-outdated">
            {t('scores.comments.outdated', { version: comment.scoreVersion })}
            {canCompare && (
              <button type="button" className="cm-link" onClick={() => setComparing(true)}>
                {t('scores.comments.compare')}
              </button>
            )}
          </span>
        )}
        {resolved && (
          <span className="cm-resolved">
            {comment.resolvedBy ? t('scores.comments.resolvedBy', { name: comment.resolvedBy.name }) : null}
            <button type="button" className="cm-link" onClick={() => setExpanded((v) => !v)}>
              {expanded ? t('scores.comments.hideResolved') : t('scores.comments.showResolved')}
            </button>
          </span>
        )}
      </div>

      <CommentItem
        scoreId={scoreId}
        comment={comment}
        collapsed={!expanded}
        onChanged={onChanged}
        extraActions={
          <>
            {canComment && expanded && (
              <button type="button" className="cm-link" onClick={() => setReplying(true)}>
                {t('scores.comments.reply')}
              </button>
            )}
            {comment.canResolve && (
              <button
                type="button"
                className="cm-link"
                disabled={busy}
                onClick={() => setStatus(resolved ? 'OPEN' : 'RESOLVED')}
              >
                {resolved ? t('scores.comments.reopen') : t('scores.comments.resolve')}
              </button>
            )}
          </>
        }
      />

      {expanded && replies.length > 0 && (
        <ol className="cm-replies">
          {replies.map((r) => (
            <li key={r.id} id={`cm-${r.id}`}>
              <CommentItem scoreId={scoreId} comment={r} onChanged={onChanged} />
            </li>
          ))}
        </ol>
      )}

      {expanded && replying && (
        <ReplyForm
          scoreId={scoreId}
          commentId={comment.id}
          onCancel={() => setReplying(false)}
          onSent={() => {
            setReplying(false);
            onChanged();
          }}
        />
      )}

      {comparing && comment.scoreVersion != null && currentVersion != null && (
        <CommentCompareModal
          scoreId={scoreId}
          fromVersion={comment.scoreVersion}
          currentVersion={currentVersion}
          start={comment.startMeasure ?? 1}
          end={comment.endMeasure ?? comment.startMeasure ?? 1}
          onClose={() => setComparing(false)}
        />
      )}
    </li>
  );
}

/** Một góp ý hoặc trả lời: người viết, thời gian, nội dung (tô @nhắc tên), sửa tại chỗ, xóa. */
function CommentItem({
  scoreId,
  comment,
  collapsed = false,
  onChanged,
  extraActions,
}: {
  scoreId: string;
  comment: ScoreComment;
  collapsed?: boolean;
  onChanged: () => void;
  extraActions?: React.ReactNode;
}) {
  const { confirm } = useDialog();
  const [editing, setEditing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [content, setContent] = useState(comment.content);
  const [picked, setPicked] = useState(() => new Map(comment.mentions.map((m) => [m.id, m])));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!content.trim() || busy) return;
    setBusy(true);
    try {
      await commentApi.update(comment.id, { content: content.trim(), mentionIds: mentionIdsIn(content, picked) });
      setEditing(false);
      onChanged();
    } catch (err) {
      toast.error(getErrorMessage(err, t('scores.comments.saveFailed')));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: t('scores.comments.deleteTitle'),
      message: comment.parentId ? t('scores.comments.deleteReply') : t('scores.comments.deleteRoot'),
      confirmLabel: t('scores.comments.delete'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await commentApi.remove(comment.id);
      toast.success(t('scores.comments.deleted'));
      onChanged();
    } catch (err) {
      toast.error(getErrorMessage(err, t('scores.comments.saveFailed')));
    }
  };

  return (
    <div className={`cm-item${collapsed ? ' is-collapsed' : ''}`}>
      <MemberAvatar member={comment.author} />
      <div className="cm-item__body">
        <div className="cm-item__meta">
          <strong>{comment.author.name}</strong>
          <span className="cm-muted">
            {formatRelative(comment.createdAt)}
            {comment.editedAt ? ` · ${t('scores.comments.edited')}` : ''}
          </span>
        </div>
        {editing ? (
          <>
            <MentionInput
              scoreId={scoreId}
              value={content}
              onChange={setContent}
              onPick={(m) => setPicked((prev) => new Map(prev).set(m.id, m))}
              autoFocus
              onSubmit={save}
            />
            <div className="cm-actions">
              <button
                type="button"
                className="sc-btn sc-btn--sm"
                onClick={() => {
                  setEditing(false);
                  setContent(comment.content);
                }}
                disabled={busy}
              >
                {t('scores.comments.cancel')}
              </button>
              <button
                type="button"
                className="sc-btn sc-btn--primary sc-btn--sm"
                onClick={save}
                disabled={busy || !content.trim()}
              >
                {t('scores.comments.save')}
              </button>
            </div>
          </>
        ) : (
          <p className="cm-item__text">
            {splitMentions(comment.content, comment.mentions).map((part, i) =>
              part.mention ? (
                <span key={i} className="cm-mention">
                  {part.text}
                </span>
              ) : (
                <span key={i}>{part.text}</span>
              ),
            )}
          </p>
        )}
        {!editing && !collapsed && (
          <div className="cm-item__actions">
            {extraActions}
            {comment.canEdit && (
              <button type="button" className="cm-link" onClick={() => setEditing(true)}>
                {t('scores.comments.edit')}
              </button>
            )}
            {comment.canDelete && (
              <button type="button" className="cm-link cm-link--danger" onClick={remove}>
                {t('scores.comments.delete')}
              </button>
            )}
            {!comment.canEdit && (
              <button type="button" className="cm-link" onClick={() => setReporting(true)}>
                {t('scores.report.commentLink')}
              </button>
            )}
          </div>
        )}
        {!editing && collapsed && extraActions && <div className="cm-item__actions">{extraActions}</div>}
      </div>
      {reporting && (
        <ReportModal
          title={t('scores.report.commentTitle')}
          onSubmit={(payload) => reportApi.reportComment(comment.id, payload)}
          onClose={() => setReporting(false)}
        />
      )}
    </div>
  );
}

function ReplyForm({
  scoreId,
  commentId,
  onCancel,
  onSent,
}: {
  scoreId: string;
  commentId: string;
  onCancel: () => void;
  onSent: () => void;
}) {
  const [content, setContent] = useState('');
  const [picked, setPicked] = useState(() => new Map<string, CommentMember>());
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!content.trim() || busy) return;
    setBusy(true);
    try {
      await commentApi.reply(commentId, { content: content.trim(), mentionIds: mentionIdsIn(content, picked) });
      onSent();
    } catch (err) {
      toast.error(getErrorMessage(err, t('scores.comments.saveFailed')));
      setBusy(false);
    }
  };

  return (
    <div className="cm-reply-form">
      <MentionInput
        scoreId={scoreId}
        value={content}
        onChange={setContent}
        onPick={(m) => setPicked((prev) => new Map(prev).set(m.id, m))}
        placeholder={t('scores.comments.replyPlaceholder')}
        rows={2}
        autoFocus
        onSubmit={submit}
      />
      <div className="cm-actions">
        <button type="button" className="sc-btn sc-btn--sm" onClick={onCancel} disabled={busy}>
          {t('scores.comments.cancel')}
        </button>
        <button
          type="button"
          className="sc-btn sc-btn--primary sc-btn--sm"
          onClick={submit}
          disabled={busy || !content.trim()}
        >
          {busy ? t('scores.comments.sending') : t('scores.comments.sendReply')}
        </button>
      </div>
    </div>
  );
}
