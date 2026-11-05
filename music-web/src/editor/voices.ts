/**
 * Viết bè: sao các nốt đã chọn sang một bè mới cùng khuông (cùng trường độ, nốt nhỏ kiểu "cue", mặc định cách một
 * quãng ba) để người dùng chỉnh cao độ tiếp; cùng nút bật/tắt nốt nhỏ và xóa bè.
 */
import { chordKey, childOf, commitEdit, readPitch, touch, writePitch } from './commands';
import type { EditResult, Touched } from './commands';
import { movePitch } from './pitch';
import type { NoteInfo, ScoreDocument } from './ScoreDocument';

const num = (parent: Element, tag: string): number => Number(childOf(parent, tag)?.textContent) || 0;

const make = (owner: Document, tag: string, text?: string): Element => {
  const e = owner.createElement(tag);
  if (text !== undefined) e.textContent = text;
  return e;
};

/** Các phần tử của một nốt chỉ thuộc về bè gốc (không sao sang bè mới). */
const DROP = ['tie', 'notations', 'lyric', 'beam', 'stem', 'accidental', 'notehead', 'instrument'];

/** Vị trí chèn cuối ô (trước các vạch nhịp ở cuối) và tổng độ dài ô theo divisions. */
function measureEnd(measure: Element): { anchor: Element | null; cursor: number } {
  let cursor = 0;
  for (const c of Array.from(measure.children)) {
    if (c.tagName === 'backup') cursor -= num(c, 'duration');
    else if (c.tagName === 'forward') cursor += num(c, 'duration');
    else if (c.tagName === 'note' && !childOf(c, 'chord') && !childOf(c, 'grace')) cursor += num(c, 'duration');
  }
  const children = Array.from(measure.children);
  let lastBody = -1;
  children.forEach((c, i) => {
    if (c.tagName === 'note' || c.tagName === 'backup' || c.tagName === 'forward') lastBody = i;
  });
  return { anchor: children.slice(lastBody + 1).find((c) => c.tagName === 'barline') ?? null, cursor };
}

/**
 * Viết bè cho các nốt đã chọn. `steps` là số bậc dịch so với nốt gốc (−2: bè dưới một quãng ba; +2: bè trên).
 */
export function addHarmonyVoice(doc: ScoreDocument, ids: readonly string[], steps: number): EditResult {
  const selected = ids.map((id) => doc.getInfo(id)).filter((n): n is NoteInfo => !!n && !n.isGrace && !n.isRest);
  if (selected.length === 0) return { ok: false, reason: 'voiceNone' };
  if (selected.some((n) => childOf(n.element, 'time-modification'))) return { ok: false, reason: 'tuplet' };

  const groups = new Map<string, { first: NoteInfo; entries: Set<number> }>();
  for (const n of selected) {
    const key = `${n.partIndex}|${n.measureIndex}|${n.staff}|${n.voice}`;
    const g = groups.get(key) ?? { first: n, entries: new Set<number>() };
    g.entries.add(n.entryIndex);
    groups.set(key, g);
  }

  const touched: Touched = new Map();
  const jobs = [...groups.values()].map(({ first, entries }) => {
    touch(touched, first);
    const sameMeasure = doc.notes.filter(
      (n) => n.partIndex === first.partIndex && n.measureIndex === first.measureIndex,
    );
    const newVoice = Math.max(...sameMeasure.map((n) => n.voice)) + 1;
    const source = sameMeasure.filter((n) => n.staff === first.staff && n.voice === first.voice && !n.isGrace);
    return { first, entries, newVoice, source, fifths: doc.keyAt(first.measureIndex) };
  });

  const command = commitEdit(doc, 'Viết bè', touched, [], () => {
    for (const job of jobs) {
      const measure = job.first.element.closest('measure') as Element;
      const owner = measure.ownerDocument;
      const { anchor, cursor } = measureEnd(measure);
      const staves = doc.staffCountOfPart(job.first.partIndex);
      const out: Element[] = [];
      if (cursor > 0) {
        const backup = make(owner, 'backup');
        backup.appendChild(make(owner, 'duration', String(cursor)));
        out.push(backup);
      }
      const lastSelected = Math.max(...job.entries);
      const byEntry = new Map<number, NoteInfo[]>();
      for (const n of job.source) byEntry.set(n.entryIndex, [...(byEntry.get(n.entryIndex) ?? []), n]);
      for (const [entry, members] of [...byEntry].sort((a, b) => a[0] - b[0])) {
        if (entry > lastSelected) break;
        const duration = num(members[0].element, 'duration');
        if (job.entries.has(entry) && !members[0].isRest) {
          for (const m of members) {
            const copy = m.element.cloneNode(true) as Element;
            DROP.forEach((tag) =>
              Array.from(copy.children)
                .filter((c) => c.tagName === tag)
                .forEach((c) => c.remove()),
            );
            childOf(copy, 'voice')?.replaceWith(make(owner, 'voice', String(job.newVoice)));
            if (!childOf(copy, 'voice')) childOf(copy, 'duration')?.after(make(owner, 'voice', String(job.newVoice)));
            copy.insertBefore(make(owner, 'cue'), copy.firstChild);
            const pitch = readPitch(copy);
            if (pitch) {
              let moved = pitch;
              for (let i = 0; i < Math.abs(steps); i++) {
                const next = movePitch(moved, steps < 0 ? 'stepDown' : 'stepUp', job.fifths);
                if (next === 'range') break;
                moved = next;
              }
              writePitch(copy, moved);
            }
            out.push(copy);
          }
        } else {
          const forward = make(owner, 'forward');
          forward.appendChild(make(owner, 'duration', String(duration)));
          forward.appendChild(make(owner, 'voice', String(job.newVoice)));
          if (staves > 1) forward.appendChild(make(owner, 'staff', String(job.first.staff)));
          out.push(forward);
        }
      }
      out.forEach((e) => measure.insertBefore(e, anchor));
    }
  });
  command.selectAfter = doc.notes
    .filter((n) =>
      jobs.some(
        (j) =>
          n.partIndex === j.first.partIndex &&
          n.measureIndex === j.first.measureIndex &&
          n.staff === j.first.staff &&
          n.voice === j.newVoice &&
          !n.isRest,
      ),
    )
    .map((n) => n.id);
  return { ok: true, command };
}

