import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { ScoreDocument } from '../../editor/core/ScoreDocument';
import type { ScoreEditor } from '../../editor/core/useScoreEditor';
import { replaceHarmonies } from '../../editor/notation/harmony';
import { t } from '../../../i18n/core';
import { suggestionApi } from '../../../services';
import type { SuggestionDetail } from '../../../types';
import { chordStatus, diffChords } from './aiChords';
import type { AiChordItem, AiChordStatus } from './aiChords';
import type { AiChordMark } from './aiChordHighlight';

/** Một hợp âm AI kèm tình trạng hiện tại trên bản nhạc. */
export interface AiChordRow extends AiChordItem {
  status: AiChordStatus;
  /** Hợp âm đang ghi ở nốt ("" nếu đã xóa). */
  now: string;
}

export interface AiChordDraft {
  suggestion: SuggestionDetail;
  /** Phiên bản lúc nạp gợi ý: lưu xong (phiên bản lớn hơn) thì đề xuất được đánh dấu đã áp dụng. */
  startVersion: number;
  items: AiChordItem[];
}

interface Options {
  doc: ScoreDocument;
  editor: ScoreEditor;
  canEdit: boolean;
  /** Không nạp được làm bản nháp (đề xuất lỗi thời, đã đóng...): mở trang duyệt đề xuất thay thế. */
  onFallback: (suggestionId: string) => void;
}

export interface AiChordDraftState {
  draft: AiChordDraft | null;
  loading: boolean;
  rows: AiChordRow[];
  /** Hợp âm AI còn trên bản nhạc, để tô trên canvas. */
  marks: AiChordMark[];
  /** Tải đề xuất hợp âm `suggestionId` và nạp vào bản nhạc thành một bước sửa (chưa lưu). */
  start: (suggestionId: string) => Promise<void>;
  /** Gỡ các hợp âm AI còn nguyên (một bước sửa), đóng đề xuất (từ chối) và thoát chế độ bản nháp. */
  discard: () => Promise<void>;
}

const NO_ROWS: AiChordRow[] = [];

/** Hợp âm AI gợi ý được nạp làm bản nháp trong trình chỉnh sửa (hướng A: chỉ thành phiên bản mới khi người dùng lưu). */
export function useAiChordDraft({ doc, editor, canEdit, onFallback }: Options): AiChordDraftState {
  const [loaded, setDraft] = useState<AiChordDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const applyingRef = useRef(false);
  const { applyEdit, version, dirty, canUndo, canRedo } = editor;

  const loadedRows = useMemo<AiChordRow[]>(() => {
    void editor.revision; // DOM sửa tại chỗ: tính lại sau mỗi lần sửa
    return loaded ? loaded.items.map((item) => ({ ...item, ...chordStatus(doc, item) })) : [];
  }, [loaded, doc, editor.revision]);

  // Phiên đồng chỉnh sửa không cấp được khóa (ô đang bị người khác giữ): ô được trả về bản của server và lệnh nạp bị bỏ
  // khỏi lịch sử. Khác với người dùng tự xóa hết (còn bước hoàn tác) hay hoàn tác lệnh nạp (còn bước làm lại). Khi đó
  // coi như không có bản nháp (suy ra lúc render, không cần đặt lại state).
  const reverted = loadedRows.length > 0 && loadedRows.every((r) => r.status === 'removed') && !canUndo && !canRedo;
  const draft = reverted ? null : loaded;
  const rows = reverted ? NO_ROWS : loadedRows;
  useEffect(() => {
    if (reverted) toast.warn(t('chords.draft.blocked'));
  }, [reverted]);

  const marks = useMemo<AiChordMark[]>(
    () => rows.filter((r) => r.status !== 'removed').map((r) => ({ id: r.id, text: r.now })),
    [rows],
  );

  const start = useCallback(
    async (suggestionId: string) => {
      if (!canEdit) {
        onFallback(suggestionId);
        return;
      }
      setLoading(true);
      try {
        const [detailRes, xml] = await Promise.all([
          suggestionApi.get(suggestionId),
          suggestionApi.content(suggestionId),
        ]);
        const suggestion = detailRes.data.result;
        const usable =
          suggestion.status === 'OPEN' &&
          suggestion.source === 'CHORD_GENERATION' &&
          suggestion.canDecide &&
          !suggestion.stale &&
          !suggestion.structural;
        if (!usable) {
          toast.info(t('chords.draft.cannotDraft'));
          onFallback(suggestionId);
          return;
        }
        if (suggestion.baseVersion !== version) {
          toast.info(t('chords.draft.outdated'));
          onFallback(suggestionId);
          return;
        }
        const items = diffChords(doc, ScoreDocument.parse(xml));
        if (items.length === 0) {
          toast.info(t('chords.draft.nothingNew'));
          onFallback(suggestionId);
          return;
        }
        const result = replaceHarmonies(
          doc,
          items.map((i) => ({ id: i.id, harmonies: i.aiHarmonies })),
          { key: 'editor.cmd.chord.ai' },
        );
        if (!applyEdit(result)) {
          toast.warn(t('chords.draft.blocked'));
          return;
        }
        setDraft({ suggestion, startVersion: version, items });
        toast.success(t('chords.draft.loaded', { count: items.length }));
      } catch {
        toast.error(t('chords.draft.loadFailed'));
      } finally {
        setLoading(false);
      }
    },
    [canEdit, onFallback, doc, version, applyEdit],
  );

  const discard = useCallback(async () => {
    if (!draft) return;
    const untouched = rows.filter((r) => r.status === 'ai');
    if (untouched.length > 0) {
      const result = replaceHarmonies(
        doc,
        untouched.map((r) => ({ id: r.id, harmonies: r.beforeHarmonies })),
        { key: 'editor.cmd.chord.aiDiscard' },
      );
      if (!applyEdit(result)) {
        toast.warn(t('chords.draft.blocked'));
        return;
      }
    }
    setDraft(null);
    try {
      await suggestionApi.reject(draft.suggestion.id);
    } catch {
      // gỡ khỏi bản nhạc là chính; đề xuất còn mở thì vẫn đóng được ở tab Đề xuất
    }
    toast.success(t('chords.draft.discarded'));
  }, [draft, rows, doc, applyEdit]);

  // Lưu xong (phiên bản tăng, không còn thay đổi chờ gửi): đánh dấu đề xuất đã áp dụng vào phiên bản đó.
  // Nếu không còn hợp âm AI nào (đã xóa hết, hoặc khôi phục phiên bản cũ) thì chỉ thoát chế độ bản nháp.
  useEffect(() => {
    if (!draft || dirty || version <= draft.startVersion || applyingRef.current) return;
    const kept = rows.some((r) => r.status !== 'removed');
    setDraft(null);
    if (!kept) return;
    applyingRef.current = true;
    suggestionApi
      .markApplied(draft.suggestion.id, version)
      .then(() => toast.success(t('chords.draft.applied', { version })))
      .catch(() => toast.warn(t('chords.draft.appliedFailed')))
      .finally(() => {
        applyingRef.current = false;
      });
  }, [draft, dirty, version, rows]);

  return { draft, loading, rows, marks, start, discard };
}
