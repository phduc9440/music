import { useCallback, useEffect, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { noteIdsFromEvent } from '../../../../components/editor/core/osmdBridge';
import type { ScoreDocument } from '../../../../components/editor/core/ScoreDocument';
import type { ContextMenuState } from '../../../../components/scores/comments/ViewerCommentTools';
import type { ScoreComments } from './useScoreComments';

interface EditorLike {
  selection: ReadonlySet<string>;
  select: (ids: readonly string[], additive: boolean) => void;
  clearSelection: () => void;
}

/** Menu chuột phải trên bản nhạc: chỗ bấm, ô nhịp và id nốt dưới con trỏ (rỗng = bấm ra ngoài nốt). */
export type EditorContextMenuState = ContextMenuState & { hitIds: string[] };

/**
 * Chuột phải vào nốt: chọn nốt đó (nếu chưa nằm trong vùng đang chọn) rồi hiện menu sửa / góp ý. Người sửa được có
 * menu cả khi bấm ra ngoài nốt (thêm ô, hoàn tác...); người chỉ xem thì ngoài nốt vẫn là menu của trình duyệt.
 * Người chỉ nhận xét không có phím tắt của Editor: Esc bỏ chọn (khi không có ô nhập / menu đang mở).
 */
export function useEditorContextMenu(
  doc: ScoreDocument,
  canEdit: boolean,
  editor: EditorLike,
  comments: ScoreComments,
) {
  const [contextMenu, setContextMenu] = useState<EditorContextMenuState | null>(null);
  const { canComment, composer, setComposer, openThreads } = comments;

  const onStageContextMenu = (e: ReactMouseEvent<HTMLDivElement>) => {
    const ids = noteIdsFromEvent(e.nativeEvent);
    if (ids.length === 0 && !canEdit) return;
    if ((e.target as Element).closest('input, textarea, .ed-pop, .cm-popover')) return;
    e.preventDefault();
    if (ids.length > 0 && (canEdit || canComment)) {
      if (!ids.some((id) => editor.selection.has(id))) editor.select(ids, false);
    }
    const info = ids.length > 0 ? doc.getInfo(ids[0]) : undefined;
    setComposer(null);
    setContextMenu({ x: e.clientX, y: e.clientY, measureIndex: info ? info.measureIndex : null, hitIds: ids });
  };

  const threadsAtMenu =
    contextMenu?.measureIndex == null
      ? []
      : openThreads.filter(
          (c) =>
            c.startMeasure != null &&
            contextMenu.measureIndex! + 1 >= c.startMeasure &&
            contextMenu.measureIndex! + 1 <= (c.endMeasure ?? c.startMeasure),
        );
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  useEffect(() => {
    if (canEdit) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || composer || contextMenu) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      editor.clearSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canEdit, composer, contextMenu, editor]);

  return { contextMenu, onStageContextMenu, threadsAtMenu, closeContextMenu };
}
