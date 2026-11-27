/**
 * Viết bè (mọi nốt bè cùng cỡ với nốt thường và được phát như nốt thường):
 * - **bè thân**: thêm nốt vào hợp âm của nốt đang chọn (cùng thân, cùng trường độ), chồng dưới nốt thấp nhất / trên nốt
 *   cao nhất, ưu tiên nốt thuộc hợp âm ghi trên bản (Am, G7...) nếu có; thêm đúng một cao độ (bấm vào cột nốt ở chế độ
 *   Nhập nốt) hoặc theo chữ cái (Shift + A–G);
 * - **bè riêng**: thêm một nốt vào bè thứ hai của khuông ngay tại thời điểm của một nốt có sẵn (thân riêng, trường độ
 *   riêng); chép các nốt đang chọn sang bè thứ hai (cách một quãng ba hoặc theo hợp âm); phần còn lại của ô trong bè
 *   thứ hai là dấu lặng ẩn. Hai bè trên cùng khuông tự đặt hướng thân: bè trên thân lên, bè dưới thân xuống.
 *
 * Nốt sát nhau (quãng hai, như Mi–Fa hay Si–Đô cách nửa cung) chung thân được: bộ vẽ tự đặt lệch một đầu nốt sang bên
 * kia thân. Hai nốt cùng vị trí trên khuông khác dấu hóa (Fa và Fa♯) thì không chung thân được (lý do `unison`).
 */
import { chordKey, childOf, commitEdit, readPitch, touch, writePitch } from '../core/commands';
import type { EditFailure, EditResult, Touched } from '../core/commands';
import {
  choiceQuarters,
  divisionsAt,
  hasChild,
  numberOf,
  scaledLength,
  splitRests,
  voiceEntries,
} from './durationCore';
import type { DurationChoice, DurationType, Dots, Entry } from './durationCore';
import { DURATION_QUARTERS, withRescale } from './durations';
import { keyAlter, inRange, isStep, movePitch, pitchName, pitchToMidi } from './pitch';
import type { Pitch, Step } from './pitch';
import { chordNotes } from '../notation/chordNotes';
import type { NoteInfo, ScoreDocument } from '../core/ScoreDocument';
import { t } from '../../../i18n/core';

/** Thao tác viết bè trên bảng công cụ. */
export type VoiceOp = 'chordBelow' | 'chordAbove' | 'addBelow' | 'addAbove' | 'blank' | 'remove';

const num = (parent: Element, tag: string): number => Number(childOf(parent, tag)?.textContent) || 0;

const make = (owner: Document, tag: string, text?: string): Element => {
  const e = owner.createElement(tag);
  if (text !== undefined) e.textContent = text;
  return e;
};

const removeChildren = (el: Element, tags: readonly string[]): void =>
  Array.from(el.children)
    .filter((c) => tags.includes(c.tagName))
    .forEach((c) => c.remove());

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

const mod12 = (value: number): number => ((value % 12) + 12) % 12;
const sameSpot = (a: Pitch, b: Pitch): boolean => a.step === b.step && a.octave === b.octave;

/** Bỏ dấu "nốt nhỏ" (`<cue/>`, `<type size="cue">`) của nốt sao từ nốt khác: nốt bè luôn vẽ cùng cỡ nốt thường. */
const fullSize = (note: Element): void => {
  childOf(note, 'cue')?.remove();
  childOf(note, 'type')?.removeAttribute('size');
};

// ====================================================================== hợp âm ghi trên bản

/** Thời điểm bắt đầu (divisions, tính từ đầu ô) của thẻ <note> `element` trong ô `measure`. */
export const onsetIn = (measure: Element, element: Element): number => {
  let cursor = 0;
  let last = 0;
  for (const c of Array.from(measure.children)) {
    if (c.tagName === 'backup') cursor -= num(c, 'duration');
    else if (c.tagName === 'forward') cursor += num(c, 'duration');
    else if (c.tagName === 'note') {
      const chord = hasChild(c, 'chord');
      const onset = chord ? last : cursor;
      if (c === element) return onset;
      if (!chord) {
        last = cursor;
        if (!hasChild(c, 'grace')) cursor += num(c, 'duration');
      }
    }
  }
  return 0;
};

