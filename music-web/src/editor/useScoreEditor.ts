/**
 * Hook trung tâm của trình chỉnh sửa cao độ: giữ vùng chọn, lịch sử hoàn tác, trạng thái lưu, bản nháp và xung đột
 * phiên bản. DOM MusicXML nằm trong {@link ScoreDocument} (đối tượng ổn định, sửa tại chỗ) nên React chỉ giữ
 * `revision` tăng dần để biết khi nào phải vẽ lại, không tạo lại object mỗi lần.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { saveMusicXml } from '../services';
import { getConflictVersion, getSaveErrorMessage } from '../utils/score';
import { EDIT_FAILURE_MESSAGES, changePitch } from './commands';
import { DRAFT_INTERVAL_MS, clearDraft, loadDraft, saveDraft } from './draft';
import type { Draft } from './draft';
import { describeSelection } from './describe';
import { History } from './history';
import { checkMeasures } from './measureCheck';
import type { MeasureIssue } from './measureCheck';
import type { PitchOp } from './pitch';
import { loadPreviewTonePref, playPreviewTone, savePreviewTonePref } from './previewTone';
import type { ScoreDocument } from './ScoreDocument';

/** Thời gian hiện thông báo ngắn trên thanh trạng thái (ms). */
const NOTICE_MS = 2500;

export interface UseScoreEditorOptions {
  scoreId: string;
  /** Tên bản nhạc, dùng đặt tên file khi tải bản của người dùng về máy. */
  title: string;
  doc: ScoreDocument;
  /** Phiên bản MusicXML web đang giữ (từ `currentVersion` của BE). */
  initialVersion: number;
  /** false: chỉ xem, mọi thao tác sửa bị tắt. */
  canEdit: boolean;
  /** Được ghi đè khi xung đột (chủ sở hữu hoặc ADMIN). */
  canForce: boolean;
  /** true khi có hộp thoại khác đang mở: tạm tắt phím tắt sửa. */
  blocked: boolean;
}

/** Thông báo ngắn; `key` đổi mỗi lần để giao diện chạy lại hiệu ứng rung. */
export interface Notice {
  text: string;
  key: number;
}

export interface ScoreEditor {
  selection: ReadonlySet<string>;
  /** Tăng sau mỗi thay đổi nội dung (sửa, hoàn tác, làm lại, khôi phục nháp) để vẽ lại bản nhạc. */
  revision: number;
  dirty: boolean;
  saving: boolean;
  version: number;
  canUndo: boolean;
  canRedo: boolean;
  /** Các ô nhịp sai độ dài. */
  issues: MeasureIssue[];
  /** Mô tả vùng chọn cho thanh trạng thái. */
  statusText: string;
  notice: Notice | null;
  previewTone: boolean;
  setPreviewTone: (enabled: boolean) => void;
  /** Khác null khi BE báo lỗi 2014: phiên bản mới nhất ở máy chủ (0 nếu không rõ). */
  conflict: { latestVersion: number } | null;
  /** Bản nháp chờ người dùng quyết định khôi phục hay bỏ. */
  draft: Draft | null;
  select: (ids: readonly string[], additive: boolean) => void;
  clearSelection: () => void;
  applyPitch: (op: PitchOp) => void;
  undo: () => void;
  redo: () => void;
  save: (force?: boolean) => Promise<void>;
  restoreDraft: () => void;
  discardDraft: () => void;
  /** Xung đột: bỏ thay đổi của tôi, tải lại bản mới nhất. */
  reloadLatest: () => void;
  /** Xung đột: lưu đè bằng `force=true`. */
  overwrite: () => Promise<void>;
  /** Xung đột: tải bản của tôi về máy dưới dạng .musicxml. */
  downloadMine: () => void;
  dismissConflict: () => void;
  /** Hỏi xác nhận nếu còn thay đổi chưa lưu; true nếu được phép rời trang. */
  confirmLeave: () => boolean;
}

