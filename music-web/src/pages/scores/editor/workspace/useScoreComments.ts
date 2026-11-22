import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CommentRange } from '../../../../components/scores/viewer/ScoreCanvas';
import { anchorFromNotes } from '../../../../components/scores/comments/viewerAnchor';
import type { ScreenRect } from '../../../../components/scores/comments/ViewerCommentTools';
import type { CommentAnchor } from '../../../../components/scores/comments/commentUtils';
import { SELECTED_CLASS } from '../../../../components/editor/core/osmdBridge';
import type { ScoreDocument } from '../../../../components/editor/core/ScoreDocument';
import { commentApi } from '../../../../services';
import type { ScoreComment } from '../../../../types';
import { t } from '../../../../i18n/core';

interface Options {
  scoreId: string;
  doc: ScoreDocument;
  canEdit: boolean;
  selection: ReadonlySet<string>;
  /** Vùng chọn mới nhất (đọc trong sự kiện cuộn mà không cần đăng ký lại listener). */
  selectionRef: MutableRefObject<ReadonlySet<string>>;
  revision: number;
  dirty: boolean;
  /** Thu phóng / chế độ xem: bản nhạc vẽ lại nên phải đo lại khung vùng chọn. */
  zoom: number;
  mode: string;
  /** Cuộn bản nhạc tới một ô nhịp (chỉ số từ 0). */
  focusMeasure: (index: number) => void;
  /** Khung chứa bản nhạc, để đo vùng chọn trên màn hình. */
  stageRef: RefObject<HTMLDivElement | null>;
  /** Gọi mỗi khi bảng Góp ý được mở (để đóng bảng khác dùng chung cột phải, ví dụ Hợp âm AI). */
  onPanelOpen?: () => void;
}

/**
 * Góp ý gắn vào ô nhịp (mục 4.2): danh sách góp ý đang mở, bảng Góp ý, ô nhập góp ý nổi cạnh vùng chọn và nút "Góp ý"
 * nổi. ?comment=ID (từ trang chi tiết): mở bảng và cuộn tới góp ý đó.
 */
