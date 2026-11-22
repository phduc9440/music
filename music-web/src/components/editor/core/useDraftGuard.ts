import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction, MutableRefObject } from 'react';
import { toast } from 'react-toastify';
import { DRAFT_INTERVAL_MS, clearDraft, loadDraft, purgeOtherDrafts, saveDraft } from './draft';
import type { Draft } from './draft';
import { History } from './history';
import type { LiveCollab } from '../live/useLiveCollab';
import type { ScoreDocument } from './ScoreDocument';
import { useDialog } from '../../ui/dialog-context';
import { t } from '../../../i18n/core';

/** Hộp thoại hỏi khi rời trang còn thay đổi chưa lưu. */
const leaveDialogOptions = () => ({
  title: t('editor.leave.title'),
  message: t('editor.leave.message'),
  confirmLabel: t('editor.leave.confirm'),
  cancelLabel: t('editor.leave.stay'),
  tone: 'danger' as const,
});

interface DraftGuardOptions {
  canEdit: boolean;
  scoreId: string;
  initialVersion: number;
  version: number;
  doc: ScoreDocument;
  draftPrefix: string;
  live: LiveCollab | null;
  liveRef: MutableRefObject<LiveCollab | null>;
  /** Lịch sử có thay đổi chưa lưu (khi không cùng sửa). */
  dirty: boolean;
  historyRef: MutableRefObject<History>;
  allowLeaveRef: MutableRefObject<boolean>;
  setSelection: Dispatch<SetStateAction<ReadonlySet<string>>>;
  sync: () => void;
}

/**
 * Bản nháp trong trình duyệt và chặn rời trang: tìm nháp cũ khi mở, tự lưu nháp mỗi 30 giây, lưu nháp và hỏi lại khi
 * đóng tab / bấm Back / rời trình chỉnh sửa còn thay đổi chưa lưu.
 */
export function useDraftGuard(o: DraftGuardOptions) {
  const { canEdit, scoreId, initialVersion, version, doc, draftPrefix, live, liveRef, historyRef } = o;
  const { allowLeaveRef, setSelection, sync } = o;
  const { confirm: confirmDialog } = useDialog();
  const liveActive = live?.active ?? false;
  const flags = { dirty: o.dirty };
  const draftWarnedRef = useRef(false);
  const [draft, setDraft] = useState<Draft | null>(() => {
    if (!canEdit) return null;
    purgeOtherDrafts(scoreId, initialVersion, draftPrefix); // nháp của phiên bản cũ không còn khôi phục được
    const found = loadDraft(scoreId, initialVersion, draftPrefix);
    return found && found.xml !== doc.serialize() ? found : null;
  });

  const restoreDraft = useCallback(() => {
    if (!draft) return;
    try {
      doc.restore(draft.xml);
      historyRef.current.clear();
      historyRef.current.markUnsaved();
      setSelection(new Set());
      sync();
      toast.success(t('editor.toast.draftRestored'));
    } catch {
      toast.error(t('editor.toast.draftBroken'));
      clearDraft(scoreId, version, draftPrefix);
    }
    setDraft(null);
  }, [draft, doc, sync, scoreId, version, draftPrefix, historyRef, setSelection]);

  const discardDraft = useCallback(() => {
    clearDraft(scoreId, version, draftPrefix);
    setDraft(null);
  }, [scoreId, version, draftPrefix]);

  const confirmLeave = useCallback(
    async () =>
      !(liveRef.current?.active ? liveRef.current.state.pending > 0 : historyRef.current.dirty) ||
      confirmDialog(leaveDialogOptions()),
    [confirmDialog, historyRef, liveRef],
  );

  // Tự lưu nháp mỗi 30 giây khi có thay đổi chưa lưu
  useEffect(() => {
    if (!canEdit || !flags.dirty || liveActive) return;
    const timer = window.setInterval(() => {
      if (!saveDraft(scoreId, version, doc.serialize(), draftPrefix) && !draftWarnedRef.current) {
        draftWarnedRef.current = true;
        toast.warn(t('editor.toast.draftFull'));
      }
    }, DRAFT_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [canEdit, flags.dirty, liveActive, scoreId, version, doc, draftPrefix]);

  // Rời hoặc đóng tab khi chưa lưu: lưu nháp ngay và hỏi xác nhận
  useEffect(() => {
    if (!canEdit || !(liveActive ? (live?.state.pending ?? 0) > 0 : flags.dirty)) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (allowLeaveRef.current) return;
      if (!liveActive) saveDraft(scoreId, version, doc.serialize(), draftPrefix);
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [canEdit, flags.dirty, liveActive, live?.state.pending, scoreId, version, doc, draftPrefix, allowLeaveRef]);

  // Nút Back của trình duyệt khi chưa lưu: thêm một mục lịch sử đệm để chặn và hỏi xác nhận
  const livePending = live?.state.pending ?? 0;
  const hasUnsent = liveActive ? livePending > 0 : flags.dirty;
  useEffect(() => {
    if (!canEdit || !hasUnsent) return;
    window.history.pushState(null, '', window.location.href);
    const onPopState = async () => {
      if (allowLeaveRef.current) return;
      const leave = await confirmDialog(leaveDialogOptions());
      if (leave) {
        allowLeaveRef.current = true;
        window.history.go(-1);
      } else {
        window.history.pushState(null, '', window.location.href);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [canEdit, hasUnsent, confirmDialog, allowLeaveRef]);

  return { draft, restoreDraft, discardDraft, confirmLeave };
}