/** Thẻ <harmony> (hợp âm ghi trên bản) có hiệu lực tại nốt `info`: hợp âm gần nhất đứng trước nó theo thời gian. */
export function harmonyAt(doc: ScoreDocument, info: NoteInfo): Element | null {
  const measures = doc.getMeasures(info.partIndex);
  let found: Element | null = null;
  for (let m = 0; m <= info.measureIndex && m < measures.length; m++) {
    const measure = measures[m];
    const limit = m === info.measureIndex ? onsetIn(measure, info.element) : Infinity;
    let cursor = 0;
    let best: { at: number; el: Element } | null = null;
    for (const c of Array.from(measure.children)) {
      if (c.tagName === 'backup') cursor -= num(c, 'duration');
      else if (c.tagName === 'forward') cursor += num(c, 'duration');
      else if (c.tagName === 'harmony') {
        const at = cursor + num(c, 'offset');
        if (at <= limit && (!best || at >= best.at)) best = { at, el: c };
      } else if (c.tagName === 'note' && !hasChild(c, 'chord') && !hasChild(c, 'grace')) cursor += num(c, 'duration');
    }
    if (best) found = best.el;
  }
  return found;
}

/** Lớp cao độ (0–11) các nốt của hợp âm ghi trên bản tại nốt `info`; null nếu không có hợp âm (hoặc N.C.). */
const harmonyClasses = (doc: ScoreDocument, info: NoteInfo): Set<number> | null => {
  const harmony = harmonyAt(doc, info);
  const notes = harmony ? chordNotes(harmony) : null;
  return notes ? new Set([...notes.tones, notes.bass].map(mod12)) : null;
};

/**
 * Nốt bè cho `base` theo hướng `direction`: không có hợp âm ghi trên bản thì cách một quãng ba theo khóa nhạc; có thì
 * lấy nốt gần nhất (quãng ba, bốn, năm, sáu) thuộc hợp âm, kể cả khi phải thêm dấu hóa (Đô♯ của hợp âm A7 ở giọng Đô).
 */
export const harmonyPitch = (base: Pitch, direction: 1 | -1, fifths: number, classes: Set<number> | null): Pitch => {
  const third = shifted(base, 2 * direction, fifths);
  if (!classes) return third;
  for (const steps of [2, 3, 4, 5]) {
    const candidate = shifted(base, steps * direction, fifths);
    const pc = mod12(pitchToMidi(candidate));
    if (classes.has(pc)) return candidate;
    for (const delta of [1, -1]) {
      if (classes.has(mod12(pc + delta)) && Math.abs(candidate.alter + delta) <= 1) {
        return { ...candidate, alter: candidate.alter + delta };
      }
    }
  }
  return third;
};

// ====================================================================== bè cùng thân (hợp âm)

/** Các nốt (không phải dấu lặng, nốt hoa mỹ) cùng hợp âm với `info`, theo thứ tự trong file (nốt đầu trước). */
const chordOf = (doc: ScoreDocument, info: NoteInfo): NoteInfo[] => {
  const key = chordKey(info);
  return doc.notes.filter((n) => !n.isGrace && !n.isRest && chordKey(n) === key);
};

/** Nốt mới trong hợp âm: sao nốt đầu (trường độ, chùm, khuông, bè), bỏ phần chỉ thuộc nốt đầu, đặt cao độ. */
const chordMember = (head: Element, pitch: Pitch): Element => {
  const copy = head.cloneNode(true) as Element;
  removeChildren(copy, ['tie', 'notations', 'lyric', 'accidental', 'chord', 'beam', 'stem']);
  fullSize(copy);
  const chordEl = make(copy.ownerDocument, 'chord');
  const grace = childOf(copy, 'grace');
  if (grace) grace.after(chordEl);
  else copy.insertBefore(chordEl, copy.firstChild);
  writePitch(copy, pitch);
  return copy;
};

/** Cao độ `pitch` có thêm được vào hợp âm `members` không: trùng hẳn (`duplicate`) hay cùng chỗ khác dấu hóa (`unison`). */
export const chordConflict = (members: readonly NoteInfo[], pitch: Pitch): 'duplicate' | 'unison' | null => {
  for (const m of members) {
    const other = readPitch(m.element);
    if (!other) continue;
    if (pitchToMidi(other) === pitchToMidi(pitch)) return 'duplicate';
    if (sameSpot(other, pitch)) return 'unison';
  }
  return null;
};

