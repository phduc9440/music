/**
 * Các lệnh sửa MusicXML của trình chỉnh sửa. Mỗi lệnh sửa DOM trong {@link ScoreDocument} và trả về bản sao ô nhịp
 * trước/sau để {@link History} hoàn tác, làm lại. Không phụ thuộc React hay OSMD.
 */
import type { NoteInfo, ScoreDocument } from './ScoreDocument';
import { AccidentalState, accidentalName, isStep, movePitch, pitchToMidi } from './pitch';
import type { Pitch, PitchOp } from './pitch';

/** Bản sao một ô nhịp trước và sau khi sửa. */
export interface MeasureSnapshot {
  partIndex: number;
  measureIndex: number;
  before: Element;
  after: Element;
}

/** Một thao tác đã áp dụng, đủ dữ liệu để hoàn tác / làm lại. */
export interface EditCommand {
  /** Nhãn tiếng Việt, ví dụ "Lên nửa cung". */
  label: string;
  snapshots: MeasureSnapshot[];
  /** Id các nốt bị đổi (kể cả nốt nối kéo theo). */
  changedIds: string[];
}

/** Lý do một thao tác không thực hiện được. */
export type EditFailure = 'range' | 'rest' | 'duplicate';

export type EditResult = { ok: true; command: EditCommand } | { ok: false; reason: EditFailure };

/** Nhãn hiển thị của từng thao tác cao độ. */
export const PITCH_OP_LABELS: Record<PitchOp, string> = {
  stepUp: 'Lên một bậc',
  stepDown: 'Xuống một bậc',
  semitoneUp: 'Lên nửa cung',
  semitoneDown: 'Xuống nửa cung',
  octaveUp: 'Lên một quãng tám',
  octaveDown: 'Xuống một quãng tám',
};

/** Thông báo tiếng Việt cho từng lý do thất bại. */
export const EDIT_FAILURE_MESSAGES: Record<EditFailure, string> = {
  range: 'Không thể đổi: cao độ vượt quá khoảng A0–C8',
  rest: 'Dấu lặng không có cao độ nên không đổi được',
  duplicate: 'Không thể đổi: hợp âm đã có nốt cùng cao độ',
};

const childOf = (parent: Element, tag: string): Element | undefined =>
  Array.from(parent.children).find((c) => c.tagName === tag);

/** Đọc cao độ của thẻ <note>; null nếu là dấu lặng hoặc dữ liệu thiếu. */
export const readPitch = (note: Element): Pitch | null => {
  const pitch = childOf(note, 'pitch');
  if (!pitch) return null;
  const step = childOf(pitch, 'step')?.textContent?.trim() ?? '';
  const octave = Number(childOf(pitch, 'octave')?.textContent);
  const alter = Math.round(Number(childOf(pitch, 'alter')?.textContent ?? 0) || 0);
  if (!isStep(step) || !Number.isFinite(octave)) return null;
  return { step, alter, octave };
};

/** Ghi lại <step>, <alter> (chỉ khi khác 0), <octave> theo đúng thứ tự của MusicXML. */
export const writePitch = (note: Element, value: Pitch): void => {
  const pitch = childOf(note, 'pitch');
  if (!pitch) return;
  const owner = pitch.ownerDocument;
  pitch.replaceChildren();
  const add = (tag: string, text: string) => {
    const el = owner.createElement(tag);
    el.textContent = text;
    pitch.appendChild(el);
  };
  add('step', value.step);
  if (value.alter !== 0) add('alter', String(value.alter));
  add('octave', String(value.octave));
};

/** Các phần tử đứng sau <accidental> trong thứ tự của MusicXML. */
const AFTER_ACCIDENTAL = [
  'time-modification',
  'stem',
  'notehead',
  'notehead-text',
  'staff',
  'beam',
  'notations',
  'lyric',
];

/** Đặt (hoặc xóa khi alter = null) thẻ <accidental> của nốt, đúng vị trí theo lược đồ MusicXML. */
const setAccidental = (note: Element, alter: number | null): void => {
  Array.from(note.children)
    .filter((c) => c.tagName === 'accidental')
    .forEach((c) => c.remove());
  if (alter === null) return;
  const el = note.ownerDocument.createElement('accidental');
  el.textContent = accidentalName(alter);
  const children = Array.from(note.children);
  const lastBase = [...children].reverse().find((c) => c.tagName === 'type' || c.tagName === 'dot');
  if (lastBase) {
    lastBase.after(el);
    return;
  }
  const next = children.find((c) => AFTER_ACCIDENTAL.includes(c.tagName));
  if (next) next.before(el);
  else note.appendChild(el);
};

const hasTie = (note: Element, type: 'start' | 'stop'): boolean =>
  Array.from(note.children).some((c) => c.tagName === 'tie' && c.getAttribute('type') === type);

/** Nốt cùng cao độ, cùng bè nối với nốt đã cho (nối tới trước và sau), không gồm chính nó. */
const tieChain = (doc: ScoreDocument, info: NoteInfo, indexOf: Map<string, number>): NoteInfo[] => {
  const all = doc.notes;
  const start = indexOf.get(info.id) ?? -1;
  if (start < 0) return [];
  const same = (a: NoteInfo, b: NoteInfo) =>
    a.partIndex === b.partIndex && a.staff === b.staff && a.voice === b.voice && a.midi === b.midi;
  const chain: NoteInfo[] = [];
  let current = info;
  let from = start;
  while (hasTie(current.element, 'start')) {
    const next = all.slice(from + 1).find((n) => same(n, current) && hasTie(n.element, 'stop'));
    if (!next) break;
    chain.push(next);
    current = next;
    from = indexOf.get(next.id) ?? all.length;
  }
  current = info;
  from = start;
  while (hasTie(current.element, 'stop')) {
    const prev = all
      .slice(0, from)
      .reverse()
      .find((n) => same(n, current) && hasTie(n.element, 'start'));
    if (!prev) break;
    chain.push(prev);
    current = prev;
    from = indexOf.get(prev.id) ?? 0;
  }
  return chain;
};

