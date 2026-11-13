/**
 * Thêm / xóa ô nhịp. Việc này làm đổi số ô nhịp (và id nốt phía sau) nên lệnh lưu bản chụp toàn bộ các part thay vì
 * từng ô nhịp như các lệnh khác.
 */
import type { EditCommand, EditResult } from '../core/commands';
import type { ScoreDocument } from '../core/ScoreDocument';
import { t } from '../../../i18n/core';

const LEADING = ['attributes', 'direction', 'print', 'sound'];

const el = (owner: Document, tag: string, text?: string): Element => {
  const e = owner.createElement(tag);
  if (text !== undefined) e.textContent = text;
  return e;
};

/** Đánh số lại các ô từ `fromIndex` trở đi (số ô trước đó + 1). */
const renumber = (doc: ScoreDocument, fromIndex: number): void => {
  for (let p = 0; p < doc.partCount; p++) {
    const measures = doc.getMeasures(p);
    for (let i = Math.max(fromIndex, 0); i < measures.length; i++) {
      const prev = i > 0 ? Number(measures[i - 1].getAttribute('number')) : 0;
      measures[i].setAttribute('number', String(Number.isFinite(prev) ? prev + 1 : i + 1));
    }
  }
};

/** Chạy một thay đổi cấu trúc (đổi số ô nhịp / khuông / phần nhạc) và dựng lệnh hoàn tác bằng bản chụp cả bản nhạc. */
export const runStructural = (doc: ScoreDocument, label: string, apply: () => number): EditResult => {
  const before = doc.partsSnapshot();
  const focus = apply();
  doc.reindex();
  const first = doc.notes.filter((n) => n.partIndex === 0 && n.measureIndex === focus);
  const command: EditCommand = {
    label,
    snapshots: [],
    changedIds: [],
    parts: { before, after: doc.partsSnapshot() },
    selectAfter: first.filter((n) => n.chordIndex === 0).map((n) => n.id),
  };
  return { ok: true, command };
};

/**
 * Thêm một ô nhịp trống (dấu lặng nguyên ô) vào mọi part, sau hoặc trước ô `measureIndex`. Ô mới thừa hưởng khóa, nhịp,
 * số khuông của ô bên cạnh; chèn trước ô đầu thì dời khóa/nhịp/tempo đầu bài sang ô mới.
 */
export function insertMeasure(doc: ScoreDocument, measureIndex: number, where: 'after' | 'before'): EditResult {
  const count = doc.measureCount;
  const pos = Math.min(where === 'after' ? measureIndex : measureIndex - 1, count - 1); // ô đứng ngay trước ô mới
  const refIndex = Math.max(pos, 0);
  const { beats, beatType } = doc.timeAt(refIndex);

  const lengths: number[] = [];
  for (let p = 0; p < doc.partCount; p++) {
    const length = (beats * 4 * doc.divisionsAtPart(p, refIndex)) / beatType;
    if (!Number.isInteger(length) || length <= 0) return { ok: false, reason: 'divisions' };
    lengths.push(length);
  }

  return runStructural(doc, t('editor.cmd.measure.add', { n: pos + 2 }), () => {
    const newIndex = pos + 1;
    for (let p = 0; p < doc.partCount; p++) {
      const measures = doc.getMeasures(p);
      const ref = measures[refIndex];
      const owner = ref.ownerDocument;
      const fresh = el(owner, 'measure');
      fresh.setAttribute('number', String(newIndex + 1));

      // Mỗi khuông lấy bè thấp nhất đang dùng ở ô tham chiếu
      const voices = new Map<number, number>();
      for (const n of doc.notes) {
        if (n.partIndex !== p || n.measureIndex !== refIndex) continue;
        voices.set(n.staff, Math.min(voices.get(n.staff) ?? Infinity, n.voice));
      }
      const staves = Math.max(doc.staffCountOfPart(p), 1);
      const length = lengths[p];

      if (pos < 0) {
        for (const child of Array.from(ref.children)) {
          if (child.tagName === 'note') break;
          if (LEADING.includes(child.tagName)) fresh.appendChild(child);
        }
      }
      for (let s = 1; s <= staves; s++) {
        if (s > 1) {
          const backup = el(owner, 'backup');
          backup.appendChild(el(owner, 'duration', String(length)));
          fresh.appendChild(backup);
        }
        const note = el(owner, 'note');
        const rest = el(owner, 'rest');
        rest.setAttribute('measure', 'yes');
        note.appendChild(rest);
        note.appendChild(el(owner, 'duration', String(length)));
        note.appendChild(el(owner, 'voice', String(voices.get(s) ?? (s - 1) * 4 + 1)));
        if (staves > 1) note.appendChild(el(owner, 'staff', String(s)));
        fresh.appendChild(note);
      }
      if (pos < 0) ref.before(fresh);
      else ref.after(fresh);
    }
    renumber(doc, newIndex);
    return newIndex;
  });
}

/** Gỡ dấu nối còn dang dở ở biên của đoạn vừa xóa (`type`: nốt bắt đầu nối vào ô đã mất, hoặc nốt kết thúc nối từ đó). */
const dropTies = (measure: Element | undefined, type: 'start' | 'stop'): void => {
  if (!measure) return;
  measure.querySelectorAll(`tie[type="${type}"], tied[type="${type}"]`).forEach((t) => {
    const parent = t.parentElement;
    t.remove();
    if (parent?.tagName === 'notations' && parent.children.length === 0) parent.remove();
  });
};

/** Xóa các ô nhịp từ `from` đến `to` (gồm cả hai đầu) ở mọi part. */
export function deleteMeasures(doc: ScoreDocument, from: number, to: number): EditResult {
  const count = doc.measureCount;
  const lo = Math.max(0, Math.min(from, to));
  const hi = Math.min(count - 1, Math.max(from, to));
  if (hi - lo + 1 >= count) return { ok: false, reason: 'lastMeasure' };

  const label =
    lo === hi
      ? t('editor.cmd.measure.remove', { n: lo + 1 })
      : t('editor.cmd.measure.removeRange', { from: lo + 1, to: hi + 1 });
  return runStructural(doc, label, () => {
    for (let p = 0; p < doc.partCount; p++) {
      const measures = doc.getMeasures(p);
      const next = measures[hi + 1];
      if (lo === 0 && next) {
        // Khóa/nhịp/tempo đầu bài chuyển sang ô đứng đầu mới
        const carry = Array.from(measures[0].children)
          .filter((c) => LEADING.includes(c.tagName))
          .filter((c) => {
            const firstNote = Array.from(measures[0].children).find((x) => x.tagName === 'note');
            return !firstNote || !(firstNote.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING);
          });
        const anchor = next.firstChild;
        carry.forEach((c) => next.insertBefore(c, anchor));
      }
      for (let i = lo; i <= hi; i++) measures[i].remove();
      dropTies(measures[lo - 1], 'start');
      dropTies(next, 'stop');
    }
    renumber(doc, lo);
    return Math.min(lo, doc.measureCount - 1 - (hi - lo + 1) + 0 < 0 ? 0 : lo);
  });
}