/** Nốt trong hợp âm của `id` có đúng cao độ `pitch` (để chọn lại thay vì thêm trùng); undefined nếu không có. */
export const memberAt = (doc: ScoreDocument, id: string, pitch: Pitch): NoteInfo | undefined => {
  const info = doc.getInfo(id);
  if (!info) return undefined;
  return chordOf(doc, info).find((m) => {
    const other = readPitch(m.element);
    return !!other && pitchToMidi(other) === pitchToMidi(pitch);
  });
};

const pitchLabel = (pitch: Pitch): string => pitchName(pitch);

/**
 * Thêm đúng cao độ `pitch` vào hợp âm chứa nốt `id` (cùng thân, cùng trường độ). Từ chối nốt trùng (`duplicate`) và
 * nốt cùng chỗ khác dấu hóa (`unison`, phải viết ở bè riêng).
 */
export function addChordPitch(doc: ScoreDocument, id: string, pitch: Pitch): EditResult {
  const info = doc.getInfo(id);
  if (!info || info.isRest || info.isGrace) return { ok: false, reason: 'voiceNone' };
  if (!inRange(pitchToMidi(pitch))) return { ok: false, reason: 'range' };
  const members = chordOf(doc, info);
  const conflict = chordConflict(members, pitch);
  if (conflict) return { ok: false, reason: conflict };
  const touched: Touched = new Map();
  touch(touched, info);
  let created: Element | null = null;
  const command = commitEdit(doc, t('editor.cmd.voice.addNote', { pitch: pitchLabel(pitch) }), touched, [], () => {
    created = chordMember(members[0].element, pitch);
    members[members.length - 1].element.after(created);
  });
  command.selectAfter = doc.notes.filter((n) => n.element === created).map((n) => n.id);
  command.changedIds = command.selectAfter;
  return { ok: true, command };
}

/**
 * Bè cùng thân (nút "Bè thân ↓/↑"): thêm vào mỗi hợp âm đang chọn một nốt cùng trường độ, dưới nốt THẤP nhất
 * (`direction` = −1) hoặc trên nốt CAO nhất (+1) nên bấm hai lần ra hợp âm ba nốt. Cách bao xa: theo
 * {@link harmonyPitch} (quãng ba, hoặc nốt thuộc hợp âm ghi trên bản).
 */
export function addChordNote(doc: ScoreDocument, ids: readonly string[], direction: 1 | -1): EditResult {
  const selected = ids.map((id) => doc.getInfo(id)).filter((n): n is NoteInfo => !!n && !n.isGrace && !n.isRest);
  if (selected.length === 0) return { ok: false, reason: 'voiceNone' };
  const chords = new Map<string, NoteInfo[]>();
  for (const n of selected) if (!chords.has(chordKey(n))) chords.set(chordKey(n), chordOf(doc, n));

  const plans: { members: NoteInfo[]; pitch: Pitch }[] = [];
  for (const members of chords.values()) {
    const pitches = members.map((m) => readPitch(m.element)).filter((p): p is Pitch => p !== null);
    if (pitches.length === 0) continue;
    const base = pitches.reduce((a, b) => ((pitchToMidi(b) - pitchToMidi(a)) * direction > 0 ? b : a));
    const head = members[0];
    const fifths = doc.keyAtPart(head.partIndex, head.measureIndex);
    let pitch = harmonyPitch(base, direction, fifths, harmonyClasses(doc, head));
    for (let guard = 0; chordConflict(members, pitch) && guard < 8; guard++) pitch = shifted(pitch, direction, fifths);
    if (chordConflict(members, pitch) || !inRange(pitchToMidi(pitch)) || sameSpot(pitch, base)) continue;
    plans.push({ members, pitch });
  }
  if (plans.length === 0) return { ok: false, reason: 'range' };

  const touched: Touched = new Map();
  plans.forEach((p) => touch(touched, p.members[0]));
  const created: Element[] = [];
  const result = commitEdit(doc, t('editor.cmd.voice.writeSame'), touched, [], () => {
    for (const { members, pitch } of plans) {
      const copy = chordMember(members[0].element, pitch);
      members[members.length - 1].element.after(copy);
      created.push(copy);
    }
  });
  result.selectAfter = doc.notes.filter((n) => created.includes(n.element)).map((n) => n.id);
  return { ok: true, command: result };
}