/** Tính lại dấu hóa hiển thị của mọi nốt trong một ô nhịp theo trạng thái dấu hóa của từng khuông. */
const refreshAccidentals = (doc: ScoreDocument, partIndex: number, measureIndex: number): void => {
  const fifths = doc.keyAt(measureIndex);
  const byStaff = new Map<number, NoteInfo[]>();
  for (const info of doc.notes) {
    if (info.partIndex !== partIndex || info.measureIndex !== measureIndex || info.isRest) continue;
    const list = byStaff.get(info.staff) ?? [];
    list.push(info);
    byStaff.set(info.staff, list);
  }
  for (const list of byStaff.values()) {
    const state = new AccidentalState(fifths);
    // sort ổn định: cùng thời điểm giữ thứ tự trong file
    const ordered = [...list].sort((a, b) => a.onsetKey - b.onsetKey);
    for (const info of ordered) {
      const pitch = readPitch(info.element);
      if (!pitch) continue;
      const shown = state.visit(pitch);
      // Nốt nối (stop) không vẽ lại dấu hóa; giữ nguyên nếu đã có
      if (hasTie(info.element, 'stop') && shown !== null) continue;
      setAccidental(info.element, shown);
    }
  }
};

const chordKey = (n: NoteInfo): string => `${n.partIndex}|${n.measureIndex}|${n.staff}|${n.voice}|${n.entryIndex}`;

/**
 * Đổi cao độ cho các nốt đã chọn. Dấu lặng bị bỏ qua; nốt có dấu nối kéo theo cả chuỗi nốt nối. Nếu có bất kỳ
 * nốt nào vượt A0–C8 hoặc làm trùng cao độ trong hợp âm thì không đổi gì cả.
 * @param doc tài liệu đang sửa
 * @param ids id các nốt đang chọn
 * @param op thao tác
 * @param count số lần lặp thao tác (kéo nốt nhiều bậc vẫn là một lệnh)
 * @returns lệnh đã áp dụng (để đưa vào lịch sử) hoặc lý do thất bại; khi thất bại DOM không thay đổi
 */
export function changePitch(doc: ScoreDocument, ids: readonly string[], op: PitchOp, count = 1): EditResult {
  const selected = ids.map((id) => doc.getInfo(id)).filter((n): n is NoteInfo => n !== undefined);
  const pitched = selected.filter((n) => !n.isRest && readPitch(n.element));
  if (pitched.length === 0) return { ok: false, reason: 'rest' };

  const indexOf = new Map<string, number>();
  doc.notes.forEach((n, i) => indexOf.set(n.id, i));

  // Cao độ mới của từng nốt (nốt chọn trước, rồi nốt nối nhận cùng cao độ với nốt gốc)
  const next = new Map<string, Pitch>();
  for (const info of pitched) {
    const old = readPitch(info.element) as Pitch;
    let moved: Pitch = old;
    for (let i = 0; i < count; i++) {
      const step = movePitch(moved, op, doc.keyAt(info.measureIndex));
      if (step === 'range') return { ok: false, reason: 'range' };
      moved = step;
    }
    next.set(info.id, moved);
  }
  for (const info of pitched) {
    const moved = next.get(info.id) as Pitch;
    for (const tied of tieChain(doc, info, indexOf)) {
      if (!next.has(tied.id)) next.set(tied.id, moved);
    }
  }

  // Không để hai nốt trong cùng hợp âm trùng cao độ
  const touchedChords = new Set<string>();
  for (const id of next.keys()) {
    const info = doc.getInfo(id);
    if (info) touchedChords.add(chordKey(info));
  }
  const seen = new Map<string, Set<number>>();
  for (const info of doc.notes) {
    if (info.isRest || info.isGrace) continue;
    const key = chordKey(info);
    if (!touchedChords.has(key)) continue;
    const pitch = next.get(info.id) ?? readPitch(info.element);
    if (!pitch) continue;
    const midi = pitchToMidi(pitch);
    const set = seen.get(key) ?? new Set<number>();
    if (set.has(midi)) return { ok: false, reason: 'duplicate' };
    set.add(midi);
    seen.set(key, set);
  }

  // Áp dụng
  const touched = new Map<string, { partIndex: number; measureIndex: number }>();
  for (const id of next.keys()) {
    const info = doc.getInfo(id) as NoteInfo;
    touched.set(`${info.partIndex}|${info.measureIndex}`, {
      partIndex: info.partIndex,
      measureIndex: info.measureIndex,
    });
  }
  const snapshots = [...touched.values()].map((t) => ({
    ...t,
    before: doc.getMeasure(t.partIndex, t.measureIndex)?.cloneNode(true) as Element,
    after: null as unknown as Element,
  }));
  for (const [id, pitch] of next) writePitch((doc.getInfo(id) as NoteInfo).element, pitch);
  for (const t of touched.values()) refreshAccidentals(doc, t.partIndex, t.measureIndex);
  for (const s of snapshots) s.after = doc.getMeasure(s.partIndex, s.measureIndex)?.cloneNode(true) as Element;
  doc.reindex();

  return {
    ok: true,
    command: {
      label: count > 1 ? `${PITCH_OP_LABELS[op]} (${count} lần)` : PITCH_OP_LABELS[op],
      snapshots,
      changedIds: [...next.keys()],
    },
  };
}
