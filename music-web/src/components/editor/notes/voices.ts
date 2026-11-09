/**
 * Viết bè: sao các nốt đã chọn sang một bè mới cùng khuông (cùng trường độ, nốt nhỏ kiểu "cue", mặc định cách một
 * quãng ba) để người dùng chỉnh cao độ tiếp; cùng nút bật/tắt nốt nhỏ và xóa bè.
 */
import { chordKey, childOf, commitEdit, readPitch, touch, writePitch } from '../core/commands';
import type { EditResult, Touched } from '../core/commands';
import { movePitch, pitchToMidi } from './pitch';
import type { Pitch } from './pitch';
import type { NoteInfo, ScoreDocument } from '../core/ScoreDocument';

/** Thao tác viết bè trên bảng công cụ. */
export type VoiceOp = 'chordBelow' | 'chordAbove' | 'addBelow' | 'addAbove' | 'blank' | 'cue' | 'remove';

const num = (parent: Element, tag: string): number => Number(childOf(parent, tag)?.textContent) || 0;

const make = (owner: Document, tag: string, text?: string): Element => {
  const e = owner.createElement(tag);
  if (text !== undefined) e.textContent = text;
  return e;
};

/** Các phần tử của một nốt chỉ thuộc về bè gốc (không sao sang bè mới). */
const DROP = ['tie', 'notations', 'lyric', 'stem', 'accidental', 'notehead', 'instrument'];