export function useScoreEditor(options: UseScoreEditorOptions): ScoreEditor {
  const { scoreId, title, doc, initialVersion, canEdit, canForce, blocked } = options;
  const historyRef = useRef(new History());
  const savingRef = useRef(false);
  const allowLeaveRef = useRef(false);
  const draftWarnedRef = useRef(false);

  const [revision, setRevision] = useState(0);
  const [selection, setSelection] = useState<ReadonlySet<string>>(() => new Set());
  const [flags, setFlags] = useState({ dirty: false, canUndo: false, canRedo: false });
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState(initialVersion);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [previewTone, setPreviewToneState] = useState(loadPreviewTonePref);
  const [conflict, setConflict] = useState<{ latestVersion: number } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(() => {
    if (!canEdit) return null;
    const found = loadDraft(scoreId, initialVersion);
    return found && found.xml !== doc.serialize() ? found : null;
  });

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

  const setPreviewTone = useCallback((enabled: boolean) => {
    setPreviewToneState(enabled);
    savePreviewTonePref(enabled);
  }, []);

  const select = useCallback((ids: readonly string[], additive: boolean) => {
    setSelection((prev) => {
      if (!additive) return new Set(ids);
      const next = new Set(prev);
      const allIn = ids.length > 0 && ids.every((id) => next.has(id));
      for (const id of ids) {
        if (allIn) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelection(new Set()), []);

  /** Chọn nốt kế tiếp / trước đó theo thứ tự thời gian (Tab / Shift+Tab). */
  const selectRelative = useCallback(
    (delta: 1 | -1) => {
      const heads = doc.notes
        .filter((n) => n.chordIndex === 0 && !n.isRest && !n.isGrace)
        .sort(
          (a, b) =>
            a.measureIndex - b.measureIndex || a.onsetKey - b.onsetKey || a.staff - b.staff || a.voice - b.voice,
        );
      if (heads.length === 0) return;
      const currentIds = new Set(selection);
      const current = heads.findIndex((n) => currentIds.has(n.id));
      const index =
        current < 0 ? (delta > 0 ? 0 : heads.length - 1) : Math.min(heads.length - 1, Math.max(0, current + delta));
      const head = heads[index];
      const ids = doc.notes
        .filter(
          (n) =>
            n.partIndex === head.partIndex &&
            n.measureIndex === head.measureIndex &&
            n.staff === head.staff &&
            n.voice === head.voice &&
            n.entryIndex === head.entryIndex,
        )
        .map((n) => n.id);
      setSelection(new Set(ids));
    },
    [doc, selection],
  );

  const applyPitch = useCallback(
    (op: PitchOp) => {
      if (!canEdit || selection.size === 0) return;
      const result = changePitch(doc, [...selection], op);
      if (!result.ok) {
        flash(EDIT_FAILURE_MESSAGES[result.reason]);
        return;
      }
      historyRef.current.push(result.command);
      sync();
      if (previewTone) {
        const first = [...selection].map((id) => doc.getInfo(id)).find((n) => n?.midi != null);
        if (first?.midi != null) playPreviewTone(first.midi);
      }
    },
    [canEdit, selection, doc, flash, sync, previewTone],
  );

  const undo = useCallback(() => {
    if (!canEdit || !historyRef.current.canUndo) return;
    const label = historyRef.current.undoLabel;
    historyRef.current.undo(doc);
    sync();
    flash(`Đã hoàn tác: ${label}`);
  }, [canEdit, doc, sync, flash]);

  const redo = useCallback(() => {
    if (!canEdit || !historyRef.current.canRedo) return;
    const label = historyRef.current.redoLabel;
    historyRef.current.redo(doc);
    sync();
    flash(`Đã làm lại: ${label}`);
  }, [canEdit, doc, sync, flash]);

  const save = useCallback(
    async (force = false) => {
      if (!canEdit || savingRef.current) return;
      if (!force && !historyRef.current.dirty) {
        flash('Không có thay đổi để lưu');
        return;
      }
      savingRef.current = true;
      setSaving(true);
      const position = historyRef.current.position;
      try {
        const result = await saveMusicXml(scoreId, doc.serialize(), version, force);
        historyRef.current.markSaved(position);
        clearDraft(scoreId, version);
        setVersion(result.version);
        setConflict(null);
        setFlags({
          dirty: historyRef.current.dirty,
          canUndo: historyRef.current.canUndo,
          canRedo: historyRef.current.canRedo,
        });
        toast.success(`Đã lưu (phiên bản ${result.version})`);
      } catch (err) {
        const latest = getConflictVersion(err);
        if (latest !== undefined) setConflict({ latestVersion: latest });
        else toast.error(getSaveErrorMessage(err));
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [canEdit, doc, scoreId, version, flash],
  );

  const overwrite = useCallback(async () => {
    if (!canForce) return;
    await save(true);
  }, [canForce, save]);

  const reloadLatest = useCallback(() => {
    clearDraft(scoreId, version);
    allowLeaveRef.current = true;
    window.location.reload();
  }, [scoreId, version]);

  const downloadMine = useCallback(() => {
    const blob = new Blob([doc.serialize()], { type: 'application/vnd.recordare.musicxml+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[\\/:*?"<>|]/g, '_') || 'ban-nhac'}.musicxml`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [doc, title]);

  const dismissConflict = useCallback(() => setConflict(null), []);

  const restoreDraft = useCallback(() => {
    if (!draft) return;
    try {
      doc.restore(draft.xml);
      historyRef.current.clear();
      historyRef.current.markUnsaved();
      setSelection(new Set());
      sync();
      toast.success('Đã khôi phục bản nháp, hãy bấm Lưu để giữ lại');
    } catch {
      toast.error('Bản nháp bị hỏng nên không khôi phục được');
      clearDraft(scoreId, version);
    }
    setDraft(null);
  }, [draft, doc, sync, scoreId, version]);

  const discardDraft = useCallback(() => {
    clearDraft(scoreId, version);
    setDraft(null);
  }, [scoreId, version]);

  const confirmLeave = useCallback(
    () => !historyRef.current.dirty || window.confirm('Bạn có thay đổi chưa lưu. Rời trang sẽ mất các thay đổi này?'),
    [],
  );

  // Tự lưu nháp mỗi 30 giây khi có thay đổi chưa lưu
  useEffect(() => {
    if (!canEdit || !flags.dirty) return;
    const timer = window.setInterval(() => {
      if (!saveDraft(scoreId, version, doc.serialize()) && !draftWarnedRef.current) {
        draftWarnedRef.current = true;
        toast.warn('Không tự lưu nháp được (trình duyệt hết dung lượng). Hãy bấm Lưu để giữ thay đổi.');
      }
    }, DRAFT_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [canEdit, flags.dirty, scoreId, version, doc]);

  // Rời hoặc đóng tab khi chưa lưu: lưu nháp ngay và hỏi xác nhận
  useEffect(() => {
    if (!canEdit || !flags.dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (allowLeaveRef.current) return;
      saveDraft(scoreId, version, doc.serialize());
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [canEdit, flags.dirty, scoreId, version, doc]);

  // Phím tắt
  useEffect(() => {
    if (!canEdit) return;
    const onKey = (e: KeyboardEvent) => {
      if (blocked || conflict || draft) return;
      const target = e.target as HTMLElement | null;
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 's') {
        e.preventDefault();
        void save();
      } else if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        redo();
      } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && selection.size > 0) {
        e.preventDefault();
        const up = e.key === 'ArrowUp';
        if (mod) applyPitch(up ? 'octaveUp' : 'octaveDown');
        else if (e.altKey) applyPitch(up ? 'semitoneUp' : 'semitoneDown');
        else applyPitch(up ? 'stepUp' : 'stepDown');
      } else if (e.key === 'Escape' && selection.size > 0) {
        clearSelection();
      } else if (e.key === 'Tab' && !mod && !e.altKey) {
        // Chỉ chiếm phím Tab khi đang ở vùng bản nhạc, để vẫn đi qua các nút bằng bàn phím được
        const inCanvas = target === document.body || !!target?.closest('.sv-canvas');
        if (!inCanvas) return;
        e.preventDefault();
        selectRelative(e.shiftKey ? -1 : 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canEdit, blocked, conflict, draft, selection, save, undo, redo, applyPitch, clearSelection, selectRelative]);

  return {
    selection,
    revision,
    dirty: flags.dirty,
    saving,
    version,
    canUndo: flags.canUndo,
    canRedo: flags.canRedo,
    issues,
    statusText,
    notice,
    previewTone,
    setPreviewTone,
    conflict,
    draft,
    select,
    clearSelection,
    applyPitch,
    undo,
    redo,
    save,
    restoreDraft,
    discardDraft,
    reloadLatest,
    overwrite,
    downloadMine,
    dismissConflict,
    confirmLeave,
  };
}
