import { useCallback, useState } from 'react';
import type { EditorCore } from './scoreEditorTypes';
import { toast } from 'react-toastify';
import { setHeaderText } from '../structure/header';
import type { HeaderField, TextStyle } from '../structure/header';
import { canHoldChord, pasteChords, setChord, stepChordNote } from '../notation/harmony';
import { canHoldLyric, pasteLyrics, setLyric, stepLyricNote } from '../notation/lyrics';
import type { LyricEnd } from '../notation/lyrics';
import { setTempo } from '../structure/tempo';
import type { TempoInfo } from '../structure/tempo';
import { t } from '../../../i18n/core';

/**
 * Các chế độ nhập của Editor (nhập nốt, nhập lời, nhập hợp âm) và các lệnh chữ đi kèm: hợp âm, lời bài hát, tiêu đề /
 * tác giả, chỉ số nhịp.
 */
export function useInputModes(core: EditorCore) {
  const { doc, canEdit, selection, setSelection, commit } = core;
  const [inputMode, setInputModeState] = useState(false);
  const [lyricMode, setLyricModeState] = useState(false);
  const [chordMode, setChordModeState] = useState(false);
  const [lyricVerse, setLyricVerse] = useState(1);

  /** Chọn chế độ Chọn (false) hoặc Nhập nốt (true); hai chế độ này tắt chế độ nhập lời. */
  const setInputMode = useCallback((enabled: boolean) => {
    setInputModeState(enabled);
    setLyricModeState(false);
    setChordModeState(false);
  }, []);

  const setLyricMode = useCallback(
    (enabled: boolean) => {
      setLyricModeState(enabled);
      if (!enabled) return;
      setInputModeState(false);
      setChordModeState(false);
      const current = [...selection][0];
      if (current && canHoldLyric(doc, current)) return;
      const first = doc.notes.find((n) => canHoldLyric(doc, n.id));
      if (first) setSelection(new Set([first.id]));
    },
    [selection, doc, setSelection],
  );

  const setChordMode = useCallback(
    (enabled: boolean) => {
      setChordModeState(enabled);
      if (!enabled) return;
      setInputModeState(false);
      setLyricModeState(false);
      const current = [...selection][0];
      if (current && canHoldChord(doc, current)) return;
      const first = doc.notes.find((n) => canHoldChord(doc, n.id));
      if (first) setSelection(new Set([first.id]));
    },
    [selection, doc, setSelection],
  );

  const enterChord = useCallback(
    (text: string, advance: boolean) => {
      const id = [...selection][0];
      if (!canEdit || !id) return;
      const result = setChord(doc, id, text);
      const next = advance ? stepChordNote(doc, id, 1) : null;
      if (!result.ok) {
        if (result.reason === 'unchanged') {
          if (next) setSelection(new Set([next]));
          return;
        }
        commit(result, false);
        return;
      }
      if (next) result.command.selectAfter = [next];
      commit(result, false);
    },
    [selection, canEdit, doc, commit, setSelection],
  );

  const moveChord = useCallback(
    (delta: 1 | -1) => {
      const id = [...selection][0];
      const target = id ? stepChordNote(doc, id, delta) : null;
      if (target) setSelection(new Set([target]));
    },
    [selection, doc, setSelection],
  );

  const pasteChordText = useCallback(
    (text: string) => {
      if (!canEdit) return;
      const current = [...selection][0];
      const start =
        current && canHoldChord(doc, current) ? current : doc.notes.find((n) => canHoldChord(doc, n.id))?.id;
      if (!start) return;
      const { result, placed, leftover } = pasteChords(doc, start, text);
      commit(result, false);
      if (!result.ok) return;
      toast.success(t('editor.toast.chordsPlaced', { count: placed }));
      if (leftover > 0) toast.warn(t('editor.toast.chordsLeft', { count: leftover }));
    },
    [canEdit, selection, doc, commit],
  );

  const enterLyric = useCallback(
    (text: string, end: LyricEnd | 'stay') => {
      const id = [...selection][0];
      if (!canEdit || !id) return;
      const result = setLyric(doc, id, text, end === 'stay' ? 'word' : end, lyricVerse);
      const next = end === 'stay' ? null : stepLyricNote(doc, id, 1);
      if (!result.ok) {
        // Không có gì để đổi: chỉ sang nốt kế
        if (result.reason === 'unchanged') {
          if (next) setSelection(new Set([next]));
          return;
        }
        commit(result, false);
        return;
      }
      if (next) result.command.selectAfter = [next];
      commit(result, false);
    },
    [selection, canEdit, doc, lyricVerse, commit, setSelection],
  );

  const moveLyric = useCallback(
    (delta: 1 | -1) => {
      const id = [...selection][0];
      const target = id ? stepLyricNote(doc, id, delta) : null;
      if (target) setSelection(new Set([target]));
    },
    [selection, doc, setSelection],
  );

  const pasteLyricsText = useCallback(
    (text: string) => {
      if (!canEdit) return;
      const current = [...selection][0];
      const start =
        current && canHoldLyric(doc, current) ? current : doc.notes.find((n) => canHoldLyric(doc, n.id))?.id;
      if (!start) return;
      const { result, report } = pasteLyrics(doc, start, text, lyricVerse);
      commit(result, false);
      if (!result.ok) return;
      toast.success(t('editor.toast.lyricsPlaced', { count: report.placed }));
      if (report.leftover > 0) toast.warn(t('editor.toast.lyricsLeft', { count: report.leftover }));
    },
    [canEdit, selection, doc, lyricVerse, commit],
  );

  const editHeader = useCallback(
    (field: HeaderField, text: string, style: TextStyle): boolean => {
      if (!canEdit) return false;
      const result = setHeaderText(doc, field, text, style);
      commit(result, false);
      return result.ok;
    },
    [canEdit, doc, commit],
  );

  const editTempo = useCallback(
    (info: TempoInfo): boolean => {
      if (!canEdit) return false;
      const result = setTempo(doc, info);
      commit(result, false);
      return result.ok;
    },
    [canEdit, doc, commit],
  );

  return {
    inputMode,
    setInputMode,
    lyricMode,
    setLyricMode,
    chordMode,
    setChordMode,
    lyricVerse,
    setLyricVerse,
    enterChord,
    moveChord,
    pasteChordText,
    enterLyric,
    moveLyric,
    pasteLyricsText,
    editHeader,
    editTempo,
  };
}
