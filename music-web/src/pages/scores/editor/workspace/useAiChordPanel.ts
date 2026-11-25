import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useNavigate } from '../../../../routes/useTransitionNavigate';
import { toast } from 'react-toastify';
import { replaceHarmonies, setChord } from '../../../../components/editor/notation/harmony';
import { chordNoteIds } from '../../../../components/scores/chords/aiChords';
import { useAiChordDraft } from '../../../../components/scores/chords/useAiChordDraft';
import type { AiChordRow } from '../../../../components/scores/chords/useAiChordDraft';
import type { AiChordMark } from '../../../../components/scores/chords/aiChordHighlight';
import { suggestionPath } from '../../../../components/scores/suggestions/suggestionUtils';
import { suggestionApi } from '../../../../services';
import { useDialog } from '../../../../components/ui/dialog-context';
import type { ScoreDocument } from '../../../../components/editor/core/ScoreDocument';
import type { ScoreEditor } from '../../../../components/editor/core/useScoreEditor';
import type { useLiveCollab } from '../../../../components/editor/live/useLiveCollab';
import { t } from '../../../../i18n/core';
import { formatDateTime, useScoreBase } from '../../../../utils/score';

/** Mở từ ?aiChords=: chờ phiên đồng chỉnh sửa vào xong tối đa chừng này (ms) rồi mới nạp hợp âm AI. */
const AI_LIVE_WAIT_MS = 8000;

interface Options {
  scoreId: string;
  doc: ScoreDocument;
  editor: ScoreEditor;
  canEdit: boolean;
  live: ReturnType<typeof useLiveCollab>;
  /** Bảng Hợp âm AI đang mở (dùng chung cột phải với bảng Góp ý). */
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  /** Đóng bảng Góp ý khi mở bảng Hợp âm AI. */
  closeComments: () => void;
}

/**
 * Hợp âm AI gợi ý nạp làm bản nháp (chưa lưu): tô trên bản nhạc, tổng hợp ở bảng bên phải. Mở từ đường dẫn
 * ?aiChords=ID hoặc ngay sau khi gợi ý hợp âm xong.
 */