/** Bật / tắt "nốt nhỏ" (cue) cho các nốt đã chọn (cả hợp âm). Tất cả đã nhỏ thì đổi lại thành nốt thường. */
export function toggleCue(doc: ScoreDocument, ids: readonly string[]): EditResult {
  const selected = ids.map((id) => doc.getInfo(id)).filter((n): n is NoteInfo => !!n && !n.isGrace && !n.isRest);
  if (selected.length === 0) return { ok: false, reason: 'empty' };
  const keys = new Set(selected.map(chordKey));
  const targets = doc.notes.filter((n) => !n.isGrace && !n.isRest && keys.has(chordKey(n)));
  const allCue = targets.every((n) => childOf(n.element, 'cue'));
  const touched: Touched = new Map();
  targets.forEach((n) => touch(touched, n));
  const command = commitEdit(
    doc,
    allCue ? 'Về nốt thường' : 'Nốt nhỏ',
    touched,
    targets.map((n) => n.id),
    () => {
      for (const n of targets) {
        const cue = childOf(n.element, 'cue');
        if (allCue) cue?.remove();
        else if (!cue) n.element.insertBefore(make(n.element.ownerDocument, 'cue'), n.element.firstChild);
      }
    },
  );
  return { ok: true, command };
}

/** Xóa bè phụ (bè không phải bè thấp nhất của khuông) chứa các nốt đã chọn, trong các ô đã chọn. */
export function removeVoice(doc: ScoreDocument, ids: readonly string[]): EditResult {
  const selected = ids.map((id) => doc.getInfo(id)).filter((n): n is NoteInfo => n !== undefined);
  if (selected.length === 0) return { ok: false, reason: 'empty' };
  const groups = new Map<string, NoteInfo>();
  for (const n of selected) groups.set(`${n.partIndex}|${n.measureIndex}|${n.staff}|${n.voice}`, n);

  const jobs = [...groups.values()].filter((n) => {
    const low = Math.min(
      ...doc.notes
        .filter((x) => x.partIndex === n.partIndex && x.measureIndex === n.measureIndex && x.staff === n.staff)
        .map((x) => x.voice),
    );
    return n.voice !== low;
  });
  if (jobs.length === 0) return { ok: false, reason: 'voiceMain' };

  const touched: Touched = new Map();
  jobs.forEach((n) => touch(touched, n));
  const command = commitEdit(doc, 'Xóa bè', touched, [], () => {
    for (const n of jobs) {
      const measure = n.element.closest('measure') as Element;
      const mine = Array.from(measure.children).filter((c) => {
        if (c.tagName !== 'note' && c.tagName !== 'forward') return false;
        const voice = num(c, 'voice') || 1;
        const staff = num(c, 'staff') || 1;
        return voice === n.voice && (staff === n.staff || (c.tagName === 'forward' && !childOf(c, 'staff')));
      });
      const prev = mine[0]?.previousElementSibling;
      if (prev?.tagName === 'backup') prev.remove();
      mine.forEach((c) => c.remove());
    }
  });
  const first = doc.notes.find((n) => n.measureIndex === jobs[0].measureIndex && n.partIndex === jobs[0].partIndex);
  if (first) command.selectAfter = [first.id];
  return { ok: true, command };
}