export function useScoreComments(o: Options) {
  const {
    scoreId,
    doc,
    canEdit,
    selection,
    selectionRef,
    revision,
    dirty,
    zoom,
    mode,
    focusMeasure,
    stageRef,
    onPanelOpen,
  } = o;
  const [searchParams] = useSearchParams();
  const linkedComment = searchParams.get('comment');
  const [commentsOpen, setCommentsOpen] = useState(!!linkedComment);
  const [focusCommentId, setFocusCommentId] = useState<string | null>(linkedComment);
  const [openThreads, setOpenThreads] = useState<ScoreComment[]>([]);
  const [canComment, setCanComment] = useState(false);
  const [composeKey, setComposeKey] = useState(0);
  /** Khung bao vùng đang bôi đen (toạ độ màn hình) để đặt nút "Góp ý" nổi; null khi không có vùng chọn hiện trên màn hình. */
  const [selRect, setSelRect] = useState<ScreenRect | null>(null);
  /** Ô nhập góp ý nổi cạnh vùng chọn (mở từ nút nổi hoặc menu chuột phải). */
  const [composer, setComposer] = useState<{ anchor: CommentAnchor; rect: ScreenRect } | null>(null);

  const focusMeasureRef = useRef(focusMeasure);
  const onPanelOpenRef = useRef(onPanelOpen);
  useEffect(() => {
    focusMeasureRef.current = focusMeasure;
    onPanelOpenRef.current = onPanelOpen;
  });

  // Góp ý đang mở để tô nền trên bản nhạc; tải lại mỗi khi bảng Góp ý đổi (thêm, xử lý, xóa).
  // Lần đầu: nếu mở từ đường dẫn ?comment=ID thì cuộn bản nhạc tới vùng của góp ý đó.
  const linkedScrolled = useRef(false);
  const refreshComments = useCallback(() => {
    commentApi
      .list(scoreId, 'OPEN')
      .then((res) => {
        const { comments, canComment: allowed } = res.data.result;
        setOpenThreads(comments);
        setCanComment(allowed);
        if (linkedComment && !linkedScrolled.current) {
          linkedScrolled.current = true;
          const target = comments.find((c) => c.id === linkedComment);
          if (target?.startMeasure != null) focusMeasureRef.current(target.startMeasure - 1);
        }
      })
      .catch(() => undefined);
  }, [scoreId, linkedComment]);
  useEffect(refreshComments, [refreshComments]);

  const commentRanges = useMemo<CommentRange[]>(
    () =>
      openThreads
        .filter((c) => c.startMeasure != null)
        .map((c) => ({
          id: c.id,
          start: (c.startMeasure as number) - 1,
          end: (c.endMeasure ?? c.startMeasure ?? 1) - 1,
          active: c.id === focusCommentId,
        })),
    [openThreads, focusCommentId],
  );

  // Vùng neo cho góp ý mới: các nốt đang bôi đen (người sửa và người nhận xét chọn nốt như nhau)
  const commentAnchor = useMemo<CommentAnchor | null>(() => anchorFromNotes(doc, selection), [doc, selection]);
  const commentBlocked = canEdit && dirty ? t('scores.comments.saveFirst') : null;

  // Khung bao các nốt đang chọn trên màn hình: tính lại khi chọn khác, đổi zoom / chế độ, sửa, cuộn, đổi cỡ cửa sổ
  const measureSelection = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || selectionRef.current.size === 0) {
      setSelRect(null);
      return;
    }
    let rect: ScreenRect | null = null;
    stage.querySelectorAll(`.${SELECTED_CLASS}`).forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      rect = rect
        ? {
            left: Math.min(rect.left, r.left),
            top: Math.min(rect.top, r.top),
            right: Math.max(rect.right, r.right),
            bottom: Math.max(rect.bottom, r.bottom),
          }
        : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    });
    // Vùng chọn đã cuộn ra ngoài khung nhạc thì ẩn nút
    const box = stage.getBoundingClientRect();
    const visible =
      rect !== null &&
      (rect as ScreenRect).bottom > box.top &&
      (rect as ScreenRect).top < box.bottom &&
      (rect as ScreenRect).right > box.left &&
      (rect as ScreenRect).left < box.right;
    setSelRect(visible ? rect : null);
  }, [selectionRef, stageRef]);
  useEffect(() => {
    // Bản nhạc vẽ lại sau ~200ms khi đổi zoom / chế độ: đo ngay và đo lại sau khi vẽ xong
    const frame = requestAnimationFrame(measureSelection);
    const timer = setTimeout(measureSelection, 400);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [selection, revision, zoom, mode, commentsOpen, measureSelection]);
  useEffect(() => {
    window.addEventListener('scroll', measureSelection, true);
    window.addEventListener('resize', measureSelection);
    return () => {
      window.removeEventListener('scroll', measureSelection, true);
      window.removeEventListener('resize', measureSelection);
    };
  }, [measureSelection]);

  /**
   * Mở ô nhập góp ý nổi cho vùng đang chọn, cạnh `rect` (vùng chọn, hoặc chỗ bấm chuột phải).
   * @returns false nếu không góp ý được (chưa chọn, không có quyền, còn thay đổi chưa lưu)
   */
  const openComposer = (rect: ScreenRect | null): boolean => {
    if (!commentAnchor || !canComment || commentBlocked) return false;
    setComposer({ anchor: commentAnchor, rect: rect ?? selRect ?? { left: 200, top: 160, right: 200, bottom: 160 } });
    return true;
  };

  // Ctrl/Cmd + Alt + M: mở bảng Góp ý và form góp ý cho vùng đang chọn (dùng e.code vì Alt+M trên Mac ra ký tự khác)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !e.altKey || e.code !== 'KeyM') return;
      e.preventDefault();
      onPanelOpenRef.current?.();
      setCommentsOpen(true);
      setComposeKey((k) => k + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Đóng bảng thì đặt lại bộ đếm phím tắt để lần mở sau (bằng nút) không tự mở form
  const closeComments = () => {
    setCommentsOpen(false);
    setComposeKey(0);
  };

  const selectThread = useCallback((c: ScoreComment) => {
    setFocusCommentId(c.id);
    if (c.startMeasure != null) focusMeasureRef.current(c.startMeasure - 1);
  }, []);

  /** Mở bảng Góp ý (nút trên thanh công cụ). */
  const openComments = () => {
    onPanelOpenRef.current?.();
    setCommentsOpen(true);
  };

  /** Mở bảng Góp ý và làm nổi một góp ý. */
  const showThread = (id: string | undefined) => {
    onPanelOpenRef.current?.();
    setCommentsOpen(true);
    if (id) setFocusCommentId(id);
  };

  return {
    commentsOpen,
    openComments,
    closeComments,
    focusCommentId,
    setFocusCommentId,
    openThreads,
    canComment,
    composeKey,
    selRect,
    composer,
    setComposer,
    openComposer,
    refreshComments,
    commentRanges,
    commentAnchor,
    commentBlocked,
    selectThread,
    showThread,
  };
}

export type ScoreComments = ReturnType<typeof useScoreComments>;