export function useAiChordPanel({
  scoreId,
  doc,
  editor,
  canEdit,
  live,
  panelOpen,
  setPanelOpen,
  closeComments,
}: Options) {
  const navigate = useNavigate();
  const base = useScoreBase();
  const { confirm } = useDialog();
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedAiChords = searchParams.get('aiChords');
  // ?clearChords=1: mở từ hộp Gợi ý hợp âm ở trang chi tiết, xóa hết hợp âm ngay khi vào trình chỉnh sửa
  const linkedClear = searchParams.get('clearChords') === '1';
  const [aiFocus, setAiFocus] = useState<{ mark: AiChordMark; key: number } | null>(null);
  const openSuggestionReview = useCallback(
    (suggestionId: string) => navigate(suggestionPath(base, scoreId, suggestionId)),
    [navigate, base, scoreId],
  );
  const aiDraft = useAiChordDraft({ doc, editor, canEdit, onFallback: openSuggestionReview });
  const startAiDraft = aiDraft.start;
  const closeCommentsRef = useRef(closeComments);
  useEffect(() => {
    closeCommentsRef.current = closeComments;
  });
  const beginAiDraft = useCallback(
    (suggestionId: string) => {
      closeCommentsRef.current();
      setPanelOpen(true);
      void startAiDraft(suggestionId);
    },
    [startAiDraft, setPanelOpen],
  );
  // Mở từ đường dẫn ?aiChords=ID: đợi phiên đồng chỉnh sửa đồng bộ xong (lúc vào phiên server có thể nạp lại cả bản
  // nhạc, làm mất hợp âm vừa thêm), rồi bỏ tham số khỏi đường dẫn để tải lại trang không nạp lần nữa
  // Trạng thái đi off → connecting → synced; vào phiên lỗi (gói không có cộng tác...) thì không bao giờ synced, nên chỉ
  // chờ tối đa AI_LIVE_WAIT_MS
  const [liveWaitOver, setLiveWaitOver] = useState(false);
  const linkedAny = !!linkedAiChords || linkedClear;
  useEffect(() => {
    if (!linkedAny) return;
    const timer = window.setTimeout(() => setLiveWaitOver(true), AI_LIVE_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [linkedAny]);
  // Người sửa được luôn vào phiên (useLiveCollab bật theo canEdit), nhưng phiên chỉ được tạo sau lần render đầu nên
  // không dựa vào live.active được
  const liveReady =
    !canEdit || (live.active && (live.state.status === 'synced' || live.state.status === 'syncing')) || liveWaitOver;
  const aiParamHandled = useRef<string | null>(null);
  useEffect(() => {
    if (!linkedAiChords || !liveReady || aiParamHandled.current === linkedAiChords) return;
    aiParamHandled.current = linkedAiChords;
    const next = new URLSearchParams(searchParams);
    next.delete('aiChords');
    setSearchParams(next, { replace: true });
    beginAiDraft(linkedAiChords);
  }, [linkedAiChords, liveReady, searchParams, setSearchParams, beginAiDraft]);

  // Vào Editor mà không mở từ link: bản nháp hợp âm AI chỉ nằm trong bộ nhớ nên tải lại trang là mất, trong khi đề xuất
  // vẫn mở ở server (CH-03). Nếu còn một gợi ý hợp âm dùng được (đúng phiên bản hiện tại) thì hỏi có nạp lại không.
  // Chỉ hỏi một lần mỗi lần mở Editor; "Để sau" giữ nguyên đề xuất, mở lại được bằng hộp Gợi ý hợp âm.
  const resumeChecked = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const currentVersion = editor.version;
  useEffect(() => {
    if (!canEdit || linkedAny || !liveReady || resumeChecked.current) return;
    resumeChecked.current = true;
    void (async () => {
      try {
        const res = await suggestionApi.list(scoreId, 'OPEN');
        const pending = res.data.result.content.find(
          (s) =>
            s.source === 'CHORD_GENERATION' && !s.stale && !s.structural && (s.baseVersion ?? 0) === currentVersion,
        );
        if (!pending || !mountedRef.current) return;
        const ok = await confirm({
          title: t('chords.draft.resumeTitle'),
          message: t('chords.draft.resumeMessage', { time: formatDateTime(pending.createdAt) }),
          confirmLabel: t('chords.draft.resumeConfirm'),
          cancelLabel: t('chords.draft.resumeLater'),
        });
        if (ok && mountedRef.current) beginAiDraft(pending.id);
      } catch {
        // không tải được danh sách đề xuất: bỏ qua, người dùng vẫn mở được bằng hộp Gợi ý hợp âm
      }
    })();
  }, [canEdit, linkedAny, liveReady, scoreId, currentVersion, confirm, beginAiDraft]);

  /** Xóa mọi hợp âm của bản nhạc trong một bước sửa (chưa lưu, Ctrl+Z để hoàn tác), có hỏi lại trước. */
  const clearAllChords = useCallback(async () => {
    const ids = chordNoteIds(doc);
    if (ids.length === 0) {
      toast.info(t('chords.clear.none'));
      return;
    }
    const ok = await confirm({
      title: t('chords.clear.title'),
      message: t('chords.clear.message', { count: ids.length }),
      confirmLabel: t('chords.clear.confirm'),
      tone: 'danger',
    });
    if (!ok) return;
    const result = replaceHarmonies(
      doc,
      ids.map((id) => ({ id, harmonies: [] })),
      { key: 'editor.cmd.chord.clearAll' },
    );
    if (!editor.applyEdit(result)) {
      toast.warn(t('chords.clear.blocked'));
      return;
    }
    toast.success(t('chords.clear.done', { count: ids.length }));
  }, [doc, editor, confirm]);
  const clearAllRef = useRef(clearAllChords);
  useEffect(() => {
    clearAllRef.current = clearAllChords;
  });
  const clearParamHandled = useRef(false);
  useEffect(() => {
    if (!linkedClear || !liveReady || clearParamHandled.current) return;
    clearParamHandled.current = true;
    const next = new URLSearchParams(searchParams);
    next.delete('clearChords');
    setSearchParams(next, { replace: true });
    if (canEdit) void clearAllRef.current();
  }, [linkedClear, liveReady, searchParams, setSearchParams, canEdit]);

  const pickAiChord = (row: AiChordRow) => {
    editor.select([row.id], false);
    setAiFocus({ mark: { id: row.id, text: row.now || row.ai }, key: Date.now() });
  };
  const editAiChord = (row: AiChordRow) => {
    pickAiChord(row);
    if (!editor.chordMode) editor.setChordMode(true);
  };
  const removeAiChord = (row: AiChordRow) => {
    editor.select([row.id], false);
    editor.applyEdit(setChord(doc, row.id, ''));
  };
  const discardAiDraft = async () => {
    const ok = await confirm({
      title: t('chords.draft.discardTitle'),
      message: t('chords.draft.discardMessage'),
      confirmLabel: t('chords.draft.discardConfirm'),
      tone: 'danger',
    });
    if (ok) await aiDraft.discard();
  };
  const shown = panelOpen && (aiDraft.draft !== null || aiDraft.loading);

  return {
    aiDraft,
    aiFocus,
    shown,
    beginAiDraft,
    pickAiChord,
    editAiChord,
    removeAiChord,
    discardAiDraft,
    clearAllChords,
  };
}

export type AiChordPanelState = ReturnType<typeof useAiChordPanel>;
