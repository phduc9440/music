import { useCallback, useRef, useState } from 'react';
import type { Dispatch, SetStateAction, MutableRefObject } from 'react';
import { toast } from 'react-toastify';
import { fetchMusicXmlWithVersion, saveBlob, saveMusicXml, scoreApi } from '../../../services';
import { versionApi } from '../../../services/score/versionApi';
import { getConflictVersion, getErrorCode, getSaveErrorMessage, toSafeFileName } from '../../../utils/score';
import { reportPlanLimit } from '../../../utils/planLimit';
import { clearDraft, purgeOtherDrafts } from './draft';
import { History } from './history';
import type { LiveCollab } from '../live/useLiveCollab';
import { getVersionErrorMessage } from '../version/versionUtils';
import { readHeader } from '../structure/header';
import type { ScoreDocument } from './ScoreDocument';
import { t } from '../../../i18n/core';

/** Mã lỗi BE: bản nhạc còn phiên cùng sửa đang mở. */
const LIVE_SESSION_ACTIVE = 3122;
const VERSION_CONFLICT = 2014;
const LEAVE_RETRIES = 10;
const LEAVE_RETRY_MS = 500;

/**
 * Khôi phục ngay sau khi rời phiên cùng sửa. Server cần chút thời gian để lưu phần còn dở (có thể thành một phiên bản
 * mới) và đóng phiên, nên đọc lại số phiên bản hiện tại và thử lại khi phiên chưa đóng hoặc số phiên bản vừa đổi.
 */
async function restoreAfterLeave(scoreId: string, target: number, known: number) {
  for (let attempt = 1; ; attempt++) {
    const { data } = await versionApi.list(scoreId);
    const current = data.result.find((v) => v.isCurrent)?.version ?? known;
    try {
      return await versionApi.restore(scoreId, target, current);
    } catch (err) {
      const code = getErrorCode(err);
      if (attempt >= LEAVE_RETRIES || (code !== LIVE_SESSION_ACTIVE && code !== VERSION_CONFLICT)) throw err;
      await new Promise((resolve) => window.setTimeout(resolve, LEAVE_RETRY_MS));
    }
  }
}

interface SaveFlowOptions {
  canEdit: boolean;
  canForce: boolean;
  doc: ScoreDocument;
  scoreId: string;
  title: string;
  composer?: string | null;
  version: number;
  setVersion: (version: number) => void;
  mode: 'direct' | 'suggest';
  onSuggest?: (xml: string) => void;
  draftPrefix: string;
  historyRef: MutableRefObject<History>;
  liveRef: MutableRefObject<LiveCollab | null>;
  allowLeaveRef: MutableRefObject<boolean>;
  setFlags: (flags: { dirty: boolean; canUndo: boolean; canRedo: boolean }) => void;
  setSelection: Dispatch<SetStateAction<ReadonlySet<string>>>;
  sync: () => void;
  flash: (text: string) => void;
}

