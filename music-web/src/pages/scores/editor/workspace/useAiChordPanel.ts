import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useNavigate } from '../../../../routes/useTransitionNavigate';
import { setChord } from '../../../../components/editor/notation/harmony';
import { useAiChordDraft } from '../../../../components/scores/chords/useAiChordDraft';
import type { AiChordRow } from '../../../../components/scores/chords/useAiChordDraft';
import type { AiChordMark } from '../../../../components/scores/chords/aiChordHighlight';
import { suggestionPath } from '../../../../components/scores/suggestions/suggestionUtils';
import { useDialog } from '../../../../components/ui/dialog-context';
import type { ScoreDocument } from '../../../../components/editor/core/ScoreDocument';
import type { ScoreEditor } from '../../../../components/editor/core/useScoreEditor';
import type { useLiveCollab } from '../../../../components/editor/live/useLiveCollab';
import { t } from '../../../../i18n/core';
import { useScoreBase } from '../../../../utils/score';

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
  useEffect(() => {
    if (!linkedAiChords) return;
    const timer = window.setTimeout(() => setLiveWaitOver(true), AI_LIVE_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [linkedAiChords]);
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

  return { aiDraft, aiFocus, shown, beginAiDraft, pickAiChord, editAiChord, removeAiChord, discardAiDraft };
}

export type AiChordPanelState = ReturnType<typeof useAiChordPanel>;