/**
 * Shift + chữ cái: thêm nốt tên `letter` (theo dấu hóa của khóa nhạc) vào hợp âm chứa `id`, ở chỗ gần nhất phía trên
 * nốt cao nhất (`direction` = +1) hoặc phía dưới nốt thấp nhất (−1), như MuseScore.
 */
export function addChordLetter(doc: ScoreDocument, id: string, letter: string, direction: 1 | -1): EditResult {
  const info = doc.getInfo(id);
  const step = letter.toUpperCase();
  if (!info || info.isRest || info.isGrace || !isStep(step)) return { ok: false, reason: 'voiceNone' };
  const members = chordOf(doc, info);
  const pitches = members.map((m) => readPitch(m.element)).filter((p): p is Pitch => p !== null);
  if (pitches.length === 0) return { ok: false, reason: 'voiceNone' };
  const base = pitches.reduce((a, b) => ((pitchToMidi(b) - pitchToMidi(a)) * direction > 0 ? b : a));
  const alter = keyAlter(doc.keyAtPart(info.partIndex, info.measureIndex), step as Step);
  let best: Pitch | null = null;
  for (let octave = base.octave - 2; octave <= base.octave + 2; octave++) {
    const candidate: Pitch = { step: step as Step, alter, octave };
    const gap = (pitchToMidi(candidate) - pitchToMidi(base)) * direction;
    if (gap <= 0 || sameSpot(candidate, base) || chordConflict(members, candidate) || !inRange(pitchToMidi(candidate)))
      continue;
    if (!best || gap < (pitchToMidi(best) - pitchToMidi(base)) * direction) best = candidate;
  }
  if (!best) return { ok: false, reason: 'range' };
  return addChordPitch(doc, members[0].id, best);
}

// ====================================================================== bè riêng (hai thân)

/** Số bè dùng cho bè thứ hai của khuông `staff`: bè phụ đã có trên khuông đó (cả part), không thì số bè mới. */
export const secondVoice = (doc: ScoreDocument, partIndex: number, staff: number, mainVoice: number): number => {
  const staves = new Map<number, Set<number>>();
  for (const n of doc.notes) {
    if (n.partIndex !== partIndex) continue;
    staves.set(n.voice, (staves.get(n.voice) ?? new Set()).add(n.staff));
  }
  const own = [...staves]
    .filter(([voice, set]) => voice !== mainVoice && set.size === 1 && set.has(staff))
    .map(([voice]) => voice)
    .sort((a, b) => a - b);
  if (own.length > 0) return own[0];
  return Math.max(0, ...staves.keys()) + 1;
};

/** Thứ tự phần tử sau <stem> trong <note>. */
const AFTER_STEM = ['notehead', 'notehead-text', 'staff', 'beam', 'notations', 'lyric', 'play', 'listen'];

const setStem = (note: Element, direction: 'up' | 'down' | null): void => {
  removeChildren(note, ['stem']);
  if (!direction) return;
  const stem = make(note.ownerDocument, 'stem', direction);
  const next = Array.from(note.children).find((c) => AFTER_STEM.includes(c.tagName));
  if (next) next.before(stem);
  else note.appendChild(stem);
};

/** Các nốt có cao độ của từng bè trên khuông `staff` trong ô. */
const pitchedByVoice = (measure: Element, staff: number): Map<number, Element[]> => {
  const out = new Map<number, Element[]>();
  for (const c of Array.from(measure.children)) {
    if (c.tagName !== 'note' || !hasChild(c, 'pitch') || hasChild(c, 'grace')) continue;
    if ((numberOf(c, 'staff') ?? 1) !== staff) continue;
    const voice = numberOf(c, 'voice') ?? 1;
    out.set(voice, [...(out.get(voice) ?? []), c]);
  }
  return out;
};

