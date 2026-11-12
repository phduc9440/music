import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { commentApi } from '../../../services';
import type { CommentMember, ScoreComment } from '../../../types';
import { getErrorMessage } from '../../../utils/score';
import { t } from '../../../i18n/core';
import MentionInput from './MentionInput';
import { measureLabel, mentionIdsIn } from './commentUtils';
import type { CommentAnchor } from './commentUtils';

/** Hình chữ nhật trên màn hình (toạ độ viewport) để đặt nút / ô nhập nổi cạnh vùng chọn. */
export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const GAP = 8;

/** Giữ một khung nổi trong màn hình: thử đặt dưới vùng, không đủ chỗ thì đặt lên trên. */
const placeNear = (rect: ScreenRect, width: number, height: number) => {
  const left = Math.min(Math.max(GAP, rect.left), window.innerWidth - width - GAP);
  const below = rect.bottom + GAP;
  const top = below + height <= window.innerHeight - GAP ? below : Math.max(GAP, rect.top - height - GAP);
  return { left, top };
};

/** Nút "Góp ý" nổi ở góc trên bên phải vùng đang bôi đen trên bản nhạc. */
export function SelectionCommentButton({ rect, onClick }: { rect: ScreenRect; onClick: () => void }) {
  const left = Math.min(rect.right + 6, window.innerWidth - 110);
  const top = Math.max(GAP, rect.top - 38);
  return (
    <button
      type="button"
      className="cm-float"
      style={{ left, top }}
      // Không để khung nhạc coi là bấm ra ngoài (bỏ chọn)
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
    >
      <span aria-hidden="true">💬</span> {t('scores.comments.commentHere')}
    </button>
  );
}

export interface ContextMenuState {
  x: number;
  y: number;
  /** Chỉ số ô (từ 0) của nốt được bấm chuột phải. */
  measureIndex: number | null;
}

/** Menu chuột phải trên bản nhạc: Góp ý vào vùng đang chọn, Xem góp ý ở ô này (nếu có). */
export function CommentContextMenu({
  menu,
  canComment,
  blockedReason,
  threadsHere,
  onComment,
  onShowThreads,
  onClose,
}: {
  menu: ContextMenuState;
  canComment: boolean;
  blockedReason: string | null;
  threadsHere: ScoreComment[];
  onComment: () => void;
  onShowThreads: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const pos = placeNear({ left: menu.x, top: menu.y, right: menu.x, bottom: menu.y }, 230, 96);
  const disabledReason = !canComment ? t('scores.comments.contextNoAccess') : blockedReason;
  return (
    <div ref={ref} className="cm-menu" role="menu" style={pos} onContextMenu={(e) => e.preventDefault()}>
      <button
        type="button"
        role="menuitem"
        className="cm-menu__item"
        disabled={!!disabledReason}
        title={disabledReason ?? undefined}
        onClick={onComment}
      >
        <span aria-hidden="true">💬</span> {t('scores.comments.contextComment')}
      </button>
      {disabledReason && <div className="cm-menu__hint">{disabledReason}</div>}
      {threadsHere.length > 0 && menu.measureIndex !== null && (
        <button type="button" role="menuitem" className="cm-menu__item" onClick={onShowThreads}>
          <span aria-hidden="true">🗂</span>{' '}
          {t('scores.comments.contextView', { measure: menu.measureIndex + 1, count: threadsHere.length })}
        </button>
      )}
    </div>
  );
}

/**
 * Ô nhập góp ý nổi ngay cạnh vùng đang chọn (mục 4.2: "ô nhập nổi cạnh vùng"): nội dung có gợi ý @nhắc tên, Ctrl/Cmd+Enter
 * để gửi, Esc để đóng. Vùng neo (ô, bè, nốt) lấy từ vùng chọn lúc mở.
 */
export function InlineCommentComposer({
  scoreId,
  anchor,
  rect,
  onClose,
  onCreated,
}: {
  scoreId: string;
  anchor: CommentAnchor;
  rect: ScreenRect;
  onClose: () => void;
  onCreated: (comment: ScoreComment) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [content, setContent] = useState('');
  const [picked, setPicked] = useState(() => new Map<string, CommentMember>());
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState(() => placeNear(rect, 340, 210));

  // Đo chiều cao thật sau khi vẽ để không tràn khỏi màn hình
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 210;
    setPos(placeNear(rect, 340, h));
  }, [rect]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async () => {
    if (!content.trim() || busy) return;
    setBusy(true);
    try {
      const res = await commentApi.create(scoreId, {
        content: content.trim(),
        startMeasure: anchor.start,
        endMeasure: anchor.end,
        partId: anchor.partId ?? null,
        noteIds: anchor.noteIds?.length ? anchor.noteIds : null,
        mentionIds: mentionIdsIn(content, picked),
      });
      toast.success(t('scores.comments.created'));
      onCreated(res.data.result);
    } catch (err) {
      toast.error(getErrorMessage(err, t('scores.comments.saveFailed')));
      setBusy(false);
    }
  };

  return (
    <div
      ref={ref}
      className="cm-popover"
      role="dialog"
      aria-label={t('scores.comments.composerTitle', { measures: measureLabel(anchor.start, anchor.end) })}
      style={pos}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="cm-popover__head">
        <span className="cm-measure">
          {t('scores.comments.measure', { measures: measureLabel(anchor.start, anchor.end) })}
        </span>
        <button type="button" className="cm-popover__close" onClick={onClose} aria-label={t('scores.comments.cancel')}>
          ×
        </button>
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
      <span className="cm-muted cm-popover__hint">{t('scores.comments.sendHint')}</span>
      <div className="cm-actions">
        <button type="button" className="sc-btn sc-btn--sm" onClick={onClose} disabled={busy}>
          {t('scores.comments.cancel')}
        </button>
        <button
          type="button"
          className="sc-btn sc-btn--primary sc-btn--sm"
          onClick={submit}
          disabled={busy || !content.trim()}
        >
          {busy ? t('scores.comments.sending') : t('scores.comments.send')}
        </button>
      </div>
    </div>
  );
}
