import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { editFailureMessage } from './commands';
import type { EditResult } from './commands';
import type { DurationChoice } from '../notes/durations';
import { DRAFT_PREFIX, SUGGEST_DRAFT_PREFIX } from './draft';
import { describeSelection } from './describe';
import { History } from './history';
import { checkMeasures } from '../structure/measureCheck';
import { selectionGroups } from '../audio/playback';
import { loadPreviewTonePref, playPreviewGroups, savePreviewTonePref } from '../audio/previewTone';
import { t } from '../../../i18n/core';
import type { EditorCore, Notice, ScoreEditor, UseScoreEditorOptions } from './scoreEditorTypes';
import { useDraftGuard } from './useDraftGuard';
import { useEditorSelection } from './useEditorSelection';
import { useEditorShortcuts } from './useEditorShortcuts';
import { useInputModes } from './useInputModes';
import { useLiveSync } from './useLiveSync';
import { useNoteCommands } from './useNoteCommands';
import { useSaveFlow } from './useSaveFlow';
import { useStructureCommands } from './useStructureCommands';

export type { EditorCore, Notice, ScoreEditor, UseScoreEditorOptions } from './scoreEditorTypes';

/** Thời gian hiện thông báo ngắn trên thanh trạng thái (ms). */
const NOTICE_MS = 2500;

/**
 * Trạng thái và thao tác của trình chỉnh sửa bản nhạc. Ghép các phần: vùng chọn, chế độ nhập, lệnh nốt, lệnh cấu trúc,
 * cùng sửa, lưu / xung đột, bản nháp và phím tắt; ở đây giữ lịch sử hoàn tác và hàm `commit` dùng chung.
 */
