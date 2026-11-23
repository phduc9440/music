import { useEffect } from 'react';
import type { SymbolOp } from './commands';
import { isLetterKey } from '../notes/durations';
import type { DurationType } from '../notes/durations';
import type { TupletOp } from '../notes/tuplets';
import type { PitchOp } from '../notes/pitch';

/** Phím số chọn nhanh trường độ: 1 móc kép ... 5 tròn, 6 móc ba, 7 móc tứ. */
const DIGIT_DURATIONS: Record<string, DurationType> = {
  '1': '16th',
  '2': 'eighth',
  '3': 'quarter',
  '4': 'half',
  '5': 'whole',
  '6': '32nd',
  '7': '64th',
};

export interface EditorShortcutActions {
  canEdit: boolean;
  /** Có hộp thoại khác đang mở, đang xung đột hoặc đang hỏi khôi phục nháp: phím không sửa bản nhạc. */
  blocked: boolean;
  conflict: unknown;
  draft: unknown;
  selection: ReadonlySet<string>;
  inputMode: boolean;
  lyricMode: boolean;
  chordMode: boolean;
  save: () => Promise<void>;
  undo: () => void;
  redo: () => void;
  selectAll: () => void;
  editTuplet: (op: TupletOp) => void;
  applyPitch: (op: PitchOp) => void;
  selectInChord: (delta: 1 | -1) => void;
  applySymbol: (op: SymbolOp) => void;
  chooseDuration: (type: DurationType) => void;
  toggleDot: () => void;
  enterLetter: (letter: string) => void;
  setChordMode: (enabled: boolean) => void;
  setLyricMode: (enabled: boolean) => void;
  setInputMode: (enabled: boolean) => void;
  clearSelection: () => void;
  selectRelative: (delta: 1 | -1) => void;
}

/** Phím tắt của Editor (chỉ người sửa được): lưu, hoàn tác, cao độ, trường độ, chữ cái, Tab, Esc... */
export function useEditorShortcuts(a: EditorShortcutActions) {
  const { canEdit, blocked, conflict, draft, selection, inputMode, lyricMode, chordMode } = a;
  const { save, undo, redo, selectAll, editTuplet, applyPitch, selectInChord, applySymbol } = a;
  const { chooseDuration, toggleDot, enterLetter, setChordMode, setLyricMode, setInputMode } = a;
  const { clearSelection, selectRelative } = a;
  useEffect(() => {
    if (!canEdit) return;
    const onKey = (e: KeyboardEvent) => {
      if (blocked || conflict || draft) return;
      // Có hộp thoại đang mở (lịch sử phiên bản, xuất file...): phím thuộc về hộp thoại, không sửa bản nhạc phía sau
      if (document.querySelector('.sc-modal-overlay')) return;
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
      } else if (mod && key === 'a' && !e.shiftKey && !e.altKey) {
        // Chọn cả bản nhạc (như MuseScore), để chuyển giọng / đổi ký hiệu / xóa hàng loạt
        e.preventDefault();
        selectAll();
      } else if (mod && !e.shiftKey && !e.altKey && e.key === '3') {
        e.preventDefault();
        editTuplet({ kind: 'make', actual: 3, normal: 2 });
      } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && selection.size > 0) {
        e.preventDefault();
        const up = e.key === 'ArrowUp';
        if (mod) applyPitch(up ? 'octaveUp' : 'octaveDown');
        else if (e.altKey) applyPitch(up ? 'semitoneUp' : 'semitoneDown');
        else applyPitch(up ? 'stepUp' : 'stepDown');
      } else if ((e.key === '[' || e.key === ']') && selection.size > 0) {
        e.preventDefault();
        selectInChord(e.key === ']' ? 1 : -1);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selection.size > 0) {
        e.preventDefault();
        applySymbol('delete');
      } else if (!mod && !e.altKey && (key === 't' || key === 's') && selection.size > 0) {
        e.preventDefault();
        applySymbol(key === 't' ? 'tie' : 'slur');
      } else if (!mod && !e.altKey && /^[1-7]$/.test(e.key)) {
        chooseDuration(DIGIT_DURATIONS[e.key]);
      } else if (!mod && !e.altKey && e.key === '.') {
        toggleDot();
      } else if (inputMode && !mod && !e.altKey && isLetterKey(e.key) && selection.size > 0) {
        e.preventDefault();
        enterLetter(e.key);
      } else if (e.key === 'Escape' && chordMode) {
        setChordMode(false);
      } else if (e.key === 'Escape' && lyricMode) {
        setLyricMode(false);
      } else if (e.key === 'Escape' && inputMode) {
        setInputMode(false);
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
  }, [
    chordMode,
    setChordMode,
    lyricMode,
    setLyricMode,
    setInputMode,
    canEdit,
    blocked,
    conflict,
    draft,
    selection,
    save,
    undo,
    redo,
    applyPitch,
    clearSelection,
    selectRelative,
    selectInChord,
    selectAll,
    applySymbol,
    chooseDuration,
    toggleDot,
    enterLetter,
    editTuplet,
    inputMode,
  ]);
}
