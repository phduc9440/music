import { useCallback, useState } from 'react';
import type { ScoreDocument } from './ScoreDocument';

/** Vùng chọn nốt của Editor: chọn / bỏ chọn, Tab, chọn cả ô, cả bản, đi trong hợp âm. */
export function useEditorSelection(doc: ScoreDocument) {
  const [selection, setSelection] = useState<ReadonlySet<string>>(() => new Set());

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

  const selectAll = useCallback(() => setSelection(new Set(doc.notes.map((n) => n.id))), [doc]);

  const selectMeasure = useCallback(
    (measureIndex: number) => {
      setSelection(new Set(doc.notes.filter((n) => n.measureIndex === measureIndex).map((n) => n.id)));
    },
    [doc],
  );

  const selectInChord = useCallback(
    (delta: 1 | -1) => {
      const first = [...selection].map((id) => doc.getInfo(id)).find((n) => n !== undefined);
      if (!first) return;
      const members = doc.notes
        .filter(
          (n) =>
            n.partIndex === first.partIndex &&
            n.measureIndex === first.measureIndex &&
            n.staff === first.staff &&
            n.voice === first.voice &&
            n.entryIndex === first.entryIndex &&
            !n.isRest,
        )
        .sort((a, b) => (a.midi ?? 0) - (b.midi ?? 0));
      if (members.length < 2) return;
      const wholeChord = selection.size > 1;
      const current = members.findIndex((n) => selection.has(n.id));
      const index = wholeChord
        ? delta > 0
          ? members.length - 1
          : 0
        : Math.min(members.length - 1, Math.max(0, current + delta));
      setSelection(new Set([members[index].id]));
    },
    [doc, selection],
  );

  return { selection, setSelection, select, clearSelection, selectRelative, selectAll, selectMeasure, selectInChord };
}