/**
 * Hướng thân khi khuông có hai bè trở lên trong ô: bè có cao độ trung bình cao nhất thân lên, các bè còn lại thân
 * xuống (tránh hai thân đè nhau). Chỉ còn một bè thì bỏ hướng thân để bộ vẽ tự chọn (`clearSingle`).
 */
export const arrangeStems = (measure: Element, staff: number, clearSingle = false): void => {
  const voices = pitchedByVoice(measure, staff);
  if (voices.size < 2) {
    if (clearSingle) voices.forEach((notes) => notes.forEach((n) => setStem(n, null)));
    return;
  }
  const average = (notes: Element[]) =>
    notes.reduce((sum, n) => sum + pitchToMidi(readPitch(n) ?? { step: 'C', alter: 0, octave: 4 }), 0) / notes.length;
  const ranked = [...voices].sort((a, b) => average(b[1]) - average(a[1]));
  ranked.forEach(([, notes], index) => notes.forEach((n) => setStem(n, index === 0 ? 'up' : 'down')));
};

/** Dấu lặng chèn vào bè thứ hai; ẩn (`print-object="no"`) để ô không đầy dấu lặng thừa. */
const fillerRests = (
  owner: Document,
  length: number,
  divisions: number,
  voice: number,
  staff: number | null,
  hidden: boolean,
): Element[] | null => {
  if (length <= 0) return [];
  const parts = splitRests(length, divisions);
  if (!parts) return null;
  return parts.map((p) => {
    const rest = make(owner, 'note');
    if (hidden) rest.setAttribute('print-object', 'no');
    rest.appendChild(make(owner, 'rest'));
    rest.appendChild(make(owner, 'duration', String(p.d)));
    rest.appendChild(make(owner, 'voice', String(voice)));
    rest.appendChild(make(owner, 'type', p.type));
    for (let i = 0; i < p.dots; i++) rest.appendChild(make(owner, 'dot'));
    if (staff !== null) rest.appendChild(make(owner, 'staff', String(staff)));
    return rest;
  });
};

/** Dựng nốt mới cho bè riêng theo đúng thứ tự phần tử của MusicXML. */
const voiceNote = (
  owner: Document,
  pitch: Pitch,
  d: number,
  choice: DurationChoice,
  voice: number,
  staff: number | null,
): Element => {
  const note = make(owner, 'note');
  const p = make(owner, 'pitch');
  p.appendChild(make(owner, 'step', pitch.step));
  if (pitch.alter !== 0) p.appendChild(make(owner, 'alter', String(pitch.alter)));
  p.appendChild(make(owner, 'octave', String(pitch.octave)));
  note.appendChild(p);
  note.appendChild(make(owner, 'duration', String(d)));
  note.appendChild(make(owner, 'voice', String(voice)));
  note.appendChild(make(owner, 'type', choice.type));
  for (let i = 0; i < choice.dots; i++) note.appendChild(make(owner, 'dot'));
  if (staff !== null) note.appendChild(make(owner, 'staff', String(staff)));
  return note;
};

/** Trường độ (hình nốt, chấm dôi) của nốt `note`; null nếu không có <type> hợp lệ. */
export const choiceOf = (note: Element): DurationChoice | null => {
  const type = childOf(note, 'type')?.textContent?.trim() ?? '';
  if (!(type in DURATION_QUARTERS)) return null;
  const dots = Math.min(2, Array.from(note.children).filter((c) => c.tagName === 'dot').length) as Dots;
  return { type: type as DurationType, dots };
};

const isPlainRest = (entry: Entry): boolean =>
  entry.isRest && entry.members.length === 1 && !hasChild(entry.members[0], 'time-modification');

/**
 * Thêm một nốt vào bè thứ hai của khuông, đúng thời điểm của nốt `id` (bấm vào cột nốt, chọn "Bè riêng"). Bè thứ hai
 * chưa có trong ô thì tạo (dấu lặng ẩn trước và sau nốt); đã có thì nốt mới thay chỗ các dấu lặng ở thời điểm đó.
 */
