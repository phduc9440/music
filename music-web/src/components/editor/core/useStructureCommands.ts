import { useCallback } from 'react';
import type { EditorCore } from './scoreEditorTypes';
import { transposeDocument } from '../notes/transpose';
import { durationLabel, DURATION_QUARTERS } from '../notes/durations';
import { dotCount } from '../notes/durationCore';
import type { DurationChoice, DurationType } from '../notes/durations';
import { applyMark as runMark } from '../notation/marks';
import type { MarkOp } from '../notation/marks';
import { deleteMeasures, insertMeasure } from '../structure/structure';
import { addChordNote, addHarmonyVoice, removeVoice, toggleCue } from '../notes/voices';
import type { VoiceOp } from '../notes/voices';
import { addBassStaff, addPart, changeNotation, readNotation, removeStaff } from '../structure/staves';
import type { NotationChange } from '../structure/staves';
import { makeTuplet, removeTuplet, tupletName } from '../notes/tuplets';
import type { TupletOp } from '../notes/tuplets';
import { removeAttachment as runRemoveAttachment } from '../notation/attachments';
import { t } from '../../../i18n/core';

/** Lệnh sửa cấu trúc: ký hiệu sắc thái/lặp, chuyển giọng, thêm/xóa ô, khuông, khóa nhạc, bè, chùm, gỡ ký hiệu. */
export function useStructureCommands(
  core: EditorCore,
  setInputDuration: (choice: DurationChoice) => void,
  smallHarmony = false,
) {
  const { doc, canEdit, selection, commit, flash } = core;

  const applyMark = useCallback(
    (op: MarkOp) => {
      if (!canEdit || selection.size === 0) return;
      commit(runMark(doc, [...selection], op), false);
    },
    [canEdit, selection, doc, commit],
  );

  const transposeScore = useCallback(
    (semitones: number): boolean => {
      if (!canEdit) return false;
      const result = transposeDocument(doc, semitones);
      commit(result, false);
      return result.ok;
    },
    [canEdit, doc, commit],
  );

  const editMeasures = useCallback(
    (op: 'insertAfter' | 'insertBefore' | 'delete') => {
      if (!canEdit) return;
      const picked = [...selection].map((id) => doc.getInfo(id)).filter((n) => n !== undefined);
      const indexes = picked.map((n) => n.measureIndex);
      const first = indexes.length ? Math.min(...indexes) : doc.measureCount - 1;
      const last = indexes.length ? Math.max(...indexes) : doc.measureCount - 1;
      if (op === 'delete') {
        if (indexes.length === 0) {
          commit({ ok: false, reason: 'noMeasure' }, false);
          return;
        }
        commit(deleteMeasures(doc, first, last), false);
      } else if (op === 'insertAfter') commit(insertMeasure(doc, last, 'after'), false);
      else commit(insertMeasure(doc, first, 'before'), false);
    },
    [canEdit, selection, doc, commit],
  );

  const editStaves = useCallback(
    (op: 'addBass' | 'addG' | 'addF' | 'addTenor' | 'remove') => {
      if (!canEdit) return;
      const picked = [...selection][0] ? doc.getInfo([...selection][0]) : undefined;
      if (op === 'addBass') commit(addBassStaff(doc, picked?.partIndex ?? 0), false);
      else if (op === 'addG') commit(addPart(doc, 'G'), false);
      else if (op === 'addF') commit(addPart(doc, 'F'), false);
      else if (op === 'addTenor') commit(addPart(doc, 'G8b'), false);
      else if (!picked) commit({ ok: false, reason: 'noStaff' }, false);
      else commit(removeStaff(doc, picked.partIndex, picked.staff), false);
    },
    [canEdit, selection, doc, commit],
  );

  const editNotation = useCallback(
    (change: NotationChange) => {
      if (!canEdit) return;
      const info = readNotation(doc, [...selection]);
      if (!info) {
        commit({ ok: false, reason: 'noStaff' }, false);
        return;
      }
      commit(changeNotation(doc, info, change), false);
    },
    [canEdit, selection, doc, commit],
  );

  const editVoice = useCallback(
    (op: VoiceOp) => {
      if (!canEdit || selection.size === 0) return;
      const ids = [...selection];
      if (op === 'cue') commit(toggleCue(doc, ids), false);
      else if (op === 'remove') commit(removeVoice(doc, ids), false);
      else if (op === 'chordBelow') commit(addChordNote(doc, ids, -1, smallHarmony), true);
      else if (op === 'chordAbove') commit(addChordNote(doc, ids, 1, smallHarmony), true);
      else if (op === 'blank') commit(addHarmonyVoice(doc, ids, 0, true), false);
      else commit(addHarmonyVoice(doc, ids, op === 'addBelow' ? -2 : 2, false, smallHarmony), false);
    },
    [canEdit, selection, doc, commit, smallHarmony],
  );

  const editTuplet = useCallback(
    (op: TupletOp) => {
      if (!canEdit) return;
      const target = doc.notes.find((n) => selection.has(n.id));
      if (!target) {
        commit({ ok: false, reason: 'noMeasure' }, false);
        return;
      }
      const result =
        op.kind === 'make' ? makeTuplet(doc, target.id, op.actual, op.normal) : removeTuplet(doc, target.id);
      commit(result, false);
      if (!result.ok || op.kind !== 'make') return;
      // Chùm mới toàn dấu lặng: đặt trường độ nhập bằng hình nốt của chùm để gõ A–G là điền nốt vào chùm luôn
      const first = doc.getInfo(result.command.selectAfter?.[0] ?? '');
      const type = first?.element.querySelector(':scope > type')?.textContent?.trim() ?? '';
      if (first && type in DURATION_QUARTERS) {
        setInputDuration({ type: type as DurationType, dots: dotCount(first.element) });
        flash(t('editor.flash.tupletInput', { name: tupletName(op), duration: durationLabel(type as DurationType) }));
      }
    },
    [canEdit, selection, doc, commit, flash, setInputDuration],
  );

  const removeAttachment = useCallback(
    (id: string, key: string) => {
      if (!canEdit) return;
      commit(runRemoveAttachment(doc, id, key), false);
    },
    [canEdit, doc, commit],
  );

  return { applyMark, transposeScore, editMeasures, editStaves, editNotation, editVoice, editTuplet, removeAttachment };
}
