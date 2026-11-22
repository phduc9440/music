import { useCallback } from 'react';
import type { EditorCore } from './scoreEditorTypes';
import { changePitch, removeNotes, setAlteration } from './commands';
import type { SymbolOp } from './commands';
import {
  durationLabel,
  DURATION_QUARTERS,
  dotsLabel,
  enterNote,
  insertNote,
  nextDots,
  setDuration,
} from '../notes/durations';
import { dotCount } from '../notes/durationCore';
import type { AccidentalChoice, DurationChoice, DurationType, InsertTarget } from '../notes/durations';
import { confirmMeasure } from '../structure/measureCheck';
import { removeVoice } from '../notes/voices';
import { toggleSlur, toggleTie } from '../notes/ties';
import type { PitchOp } from '../notes/pitch';
import type { ScoreDocument } from './ScoreDocument';
import { t } from '../../../i18n/core';

/**
 * Vùng chọn chỉ gồm dấu lặng của bè phụ, và trong ô đó bè phụ ấy chỉ còn dấu lặng: Xóa nên gỡ cả bè phụ (dấu lặng của
 * bè chính thì không xóa được vì ô sẽ thiếu phách).
 */
const deletesRestVoice = (doc: ScoreDocument, ids: readonly string[]): boolean => {
  const infos = ids.map((id) => doc.getInfo(id)).filter((n) => n !== undefined);
  if (infos.length === 0 || infos.some((n) => !n.isRest)) return false;
  return infos.every((n) =>
    doc.notes
      .filter(
        (x) =>
          x.partIndex === n.partIndex &&
          x.measureIndex === n.measureIndex &&
          x.staff === n.staff &&
          x.voice === n.voice,
      )
      .every((x) => x.isRest),
  );
};

interface DurationInput {
  inputMode: boolean;
  inputDuration: DurationChoice;
  setInputDuration: (choice: DurationChoice) => void;
}

/** Lệnh sửa nốt: cao độ (phím, kéo), trường độ, chấm dôi, nhập theo chữ cái, thêm nốt, dấu hóa / dấu lặng / xóa / nối. */
export function useNoteCommands(core: EditorCore, { inputMode, inputDuration, setInputDuration }: DurationInput) {
  const { doc, canEdit, selection, setSelection, commit, flash } = core;

  /** Áp một thao tác cao độ lên `targets`. */
  const runPitch = useCallback(
    (targets: readonly string[], op: PitchOp, count: number) => {
      if (!canEdit || targets.length === 0) return;
      commit(changePitch(doc, targets, op, count), true);
    },
    [canEdit, doc, commit],
  );

  const chooseDuration = useCallback(
    (type: DurationType) => {
      const choice: DurationChoice = { type, dots: 0 };
      setInputDuration(choice);
      if (inputMode) {
        flash(t('editor.flash.inputDuration', { duration: durationLabel(type) }));
        return;
      }
      if (canEdit && selection.size > 0) commit(setDuration(doc, [...selection], choice), false);
    },
    [inputMode, canEdit, selection, doc, commit, flash, setInputDuration],
  );

  const toggleDot = useCallback(() => {
    if (inputMode) {
      const next: DurationChoice = { ...inputDuration, dots: nextDots(inputDuration.dots) };
      setInputDuration(next);
      flash(t('editor.flash.inputDuration', { duration: `${durationLabel(next.type)}${dotsLabel(next.dots)}` }));
      return;
    }
    if (!canEdit || selection.size === 0) return;
    const first = [...selection].map((id) => doc.getInfo(id)).find((n) => n !== undefined);
    const typeText = first?.element.querySelector(':scope > type')?.textContent?.trim() ?? '';
    if (!first || !(typeText in DURATION_QUARTERS)) {
      flash(t('editor.flash.dotUnsupported'));
      return;
    }
    const dots = dotCount(first.element);
    commit(setDuration(doc, [...selection], { type: typeText as DurationType, dots: nextDots(dots) }), false);
  }, [inputMode, inputDuration, canEdit, selection, doc, commit, flash, setInputDuration]);

  const enterLetter = useCallback(
    (letter: string) => {
      if (!canEdit || !inputMode || selection.size === 0) return;
      commit(enterNote(doc, [...selection][0], letter, inputDuration), true);
    },
    [canEdit, inputMode, selection, doc, inputDuration, commit],
  );

  const confirmMeasureOk = useCallback(
    (measureIndex: number) => {
      if (canEdit) commit(confirmMeasure(doc, measureIndex), false);
    },
    [canEdit, doc, commit],
  );

  const insertNoteAt = useCallback(
    (target: InsertTarget, choice: DurationChoice, accidental: AccidentalChoice): boolean => {
      if (!canEdit) return false;
      const result = insertNote(doc, target, choice, accidental);
      commit(result, true);
      if (result.ok) setInputDuration(choice);
      return result.ok;
    },
    [canEdit, doc, commit, setInputDuration],
  );

  const applySymbolTo = useCallback(
    (ids: readonly string[], op: SymbolOp) => {
      if (!canEdit || ids.length === 0) return;
      if (op === 'tie') commit(toggleTie(doc, ids), false);
      else if (op === 'slur') commit(toggleSlur(doc, ids), false);
      else if (op === 'delete' && deletesRestVoice(doc, ids)) {
        // Xóa dấu lặng của bè phụ khi cả bè trong ô chỉ còn dấu lặng: gỡ hẳn bè đó (như MuseScore), bè chính giữ nguyên
        const result = removeVoice(doc, ids);
        commit(result.ok ? result : removeNotes(doc, ids, op), false);
      } else if (op === 'rest' || op === 'delete') commit(removeNotes(doc, ids, op), false);
      else commit(setAlteration(doc, ids, op), true);
    },
    [canEdit, doc, commit],
  );

  const applySymbol = useCallback(
    (op: SymbolOp) => {
      if (selection.size > 0) applySymbolTo([...selection], op);
    },
    [selection, applySymbolTo],
  );

  const applyPitch = useCallback((op: PitchOp) => runPitch([...selection], op, 1), [runPitch, selection]);

  const dragPitch = useCallback(
    (ids: readonly string[], steps: number) => {
      if (!canEdit || steps === 0) return;
      const inSelection = ids.some((id) => selection.has(id));
      if (!inSelection) setSelection(new Set(ids));
      runPitch(inSelection ? [...selection] : ids, steps > 0 ? 'stepUp' : 'stepDown', Math.abs(steps));
    },
    [canEdit, selection, runPitch, setSelection],
  );

  return {
    chooseDuration,
    toggleDot,
    enterLetter,
    confirmMeasureOk,
    insertNoteAt,
    applySymbolTo,
    applySymbol,
    applyPitch,
    dragPitch,
  };
}