function addVoiceNoteOnce(doc: ScoreDocument, id: string, pitch: Pitch, choice: DurationChoice): EditResult {
  const info = doc.getInfo(id);
  if (!info || info.isGrace) return { ok: false, reason: 'voiceNone' };
  if (!inRange(pitchToMidi(pitch))) return { ok: false, reason: 'range' };
  const measure = doc.getMeasure(info.partIndex, info.measureIndex);
  if (!measure) return { ok: false, reason: 'empty' };
  if (hasChild(info.element, 'time-modification')) return { ok: false, reason: 'tuplet' };
  const divisions = divisionsAt(measure.parentElement, measure);
  const length = scaledLength(choiceQuarters(choice), divisions);
  if (length === null) return { ok: false, reason: 'divisions' };
  const main = voiceEntries(measure, info.staff, info.voice);
  if (!main) return { ok: false, reason: 'unsupported' };
  const capacity = main.reduce((sum, e) => sum + e.duration, 0);
  const onset = onsetIn(measure, info.element);
  if (onset + length > capacity) return { ok: false, reason: 'noSpace' };

  const voice = secondVoice(doc, info.partIndex, info.staff, info.voice);
  const staffTag = hasChild(info.element, 'staff') || info.staff > 1 ? info.staff : null;
  const owner = measure.ownerDocument;
  const note = voiceNote(owner, pitch, length, choice, voice, staffTag);
  const existing = voiceEntries(measure, info.staff, voice);
  if (existing === null) return { ok: false, reason: 'unsupported' };

  let apply: (() => void) | null = null;
  if (existing.length === 0) {
    const before = fillerRests(owner, onset, divisions, voice, staffTag, true);
    const after = fillerRests(owner, capacity - onset - length, divisions, voice, staffTag, true);
    if (!before || !after) return { ok: false, reason: 'divisions' };
    apply = () => {
      const { anchor, cursor } = measureEnd(measure);
      const out: Element[] = [];
      if (cursor > 0) {
        const backup = make(owner, 'backup');
        backup.appendChild(make(owner, 'duration', String(cursor)));
        out.push(backup);
      }
      out.push(...before, note, ...after);
      out.forEach((e) => measure.insertBefore(e, anchor));
    };
  } else {
    // Các dấu lặng liền nhau của bè thứ hai phủ đoạn [onset, onset + length]
    let start = 0;
    let first = -1;
    let coverStart = 0;
    for (let i = 0; i < existing.length; i++) {
      const end = start + existing[i].duration;
      if (first < 0 && start <= onset && onset < end) {
        if (!isPlainRest(existing[i])) return { ok: false, reason: 'noSpace' };
        first = i;
        coverStart = start;
      }
      if (first >= 0) {
        if (!isPlainRest(existing[i])) return { ok: false, reason: 'noSpace' };
        if (end >= onset + length) {
          const covered = existing.slice(first, i + 1);
          const hidden = covered[0].members[0].getAttribute('print-object') === 'no';
          const before = fillerRests(owner, onset - coverStart, divisions, voice, staffTag, hidden);
          const after = fillerRests(owner, end - onset - length, divisions, voice, staffTag, hidden);
          if (!before || !after) return { ok: false, reason: 'divisions' };
          apply = () => {
            const anchor = covered[0].members[0];
            [...before, note, ...after].forEach((e) => anchor.before(e));
            covered.forEach((e) => e.members.forEach((m) => m.remove()));
          };
          break;
        }
      }
      start = end;
    }
  }
  if (!apply) return { ok: false, reason: 'noSpace' };
  const run = apply;

  const touched: Touched = new Map();
  touch(touched, info);
  const command = commitEdit(doc, t('editor.cmd.voice.addVoiceNote', { pitch: pitchLabel(pitch) }), touched, [], () => {
    run();
    arrangeStems(measure, info.staff);
  });
  command.selectAfter = doc.notes.filter((n) => n.element === note).map((n) => n.id);
  command.changedIds = command.selectAfter;
  return { ok: true, command };
}

/** {@link addVoiceNoteOnce}, tự chia nhỏ divisions của part khi cần. */
export function addVoiceNote(doc: ScoreDocument, id: string, pitch: Pitch, choice: DurationChoice): EditResult {
  const part = doc.getInfo(id)?.partIndex ?? 0;
  const element = doc.getInfo(id)?.element;
  // Chia lại divisions làm đổi id: tìm lại nốt theo thẻ sau mỗi lần thử
  return withRescale(doc, part, () => {
    const current = doc.notes.find((n) => n.element === element);
    return current ? addVoiceNoteOnce(doc, current.id, pitch, choice) : { ok: false, reason: 'empty' };
  });
}