export function useScoreEditor(options: UseScoreEditorOptions): ScoreEditor {
  const {
    scoreId,
    title,
    doc,
    initialVersion,
    canEdit,
    canForce,
    blocked,
    mode = 'direct',
    onSuggest,
    live = null,
  } = options;
  const liveActive = live?.active ?? false;
  const liveRef = useRef(live);
  useEffect(() => {
    liveRef.current = live;
  });
  const draftPrefix = mode === 'suggest' ? SUGGEST_DRAFT_PREFIX : DRAFT_PREFIX;
  const historyRef = useRef(new History());
  const allowLeaveRef = useRef(false);

  const [revision, setRevision] = useState(0);
  const [flags, setFlags] = useState({ dirty: false, canUndo: false, canRedo: false });
  const [version, setVersion] = useState(initialVersion);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [inputDuration, setInputDuration] = useState<DurationChoice>({ type: 'quarter', dots: 0 });
  const [previewTone, setPreviewToneState] = useState(loadPreviewTonePref);
  const selector = useEditorSelection(doc);
  const { selection, setSelection, select, clearSelection } = selector;

  const issues = useMemo(() => {
    void revision; // DOM sửa tại chỗ nên phải tính lại khi revision đổi
    return checkMeasures(doc);
  }, [doc, revision]);
  const statusText = useMemo(() => {
    void revision;
    return describeSelection(doc, selection);
  }, [doc, selection, revision]);

  const flash = useCallback((text: string) => {
    setNotice((prev) => ({ text, key: (prev?.key ?? 0) + 1 }));
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  /** Đồng bộ cờ từ lịch sử và báo cho canvas vẽ lại. */
  const sync = useCallback(() => {
    const h = historyRef.current;
    setFlags({ dirty: h.dirty, canUndo: h.canUndo, canRedo: h.canRedo });
    setRevision((r) => r + 1);
  }, []);

  const { heldByOther } = useLiveSync({
    live,
    liveRef,
    doc,
    selection,
    revision,
    historyRef,
    sync,
    setSelection,
    setVersion,
    flash,
  });

  const setPreviewTone = useCallback((enabled: boolean) => {
    setPreviewToneState(enabled);
    savePreviewTonePref(enabled);
  }, []);

  /**
   * Chạy một lệnh sửa: báo lỗi nếu thất bại; thành công thì ghi lịch sử, bỏ khỏi vùng chọn những nốt không còn tồn
   * tại (sau khi xóa) và phát âm xem trước cho cả vùng vừa sửa.
   */
  const commit = useCallback(
    (result: EditResult, preview: boolean) => {
      if (!result.ok) {
        const message = editFailureMessage(result.reason);
        flash(message);
        toast.warn(message, { toastId: `edit-${result.reason}` });
        return;
      }
      if (heldByOther(result.command)) {
        // Lệnh đã sửa DOM: trả các ô về như cũ rồi bỏ lệnh
        for (const s of result.command.snapshots) {
          doc.replaceMeasure(s.partIndex, s.measureIndex, s.before.cloneNode(true) as Element, false);
        }
        if (result.command.head) doc.restoreHead(result.command.head.before);
        if (result.command.parts) doc.restoreParts(result.command.parts.before);
        doc.reindex();
        sync();
        return;
      }
      historyRef.current.push(result.command);
      liveRef.current?.session?.enqueue(result.command, 'do');
      sync();
      const after = result.command.selectAfter;
      setSelection((prev) =>
        after ? new Set(after) : new Set([...prev].filter((id) => doc.getInfo(id) !== undefined)),
      );
      if (preview && previewTone) playPreviewGroups(selectionGroups(doc, result.command.changedIds));
    },
    [doc, flash, sync, previewTone, heldByOther, setSelection],
  );

  const core: EditorCore = { doc, canEdit, selection, setSelection, commit, flash };
  const modes = useInputModes(core);
  const { inputMode } = modes;
  const notes = useNoteCommands(core, { inputMode, inputDuration, setInputDuration });
  const structure = useStructureCommands(core, setInputDuration);

  const undo = useCallback(() => {
    if (!canEdit || !historyRef.current.canUndo || heldByOther(historyRef.current.nextUndo)) return;
    const label = historyRef.current.undoLabel;
    const command = historyRef.current.undo(doc);
    if (command) liveRef.current?.session?.enqueue(command, 'undo');
    sync();
    setSelection((prev) => new Set([...prev].filter((id) => doc.getInfo(id) !== undefined)));
    flash(t('editor.flash.undone', { label }));
  }, [canEdit, doc, sync, flash, heldByOther, setSelection]);

  const redo = useCallback(() => {
    if (!canEdit || !historyRef.current.canRedo || heldByOther(historyRef.current.nextRedo)) return;
    const label = historyRef.current.redoLabel;
    const command = historyRef.current.redo(doc);
    if (command) liveRef.current?.session?.enqueue(command, 'redo');
    sync();
    setSelection((prev) => new Set([...prev].filter((id) => doc.getInfo(id) !== undefined)));
    flash(t('editor.flash.redone', { label }));
  }, [canEdit, doc, sync, flash, heldByOther, setSelection]);

  const saveFlow = useSaveFlow({
    canEdit,
    canForce,
    doc,
    scoreId,
    title,
    version,
    setVersion,
    mode,
    onSuggest,
    draftPrefix,
    historyRef,
    liveRef,
    allowLeaveRef,
    setFlags,
    setSelection,
    sync,
    flash,
  });
  const drafts = useDraftGuard({
    canEdit,
    scoreId,
    initialVersion,
    version,
    doc,
    draftPrefix,
    live,
    liveRef,
    dirty: flags.dirty,
    historyRef,
    allowLeaveRef,
    setSelection,
    sync,
  });

  useEditorShortcuts({
    ...modes,
    ...notes,
    ...structure,
    ...selector,
    canEdit,
    blocked,
    conflict: saveFlow.conflict,
    draft: drafts.draft,
    save: saveFlow.save,
    undo,
    redo,
  });

  return {
    ...selector,
    ...modes,
    ...notes,
    ...structure,
    ...saveFlow,
    ...drafts,
    revision,
    dirty: liveActive ? (live?.state.pending ?? 0) > 0 : flags.dirty,
    version,
    canUndo: flags.canUndo,
    canRedo: flags.canRedo,
    issues,
    statusText,
    notice,
    previewTone,
    setPreviewTone,
    select,
    clearSelection,
    inputDuration,
    undo,
    redo,
  };
}