/** Vị trí chèn cuối ô (trước các vạch nhịp ở cuối) và tổng độ dài ô theo divisions. */
export function measureEnd(measure: Element): { anchor: Element | null; cursor: number } {
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

/** Dịch cao độ `steps` bậc (âm: xuống) theo khóa của ô; vượt biên thì dừng ở nốt xa nhất đạt được. */
const shifted = (pitch: Pitch, steps: number, fifths: number): Pitch => {
  let moved = pitch;
  for (let i = 0; i < Math.abs(steps); i++) {
    const next = movePitch(moved, steps < 0 ? 'stepDown' : 'stepUp', fifths);
    if (next === 'range') break;
    moved = next;
  }
  return moved;
};

/**
 * Bè riêng: sao toàn bộ bè của khuông, trong các ô chứa nốt đã chọn, sang một bè mới (cùng khuông, cùng nhịp điệu lúc
 * đầu, thấp/cao hơn `steps` bậc). Sau đó bè mới là bè độc lập: đổi trường độ, thêm/bớt nốt, chỉnh cao độ riêng
 * (ví dụ bè chính hai nốt trắng, bè phụ bốn nốt đen). Bè mới luôn đủ độ dài ô nên không báo thiếu/thừa phách.
 */
export function addHarmonyVoice(doc: ScoreDocument, ids: readonly string[], steps: number, blank = false): EditResult {
  const selected = ids
    .map((id) => doc.getInfo(id))
    .filter((n): n is NoteInfo => !!n && !n.isGrace && (blank || !n.isRest));
  if (selected.length === 0) return { ok: false, reason: 'voiceNone' };

  const groups = new Map<string, NoteInfo>();
  for (const n of selected) groups.set(`${n.partIndex}|${n.measureIndex}|${n.staff}|${n.voice}`, n);

  const touched: Touched = new Map();
  const jobs = [...groups.values()].map((first) => {
    touch(touched, first);
    const sameMeasure = doc.notes.filter(
      (n) => n.partIndex === first.partIndex && n.measureIndex === first.measureIndex,
    );
    return {
      first,
      newVoice: Math.max(...sameMeasure.map((n) => n.voice)) + 1,
      source: sameMeasure.filter((n) => n.staff === first.staff && n.voice === first.voice && !n.isGrace),
      fifths: doc.keyAtPart(first.partIndex, first.measureIndex),
    };
  });

  const command = commitEdit(doc, 'Viết bè', touched, [], () => {
    for (const job of jobs) {
      const measure = job.first.element.closest('measure') as Element;
      const owner = measure.ownerDocument;
      const { anchor, cursor } = measureEnd(measure);
      const out: Element[] = [];
      if (cursor > 0) {
        const backup = make(owner, 'backup');
        backup.appendChild(make(owner, 'duration', String(cursor)));
        out.push(backup);
      }
      if (blank) {
        // Bè trống: một dấu lặng nguyên ô, người dùng bấm vào đó để nhập nốt với nhịp điệu riêng
        const { beats, beatType } = doc.timeAt(job.first.measureIndex);
        const length = (beats * 4 * doc.divisionsAtPart(job.first.partIndex, job.first.measureIndex)) / beatType;
        const rest = make(owner, 'note');
        const marker = make(owner, 'rest');
        marker.setAttribute('measure', 'yes');
        rest.appendChild(marker);
        rest.appendChild(make(owner, 'duration', String(Number.isInteger(length) ? length : cursor)));
        rest.appendChild(make(owner, 'voice', String(job.newVoice)));
        if (doc.staffCountOfPart(job.first.partIndex) > 1)
          rest.appendChild(make(owner, 'staff', String(job.first.staff)));
        out.push(rest);
      }
      for (const m of blank ? [] : job.source) {
        const copy = m.element.cloneNode(true) as Element;
        DROP.forEach((tag) =>
          Array.from(copy.children)
            .filter((c) => c.tagName === tag)
            .forEach((c) => c.remove()),
        );
        const keep = (m.element.querySelector('notations') ?? null) as Element | null;
        const tuplets = keep ? Array.from(keep.children).filter((c) => c.tagName === 'tuplet') : [];
        if (tuplets.length > 0) {
          const notations = make(owner, 'notations');
          tuplets.forEach((t) => notations.appendChild(t.cloneNode(true)));
          copy.appendChild(notations);
        }
        const voiceEl = childOf(copy, 'voice');
        if (voiceEl) voiceEl.textContent = String(job.newVoice);
        else childOf(copy, 'duration')?.after(make(owner, 'voice', String(job.newVoice)));
        const pitch = readPitch(copy);
        if (pitch) writePitch(copy, shifted(pitch, steps, job.fifths));
        out.push(copy);
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

/**
 * Bè cùng thân: thêm vào mỗi nốt đã chọn một nốt nữa trong hợp âm, cùng trường độ, thấp/cao hơn `steps` bậc
 * (kiểu hai nốt chung một thân như bản nhạc thánh ca). Nốt trùng cao độ sẽ dịch thêm một bậc.
 */
export function addChordNote(doc: ScoreDocument, ids: readonly string[], steps: number): EditResult {
  const selected = ids.map((id) => doc.getInfo(id)).filter((n): n is NoteInfo => !!n && !n.isGrace && !n.isRest);
  if (selected.length === 0) return { ok: false, reason: 'voiceNone' };
  const keys = new Set(selected.map(chordKey));
  const members = new Map<string, NoteInfo[]>();
  for (const n of doc.notes) {
    if (n.isGrace || n.isRest || !keys.has(chordKey(n))) continue;
    members.set(chordKey(n), [...(members.get(chordKey(n)) ?? []), n]);
  }
  const touched: Touched = new Map();
  const created: Element[] = [];
  const plans = [...members.values()];
  plans.forEach((chord) => touch(touched, chord[0]));
  const result = commitEdit(doc, 'Viết bè cùng thân', touched, [], () => {
    for (const chord of plans) {
      const head = chord[0];
      const fifths = doc.keyAtPart(head.partIndex, head.measureIndex);
      const base = readPitch(head.element);
      if (!base) continue;
      const taken = new Set(chord.map((n) => n.midi));
      let pitch = shifted(base, steps, fifths);
      let guard = 0;
      while (taken.has(pitchToMidi(pitch)) && guard++ < 8) pitch = shifted(pitch, steps < 0 ? -1 : 1, fifths);
      if (taken.has(pitchToMidi(pitch))) continue;
      const copy = head.element.cloneNode(true) as Element;
      ['tie', 'notations', 'lyric', 'accidental', 'chord', 'beam'].forEach((tag) =>
        Array.from(copy.children)
          .filter((c) => c.tagName === tag)
          .forEach((c) => c.remove()),
      );
      const chordEl = make(copy.ownerDocument, 'chord');
      const cue = childOf(copy, 'cue');
      if (cue) cue.after(chordEl);
      else copy.insertBefore(chordEl, copy.firstChild);
      writePitch(copy, pitch);
      chord[chord.length - 1].element.after(copy);
      created.push(copy);
    }
  });
  if (created.length === 0) return { ok: false, reason: 'range' };
  result.selectAfter = doc.notes.filter((n) => created.includes(n.element)).map((n) => n.id);
  return { ok: true, command: result };
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