// ====================================================================== chép bè / bè trống

const inTuplet = (entry: Entry): boolean => entry.members.some((m) => hasChild(m, 'time-modification'));

/**
 * Chép bè (nút "Chép bè ↓/↑"): các nốt đang chọn (trong mỗi ô: từ nốt chọn đầu tới nốt chọn cuối) được chép sang bè
 * thứ hai của khuông, thấp/cao hơn theo {@link harmonyPitch} (quãng ba, hoặc nốt thuộc hợp âm ghi trên bản); phần còn
 * lại của ô là dấu lặng ẩn. Mọi ô dùng chung một số bè. Ô có chùm (liên ba...) chép cả ô để chùm không bị cắt.
 * `blank`: bè trống (một dấu lặng cả ô) để bấm vào nhập nốt với nhịp điệu riêng.
 */
export function addHarmonyVoice(doc: ScoreDocument, ids: readonly string[], steps: number, blank = false): EditResult {
  const selected = ids
    .map((id) => doc.getInfo(id))
    .filter((n): n is NoteInfo => !!n && !n.isGrace && (blank || !n.isRest));
  if (selected.length === 0) return { ok: false, reason: 'voiceNone' };
  const direction: 1 | -1 = steps < 0 ? -1 : 1;

  const groups = new Map<string, NoteInfo[]>();
  for (const n of selected) {
    const key = `${n.partIndex}|${n.measureIndex}|${n.staff}|${n.voice}`;
    groups.set(key, [...(groups.get(key) ?? []), n]);
  }
  const voices = new Map<string, number>();
  const voiceFor = (n: NoteInfo): number => {
    const key = `${n.partIndex}|${n.staff}|${n.voice}`;
    if (!voices.has(key)) voices.set(key, secondVoice(doc, n.partIndex, n.staff, n.voice));
    return voices.get(key) as number;
  };

  type Job = { first: NoteInfo; voice: number; build: (owner: Document) => Element[] | EditFailure };
  const jobs: Job[] = [];
  for (const picked of groups.values()) {
    const first = picked[0];
    const measure = doc.getMeasure(first.partIndex, first.measureIndex);
    if (!measure) continue;
    let voice = voiceFor(first);
    const entries = voiceEntries(measure, first.staff, first.voice);
    const existing = voiceEntries(measure, first.staff, voice);
    if (existing === null || existing.length > 0) {
      // Ô đã có bè thứ hai: thêm một bè mới nữa thay vì ghi chồng lên bè đó
      voice = Math.max(...doc.notes.filter((n) => n.partIndex === first.partIndex).map((n) => n.voice)) + 1;
    }
    const divisions = divisionsAt(measure.parentElement, measure);
    const staffTag = hasChild(first.element, 'staff') || first.staff > 1 ? first.staff : null;
    const fifths = doc.keyAtPart(first.partIndex, first.measureIndex);
    const capacity = entries ? entries.reduce((sum, e) => sum + e.duration, 0) : measureEnd(measure).cursor;

    if (blank) {
      jobs.push({
        first,
        voice,
        build: (owner) => {
          const { beats, beatType } = doc.timeAt(first.measureIndex);
          const length = (beats * 4 * divisions) / beatType;
          const rest = make(owner, 'note');
          const marker = make(owner, 'rest');
          marker.setAttribute('measure', 'yes');
          rest.appendChild(marker);
          rest.appendChild(make(owner, 'duration', String(Number.isInteger(length) ? length : capacity)));
          rest.appendChild(make(owner, 'voice', String(voice)));
          if (staffTag !== null) rest.appendChild(make(owner, 'staff', String(first.staff)));
          return [rest];
        },
      });
      continue;
    }

    // Đoạn chép: từ mục chọn đầu tới mục chọn cuối (ô có chùm hoặc bè có <forward>: cả ô)
    const elements = new Set(picked.map((n) => n.element));
    let from = 0;
    let to = (entries?.length ?? 0) - 1;
    if (entries && !entries.some(inTuplet)) {
      const hit = entries.map((e, i) => (e.members.some((m) => elements.has(m)) ? i : -1)).filter((i) => i >= 0);
      if (hit.length > 0) {
        from = hit[0];
        to = hit[hit.length - 1];
      }
    }
    const source = entries ? entries.slice(from, to + 1) : [];
    if (!entries || source.length === 0) continue;
    const startAt = entries.slice(0, from).reduce((sum, e) => sum + e.duration, 0);
    const endAt = startAt + source.reduce((sum, e) => sum + e.duration, 0);
    const harmony = harmonyClasses(doc, first);
    jobs.push({
      first,
      voice,
      build: (owner) => {
        const before = fillerRests(owner, startAt, divisions, voice, staffTag, true);
        const after = fillerRests(owner, capacity - endAt, divisions, voice, staffTag, true);
        if (!before || !after) return 'divisions';
        const copies: Element[] = [];
        for (const entry of source) {
          const single = entry.members.length === 1;
          for (const m of entry.members) {
            const copy = m.cloneNode(true) as Element;
            removeChildren(copy, DROP);
            const keep = m.querySelector('notations');
            const tuplets = keep ? Array.from(keep.children).filter((c) => c.tagName === 'tuplet') : [];
            if (tuplets.length > 0) {
              const notations = make(owner, 'notations');
              tuplets.forEach((tuplet) => notations.appendChild(tuplet.cloneNode(true)));
              copy.appendChild(notations);
            }
            fullSize(copy);
            const voiceEl = childOf(copy, 'voice');
            if (voiceEl) voiceEl.textContent = String(voice);
            else childOf(copy, 'duration')?.after(make(owner, 'voice', String(voice)));
            if (entry.isRest) copy.setAttribute('print-object', 'no');
            const pitch = readPitch(copy);
            if (pitch) {
              // Nốt đơn: theo hợp âm ghi trên bản; hợp âm: dịch cả hợp âm một quãng ba
              writePitch(
                copy,
                single ? harmonyPitch(pitch, direction, fifths, harmony) : shifted(pitch, steps, fifths),
              );
            }
            copies.push(copy);
          }
        }
        return [...before, ...copies, ...after];
      },
    });
  }
  if (jobs.length === 0) return { ok: false, reason: 'voiceNone' };

  const touched: Touched = new Map();
  jobs.forEach((j) => touch(touched, j.first));
  const state: { failure: EditFailure | null } = { failure: null };
  const created = new Set<Element>();
  const command = commitEdit(doc, t('editor.cmd.voice.write'), touched, [], () => {
    for (const job of jobs) {
      const measure = job.first.element.closest('measure') as Element;
      const owner = measure.ownerDocument;
      const built = job.build(owner);
      if (typeof built === 'string') {
        state.failure = built;
        continue;
      }
      const { anchor, cursor } = measureEnd(measure);
      const out: Element[] = [];
      if (cursor > 0) {
        const backup = make(owner, 'backup');
        backup.appendChild(make(owner, 'duration', String(cursor)));
        out.push(backup);
      }
      out.push(...built);
      out.forEach((e) => measure.insertBefore(e, anchor));
      built.forEach((e) => created.add(e));
      if (!blank) arrangeStems(measure, job.first.staff);
    }
  });
  if (state.failure && created.size === 0) {
    // Không ô nào làm được: trả các ô về như cũ
    for (const snap of command.snapshots) {
      doc.replaceMeasure(snap.partIndex, snap.measureIndex, snap.before.cloneNode(true) as Element, false);
    }
    doc.reindex();
    return { ok: false, reason: state.failure };
  }
  command.selectAfter = doc.notes.filter((n) => created.has(n.element) && (blank || !n.isRest)).map((n) => n.id);
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
  const command = commitEdit(doc, t('editor.cmd.voice.remove'), touched, [], () => {
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
      // Khuông chỉ còn một bè: bỏ hướng thân đã ép khi viết bè để bộ vẽ tự đặt lại
      arrangeStems(measure, n.staff, true);
    }
  });
  const first = doc.notes.find((n) => n.measureIndex === jobs[0].measureIndex && n.partIndex === jobs[0].partIndex);
  if (first) command.selectAfter = [first.id];
  return { ok: true, command };
}