/** Lưu MusicXML (thường / đề xuất / cùng sửa), xử lý xung đột phiên bản, khôi phục phiên bản cũ, tải bản của tôi về. */
export function useSaveFlow(o: SaveFlowOptions) {
  const { canEdit, canForce, doc, scoreId, title, version, setVersion, mode, onSuggest, draftPrefix } = o;
  const { historyRef, liveRef, allowLeaveRef, setFlags, setSelection, sync, flash } = o;
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<{ latestVersion: number } | null>(null);
  // Tên bài / tác giả của bản nhạc đã biết (scores.title, scores.composer): một nguồn tên cho thẻ bản nhạc và đầu trang nhạc
  const metaRef = useRef({ title: o.title, composer: o.composer ?? '' });

  /**
   * Lưu xong mà người dùng đã sửa tên bài / tác giả trên bản nhạc thì cập nhật luôn bản nhạc (OMR-12), để thư viện và đầu
   * trang nhạc không ghi hai tên khác nhau. Lỗi chỉ bỏ qua: nội dung đã lưu, lần mở sau Editor lại lấy tên theo bản nhạc.
   */
  const syncScoreMeta = useCallback(() => {
    const header = readHeader(doc);
    const patch: { title?: string; composer?: string } = {};
    if (header.title && header.title !== metaRef.current.title) patch.title = header.title;
    if (header.composer && header.composer !== metaRef.current.composer) patch.composer = header.composer;
    if (!patch.title && !patch.composer) return;
    scoreApi
      .update(scoreId, patch)
      .then(() => {
        metaRef.current = { ...metaRef.current, ...patch };
      })
      .catch(() => undefined);
  }, [doc, scoreId]);

  const save = useCallback(
    async (force = false) => {
      if (!canEdit || savingRef.current) return;
      const liveSessionNow = liveRef.current?.session;
      if (liveSessionNow) {
        // Đồng chỉnh sửa: máy chủ giữ bản nhạc chung, Lưu chỉ yêu cầu chốt thành một phiên bản
        liveSessionNow.save();
        flash(t('live.notice.saving'));
        return;
      }
      if (!force && !historyRef.current.dirty) {
        flash(t('editor.flash.nothingToSave'));
        return;
      }
      if (mode === 'suggest') {
        onSuggest?.(doc.serialize());
        return;
      }
      savingRef.current = true;
      setSaving(true);
      const position = historyRef.current.position;
      try {
        const result = await saveMusicXml(scoreId, doc.serialize(), version, force);
        historyRef.current.markSaved(position);
        clearDraft(scoreId, version, draftPrefix);
        purgeOtherDrafts(scoreId, result.version, draftPrefix);
        setVersion(result.version);
        setConflict(null);
        setFlags({
          dirty: historyRef.current.dirty,
          canUndo: historyRef.current.canUndo,
          canRedo: historyRef.current.canRedo,
        });
        toast.success(t('editor.toast.saved'));
        syncScoreMeta();
      } catch (err) {
        const latest = getConflictVersion(err);
        if (latest !== undefined) setConflict({ latestVersion: latest });
        else if (!reportPlanLimit(err)) toast.error(getSaveErrorMessage(err));
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [
      canEdit,
      doc,
      scoreId,
      version,
      flash,
      mode,
      onSuggest,
      draftPrefix,
      historyRef,
      liveRef,
      setFlags,
      setVersion,
      syncScoreMeta,
    ],
  );

  const finishSuggestion = useCallback(() => {
    historyRef.current.markSaved(historyRef.current.position);
    clearDraft(scoreId, version, draftPrefix);
    setFlags({
      dirty: historyRef.current.dirty,
      canUndo: historyRef.current.canUndo,
      canRedo: historyRef.current.canRedo,
    });
  }, [scoreId, version, draftPrefix, historyRef, setFlags]);

  const overwrite = useCallback(async () => {
    if (!canForce) return;
    await save(true);
  }, [canForce, save]);

  const reloadLatest = useCallback(() => {
    clearDraft(scoreId, version, draftPrefix);
    allowLeaveRef.current = true;
    window.location.reload();
  }, [scoreId, version, draftPrefix, allowLeaveRef]);

  /**
   * Khôi phục một phiên bản cũ từ bảng lịch sử: BE lưu nó thành phiên bản mới, sau đó tải lại nội dung vào tài liệu
   * đang mở, xóa lịch sử hoàn tác và bản nháp. Lệch phiên bản (2014) thì mở hộp thoại xung đột sẵn có.
   * Trả về true nếu khôi phục xong.
   */
  const restoreVersion = useCallback(
    async (target: number): Promise<boolean> => {
      if (!canEdit || savingRef.current) return false;
      // Có người khác cùng sửa: khôi phục sẽ ghi đè thay đổi của họ. Chỉ có một mình thì tạm rời phiên rồi khôi phục
      const collab = liveRef.current;
      if (collab?.othersEditing) {
        flash(t('editor.version.panel.liveBlocked'));
        return false;
      }
      savingRef.current = true;
      setSaving(true);
      let rejoin = !!collab?.active;
      try {
        if (rejoin) await collab?.suspend();
        const result = rejoin
          ? await restoreAfterLeave(scoreId, target, version)
          : await versionApi.restore(scoreId, target, version);
        try {
          const fetched = await fetchMusicXmlWithVersion(scoreId);
          doc.restore(fetched.xml);
        } catch {
          rejoin = false; // tài liệu còn là bản cũ: không vào lại phiên cho tới khi tải lại trang
          toast.warn(t('editor.toast.restoredNoReload', { version: result.version }));
          return false;
        }
        historyRef.current.clear();
        clearDraft(scoreId, version, draftPrefix);
        purgeOtherDrafts(scoreId, result.version, draftPrefix);
        setVersion(result.version);
        setConflict(null);
        setSelection(new Set());
        sync();
        toast.success(t('editor.toast.restored', { from: target, version: result.version }));
        return true;
      } catch (err) {
        const latest = getConflictVersion(err);
        if (latest !== undefined) setConflict({ latestVersion: latest });
        else toast.error(getVersionErrorMessage(err));
        return false;
      } finally {
        if (rejoin) collab?.resume();
        savingRef.current = false;
        setSaving(false);
      }
    },
    [canEdit, doc, scoreId, version, sync, draftPrefix, historyRef, setSelection, setVersion, flash, liveRef],
  );

  const downloadMine = useCallback(() => {
    const blob = new Blob([doc.serialize()], { type: 'application/vnd.recordare.musicxml+xml' });
    saveBlob(blob, `${toSafeFileName(title)}.musicxml`);
  }, [doc, title]);

  const dismissConflict = useCallback(() => setConflict(null), []);

  return {
    saving,
    conflict,
    save,
    finishSuggestion,
    overwrite,
    reloadLatest,
    restoreVersion,
    downloadMine,
    dismissConflict,
  };
}
