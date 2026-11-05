/**
 * Đổi trường độ và nhập nốt bằng bàn phím. Độ dài mỗi ô nhịp luôn được giữ nguyên:
 * - nốt ngắn đi thì phần trống phía sau được lấp bằng dấu lặng;
 * - nốt dài ra thì ghi đè các nốt/dấu lặng liền sau nó trong cùng bè (phần dư của mục bị cắt dở thành dấu lặng);
 *   kéo quá cuối ô nhịp thì từ chối.
 * Chưa hỗ trợ nốt có dấu nối và nhóm nốt đặc biệt (chùm ba...).
 */
import { chordKey, childOf, commitEdit, hasTie, readPitch, touch, writePitch } from './commands';
import type { EditFailure, EditResult, Touched } from './commands';
import { inRange, keyAlter, pitchToMidi, isStep } from './pitch';
import type { Pitch, Step } from './pitch';
import type { NoteInfo, ScoreDocument } from './ScoreDocument';

/** Các trường độ cơ bản của bảng công cụ. */
export type DurationType = 'whole' | 'half' | 'quarter' | 'eighth' | '16th';

export interface DurationChoice {
  type: DurationType;
  dotted: boolean;
}

/** Độ dài tính bằng số nốt đen. */
export const DURATION_QUARTERS: Record<DurationType, number> = {
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
  '16th': 0.25,
};

/** Tên tiếng Việt hiển thị. */
export const DURATION_LABELS: Record<DurationType, string> = {
  whole: 'tròn',
  half: 'trắng',
  quarter: 'đen',
  eighth: 'móc đơn',
  '16th': 'móc kép',
};

/** Các giá trị dùng để chia phần trống thành dấu lặng, từ lớn đến nhỏ. */
const REST_VALUES: { quarters: number; type: DurationType; dotted: boolean }[] = [
  { quarters: 4, type: 'whole', dotted: false },
  { quarters: 3, type: 'half', dotted: true },
  { quarters: 2, type: 'half', dotted: false },
  { quarters: 1.5, type: 'quarter', dotted: true },
  { quarters: 1, type: 'quarter', dotted: false },
  { quarters: 0.75, type: 'eighth', dotted: true },
  { quarters: 0.5, type: 'eighth', dotted: false },
  { quarters: 0.25, type: '16th', dotted: false },
];

interface Entry {
  /** Các thẻ <note> của một nốt hoặc hợp âm; phần tử đầu là nốt đầu. */
  members: Element[];
  duration: number;
  isRest: boolean;
}

const numberOf = (parent: Element, tag: string): number | null => {
  const text = childOf(parent, tag)?.textContent?.trim();
  const value = Number(text);
  return text && Number.isFinite(value) ? value : null;
};

const hasChild = (el: Element, tag: string): boolean => childOf(el, tag) !== undefined;

/** Các nốt/hợp âm/dấu lặng của một bè trong ô nhịp, theo thứ tự; null nếu bè có <forward> (chưa hỗ trợ). */
const voiceEntries = (measure: Element, staff: number, voice: number): Entry[] | null => {
  const entries: Entry[] = [];
  for (const child of Array.from(measure.children)) {
    if (child.tagName === 'forward' && (numberOf(child, 'voice') ?? 1) === voice) return null;
    if (child.tagName !== 'note' || hasChild(child, 'grace')) continue;
    if ((numberOf(child, 'staff') ?? 1) !== staff || (numberOf(child, 'voice') ?? 1) !== voice) continue;
    if (hasChild(child, 'chord') && entries.length > 0) {
      entries[entries.length - 1].members.push(child);
    } else {
      entries.push({ members: [child], duration: numberOf(child, 'duration') ?? 0, isRest: hasChild(child, 'rest') });
    }
  }
  return entries;
};

/** Chia `total` (đơn vị divisions) thành các dấu lặng hợp lệ; null nếu không chia vừa (divisions quá thô). */
const splitRests = (total: number, divisions: number): { d: number; type: DurationType; dotted: boolean }[] | null => {
  const out: { d: number; type: DurationType; dotted: boolean }[] = [];
  let left = total;
  while (left > 0) {
    const fit = REST_VALUES.find((v) => Number.isInteger(v.quarters * divisions) && v.quarters * divisions <= left);
    if (!fit) return null;
    out.push({ d: fit.quarters * divisions, type: fit.type, dotted: fit.dotted });
    left -= fit.quarters * divisions;
  }
  return out;
};

/** Đặt thẻ `el` sau thẻ đầu tiên tìm thấy trong `after` (theo thứ tự ưu tiên); không có thì thêm vào cuối. */
const placeAfter = (note: Element, el: Element, after: string[]): void => {
  for (const tag of after) {
    const anchor = Array.from(note.children).find((c) => c.tagName === tag);
    if (anchor) {
      anchor.after(el);
      return;
    }
  }
  note.appendChild(el);
};

/** Ghi trường độ mới vào một thẻ <note>: <duration>, <type>, <dot/>; bỏ <beam> vì nhóm nốt đã đổi. */
const writeDuration = (note: Element, d: number, type: DurationType, dotted: boolean): void => {
  const owner = note.ownerDocument;
  const duration = childOf(note, 'duration');
  if (duration) duration.textContent = String(d);
  let typeEl = childOf(note, 'type');
  if (!typeEl) {
    typeEl = owner.createElement('type');
    placeAfter(note, typeEl, ['voice', 'duration']);
  }
  typeEl.textContent = type;
  Array.from(note.children)
    .filter((c) => c.tagName === 'dot' || c.tagName === 'beam')
    .forEach((c) => c.remove());
  if (dotted) typeEl.after(owner.createElement('dot'));
};

/** Bỏ thông tin nối nét (<beam>) của cả bè trong ô để OSMD không gặp nét nối đứt đoạn sau khi trường độ đổi. */
const stripBeams = (entries: Entry[]): void => {
  for (const entry of entries) {
    for (const note of entry.members) {
      Array.from(note.children)
        .filter((c) => c.tagName === 'beam')
        .forEach((c) => c.remove());
    }
  }
};

/** Dựng thẻ <note> dấu lặng có cùng khuông và bè với `like`. */
const makeRest = (like: Element, d: number, type: DurationType, dotted: boolean): Element => {
  const owner = like.ownerDocument;
  const note = owner.createElement('note');
  const add = (tag: string, text?: string) => {
    const el = owner.createElement(tag);
    if (text !== undefined) el.textContent = text;
    note.appendChild(el);
  };
  add('rest');
  add('duration', String(d));
  add('voice', String(numberOf(like, 'voice') ?? 1));
  add('type', type);
  if (dotted) add('dot');
  if (hasChild(like, 'staff')) add('staff', String(numberOf(like, 'staff') ?? 1));
  return note;
};

type Plan = { error: EditFailure } | { run: () => void };

/**
 * Lập kế hoạch đổi trường độ của một nốt/hợp âm/dấu lặng (chưa sửa DOM). Trả về lỗi nếu không làm được, để người
 * gọi có thể từ chối trước khi đụng vào bản nhạc.
 */
const planDuration = (head: Element, choice: DurationChoice, keep = true): Plan => {
  const measure = head.parentElement;
  if (!measure) return { error: 'unsupported' };
  const staff = numberOf(head, 'staff') ?? 1;
  const voice = numberOf(head, 'voice') ?? 1;
  const entries = voiceEntries(measure, staff, voice);
  if (!entries) return { error: 'unsupported' };
  const index = entries.findIndex((e) => e.members.includes(head));
  if (index < 0) return { error: 'unsupported' };
  const entry = entries[index];
  if (entry.members.some((m) => hasChild(m, 'time-modification'))) return { error: 'tuplet' };
  if (keep && entry.members.some((m) => hasTie(m, 'start') || hasTie(m, 'stop'))) return { error: 'tie' };

  const part = measure.parentElement;
  const divisions = divisionsAt(part, measure);
  const target = DURATION_QUARTERS[choice.type] * (choice.dotted ? 1.5 : 1) * divisions;
  if (!Number.isInteger(target)) return { error: 'divisions' };
  const delta = target - entry.duration;
  // Đã đúng cả độ dài, loại nốt lẫn chấm dôi thì không có gì để đổi (file OMR đôi khi có <type> lệch <duration>)
  const sameLook =
    childOf(head, 'type')?.textContent?.trim() === choice.type && hasChild(head, 'dot') === choice.dotted;
  if (delta === 0 && sameLook) return { error: 'unchanged' };

  const apply = (): void => entry.members.forEach((m) => writeDuration(m, target, choice.type, choice.dotted));

  // Đổi thẳng: chỉ đổi nốt này, các nốt khác giữ nguyên; ô nhịp thừa/thiếu phách sẽ được viền đỏ để người dùng tự sửa
  if (!keep || delta === 0) {
    return {
      run: () => {
        apply();
        stripBeams(entries);
      },
    };
  }

  if (delta < 0) {
    const rests = splitRests(-delta, divisions);
    if (!rests) return { error: 'divisions' };
    return {
      run: () => {
        apply();
        stripBeams(entries);
        let anchor = entry.members[entry.members.length - 1];
        for (const r of rests) {
          const rest = makeRest(head, r.d, r.type, r.dotted);
          anchor.after(rest);
          anchor = rest;
        }
      },
    };
  }

  // Kéo dài: ghi đè các nốt/dấu lặng liền sau trong cùng bè (hoàn tác được); phần dư của mục cuối thành dấu lặng
  let remaining = delta;
  const consumed: Entry[] = [];
  let leftover = 0;
  for (let j = index + 1; j < entries.length && remaining > 0; j++) {
    const next = entries[j];
    if (next.members.some((m) => hasChild(m, 'time-modification'))) return { error: 'tuplet' };
    if (next.members.some((m) => hasTie(m, 'start') || hasTie(m, 'stop'))) return { error: 'tie' };
    consumed.push(next);
    if (next.duration <= remaining) remaining -= next.duration;
    else {
      leftover = next.duration - remaining;
      remaining = 0;
    }
  }
  if (remaining > 0) return { error: 'noSpace' };
  const leftoverRests = leftover > 0 ? splitRests(leftover, divisions) : [];
  if (!leftoverRests) return { error: 'divisions' };
  return {
    run: () => {
      apply();
      stripBeams(entries);
      consumed.forEach((e) => e.members.forEach((m) => m.remove()));
      let anchor = entry.members[entry.members.length - 1];
      for (const r of leftoverRests) {
        const rest = makeRest(head, r.d, r.type, r.dotted);
        anchor.after(rest);
        anchor = rest;
      }
    },
  };
};

/** Divisions có hiệu lực tại ô nhịp `measure` của part `part`. */
const divisionsAt = (part: Element | null, measure: Element): number => {
  let divisions = 1;
  if (!part) return divisions;
  for (const m of Array.from(part.children)) {
    if (m.tagName !== 'measure') continue;
    for (const attributes of Array.from(m.children).filter((c) => c.tagName === 'attributes')) {
      const value = numberOf(attributes, 'divisions');
      if (value !== null && value > 0) divisions = value;
    }
    if (m === measure) break;
  }
  return divisions;
};

/** Phần tử <note> đầu của nốt/hợp âm chứa nốt có `info`. */
const headOf = (doc: ScoreDocument, info: NoteInfo): NoteInfo =>
  doc.notes.find(
    (n) =>
      n.chordIndex === 0 &&
      n.partIndex === info.partIndex &&
      n.measureIndex === info.measureIndex &&
      n.staff === info.staff &&
      n.voice === info.voice &&
      n.entryIndex === info.entryIndex,
  ) ?? info;

/** Id của mọi nốt (kể cả nốt thêm trong hợp âm) thuộc cùng mục với thẻ `head` sau khi đã tính lại id. */
const idsOfEntry = (doc: ScoreDocument, head: Element): string[] => {
  const info = doc.notes.find((n) => n.element === head);
  if (!info) return [];
  return doc.notes
    .filter(
      (n) =>
        n.partIndex === info.partIndex &&
        n.measureIndex === info.measureIndex &&
        n.staff === info.staff &&
        n.voice === info.voice &&
        n.entryIndex === info.entryIndex,
    )
    .map((n) => n.id);
};

/** Khôi phục các ô nhịp về bản đã chụp trước khi sửa (dùng khi một bước giữa chừng thất bại). */
const rollback = (doc: ScoreDocument, snapshots: { partIndex: number; measureIndex: number; before: Element }[]) => {
  for (const s of snapshots)
    doc.replaceMeasure(s.partIndex, s.measureIndex, s.before.cloneNode(true) as Element, false);
  doc.reindex();
};

/** Cao độ mặc định cho nốt mới sinh từ dấu lặng: nốt có cao độ gần nhất phía trước cùng bè, không có thì theo khóa nhạc. */
const defaultPitchFor = (doc: ScoreDocument, info: NoteInfo): Pitch => {
  const fifths = doc.keyAt(info.measureIndex);
  const index = doc.notes.indexOf(info);
  for (let i = index - 1; i >= 0; i--) {
    const n = doc.notes[i];
    if (n.partIndex !== info.partIndex || n.staff !== info.staff || n.voice !== info.voice) continue;
    const p = n.isRest || n.isGrace ? null : readPitch(n.element);
    if (p) return { step: p.step, alter: keyAlter(fifths, p.step), octave: p.octave };
  }
  const ref = clefReference(doc, info);
  const base: { step: Step; octave: number } =
    ref === 50 ? { step: 'D', octave: 3 } : ref === 60 ? { step: 'C', octave: 4 } : { step: 'B', octave: 4 };
  return { ...base, alter: keyAlter(fifths, base.step) };
};

/** Biến một dấu lặng (đơn lẻ) thành nốt, giữ nguyên trường độ. */
const restToNote = (doc: ScoreDocument, info: NoteInfo): void => {
  const rest = childOf(info.element, 'rest');
  if (!rest) return;
  const pitch = defaultPitchFor(doc, info);
  rest.replaceWith(info.element.ownerDocument.createElement('pitch'));
  writePitch(info.element, pitch);
};

const DURATION_LABEL_PREFIX = 'Đổi trường độ';

/**
 * Đổi trường độ các nốt (hoặc dấu lặng) đã chọn. Có bước nào không làm được thì không đổi gì.
 * @param keepMeasure false (mặc định): đổi thẳng đúng trường độ đã chọn, độ dài ô nhịp thay đổi theo (ô sai phách được
 *   viền đỏ để sửa tiếp); true: giữ nguyên độ dài ô nhịp bằng cách lấp dấu lặng hoặc ghi đè nốt phía sau
 */
export function setDuration(
  doc: ScoreDocument,
  ids: readonly string[],
  choice: DurationChoice,
  keepMeasure = false,
): EditResult {
  const heads = new Map<string, NoteInfo>();
  for (const id of ids) {
    const info = doc.getInfo(id);
    if (info && !info.isGrace) heads.set(chordKey(info), headOf(doc, info));
  }
  if (heads.size === 0) return { ok: false, reason: 'empty' };

  // Làm từ nốt cuối về đầu để các nốt phía trước không bị lệch vị trí
  const ordered = [...heads.values()].sort(
    (a, b) =>
      b.partIndex - a.partIndex ||
      b.measureIndex - a.measureIndex ||
      b.staff - a.staff ||
      b.voice - a.voice ||
      b.entryIndex - a.entryIndex,
  );
  const touched: Touched = new Map();
  ordered.forEach((h) => touch(touched, h));

  let failure = null as EditFailure | null;
  let changedCount = 0;
  const label = `${DURATION_LABEL_PREFIX}: ${DURATION_LABELS[choice.type]}${choice.dotted ? ' chấm dôi' : ''}`;
  const command = commitEdit(doc, label, touched, [...ids], () => {
    for (const h of ordered) {
      const plan = planDuration(h.element, choice, keepMeasure);
      if ('error' in plan) {
        if (plan.error === 'unchanged') {
          // Dấu lặng đã đúng trường độ này: bấm lại nghĩa là muốn biến nó thành nốt
          if (hasChild(h.element, 'rest')) {
            restToNote(doc, h);
            changedCount += 1;
          }
          continue;
        }
        failure = plan.error;
        return;
      }
      plan.run();
      changedCount += 1;
    }
  });
  if (failure) {
    rollback(doc, command.snapshots);
    return { ok: false, reason: failure };
  }
  if (changedCount === 0) {
    rollback(doc, command.snapshots);
    return { ok: false, reason: 'unchanged' };
  }
  command.selectAfter = ordered.flatMap((h) => idsOfEntry(doc, h.element));
  return { ok: true, command };
}

const LETTER_STEP: Record<string, Step> = { a: 'A', b: 'B', c: 'C', d: 'D', e: 'E', f: 'F', g: 'G' };

/** Dấu khóa mặc định để chọn quãng tám khi chưa có nốt nào trước đó (G → B4, F → D3, C → C4). */
const clefReference = (doc: ScoreDocument, info: NoteInfo): number => {
  let sign = 'G';
  doc.getMeasures(info.partIndex).forEach((measure, measureIndex) => {
    if (measureIndex > info.measureIndex) return;
    for (const attributes of Array.from(measure.children).filter((c) => c.tagName === 'attributes')) {
      for (const clef of Array.from(attributes.children).filter((c) => c.tagName === 'clef')) {
        const number = Number(clef.getAttribute('number') ?? 1);
        if (number === info.staff) sign = childOf(clef, 'sign')?.textContent?.trim() ?? sign;
      }
    }
  });
  return sign === 'F' ? 50 : sign === 'C' ? 60 : 71;
};

/** Cao độ MIDI tham chiếu: nốt chính nó nếu đã có cao độ, rồi nốt có cao độ gần nhất phía trước cùng bè, rồi khóa nhạc. */
const referenceMidi = (doc: ScoreDocument, info: NoteInfo): number => {
  if (info.midi !== null) return info.midi;
  const index = doc.notes.indexOf(info);
  for (let i = index - 1; i >= 0; i--) {
    const n = doc.notes[i];
    if (n.partIndex === info.partIndex && n.staff === info.staff && n.voice === info.voice && n.midi !== null) {
      return n.midi;
    }
  }
  return clefReference(doc, info);
};

/**
 * Nhập nốt bằng phím A–G: dấu lặng (hoặc nốt đơn) tại `id` trở thành nốt có tên đó, chọn quãng tám gần nhất với nốt
 * trước, dấu hóa theo khóa nhạc. Nếu `choice` khác trường độ hiện tại thì đổi trường độ trong cùng một bước.
 * Sau khi nhập, vùng chọn nhảy sang mục kế tiếp trong bè để gõ tiếp.
 * @param letter chữ cái a–g (không phân biệt hoa thường)
 */
export function enterNote(doc: ScoreDocument, id: string, letter: string, choice: DurationChoice | null): EditResult {
  const step = LETTER_STEP[letter.toLowerCase()];
  const info = doc.getInfo(id);
  if (!step || !info || info.isGrace) return { ok: false, reason: 'empty' };
  const headInfo = headOf(doc, info);
  const head = headInfo.element;
  const measure = head.parentElement;
  if (!measure) return { ok: false, reason: 'unsupported' };
  const members = voiceEntries(measure, headInfo.staff, headInfo.voice)?.find((e) => e.members.includes(head));
  if (members && members.members.length > 1) return { ok: false, reason: 'unsupported' };

  const alter = keyAlter(doc.keyAt(info.measureIndex), step);
  const ref = referenceMidi(doc, headInfo);
  let best: Pitch | null = null;
  for (let octave = 0; octave <= 8; octave++) {
    const candidate: Pitch = { step, alter, octave };
    const midi = pitchToMidi(candidate);
    if (!inRange(midi)) continue;
    if (!best || Math.abs(midi - ref) < Math.abs(pitchToMidi(best) - ref)) best = candidate;
  }
  if (!best) return { ok: false, reason: 'range' };
  const pitch = best;

  let durationPlan: Plan | null = null;
  if (choice) {
    durationPlan = planDuration(head, choice);
    if ('error' in durationPlan) {
      if (durationPlan.error !== 'unchanged') return { ok: false, reason: durationPlan.error };
      durationPlan = null;
    }
  }

  const touched: Touched = new Map();
  touch(touched, headInfo);
  const label = `Nhập nốt ${step}`;
  const command = commitEdit(doc, label, touched, [headInfo.id], () => {
    if (durationPlan && 'run' in durationPlan) durationPlan.run();
    if (hasChild(head, 'rest')) {
      const rest = childOf(head, 'rest');
      const owner = head.ownerDocument;
      const pitchEl = owner.createElement('pitch');
      rest?.replaceWith(pitchEl);
      writePitch(head, pitch);
    } else if (readPitch(head)) {
      writePitch(head, pitch);
      Array.from(head.children)
        .filter((c) => c.tagName === 'accidental')
        .forEach((c) => c.remove());
    }
  });

  // Chuyển vùng chọn sang mục kế tiếp trong bè (nếu có) để gõ liền các nốt
  const entries = voiceEntries(measure, headInfo.staff, headInfo.voice) ?? [];
  const at = entries.findIndex((e) => e.members.includes(head));
  const nextHead = at >= 0 ? entries[at + 1]?.members[0] : undefined;
  command.selectAfter = idsOfEntry(doc, nextHead ?? head);
  command.changedIds = idsOfEntry(doc, head);
  return { ok: true, command };
}

/** Kiểm tra chuỗi là tên bậc A–G (dùng khi nhận phím). */
export const isLetterKey = (key: string): boolean =>
  key.length === 1 && key.toLowerCase() in LETTER_STEP && isStep(key.toUpperCase());

/** Dấu hóa người dùng chọn khi thêm nốt: tự động = theo dấu hóa cung nhạc. */
export type AccidentalChoice = 'auto' | 'sharp' | 'flat' | 'natural';

/** Vị trí thêm nốt: ô nhịp, khuông, bè, cao độ (chưa tính dấu hóa) và chỗ chèn trong bè. */
export interface InsertTarget {
  partIndex: number;
  measureIndex: number;
  /** Khuông bắt đầu từ 1. */
  staff: number;
  /** Bè bắt đầu từ 1. */
  voice: number;
  step: Step;
  octave: number;
  /** Chèn trước mục thứ này của bè (bằng số mục = chèn cuối ô). Bỏ qua khi `restEntry` có giá trị. */
  beforeEntry: number;
  /** Chỉ số mục là dấu lặng được thay bằng nốt mới; null = chèn thêm. */
  restEntry: number | null;
}

const ACCIDENTAL_ALTER: Record<Exclude<AccidentalChoice, 'auto'>, number> = { sharp: 1, flat: -1, natural: 0 };

/** Dựng thẻ <note> nốt thường (không phải dấu lặng) theo thứ tự phần tử của MusicXML. */
const makePitched = (
  owner: Document,
  pitch: Pitch,
  d: number,
  choice: DurationChoice,
  voice: number,
  staff: number | null,
): Element => {
  const note = owner.createElement('note');
  const add = (parent: Element, tag: string, text?: string) => {
    const el = owner.createElement(tag);
    if (text !== undefined) el.textContent = text;
    parent.appendChild(el);
    return el;
  };
  const p = add(note, 'pitch');
  add(p, 'step', pitch.step);
  if (pitch.alter !== 0) add(p, 'alter', String(pitch.alter));
  add(p, 'octave', String(pitch.octave));
  add(note, 'duration', String(d));
  add(note, 'voice', String(voice));
  add(note, 'type', choice.type);
  if (choice.dotted) add(note, 'dot');
  if (staff !== null) add(note, 'staff', String(staff));
  return note;
};

/**
 * Thêm một nốt vào bè tại `target` (người dùng bấm hoặc kéo-thả lên khuông).
 * - Bấm vào dấu lặng: dấu lặng trở thành nốt; nốt ngắn hơn thì phần dư thành dấu lặng, dài hơn thì đổi thẳng
 *   (hoặc ghi đè nốt sau nếu `keepMeasure`).
 * - Bấm vào chỗ trống: chèn nốt mới, các nốt sau lùi lại; ô nhịp thừa phách sẽ được viền đỏ. Với `keepMeasure`
 *   thì ghi đè các nốt/dấu lặng phía sau cho vừa chỗ, ô nhịp giữ nguyên độ dài.
 * Từ chối khi dính dấu nối, chùm ba hoặc bè có <forward>. Khi thất bại DOM không thay đổi.
 */
export function insertNote(
  doc: ScoreDocument,
  target: InsertTarget,
  choice: DurationChoice,
  accidental: AccidentalChoice = 'auto',
  keepMeasure = false,
): EditResult {
  const measure = doc.getMeasure(target.partIndex, target.measureIndex);
  if (!measure) return { ok: false, reason: 'empty' };
  const entries = voiceEntries(measure, target.staff, target.voice);
  if (!entries || entries.length === 0) return { ok: false, reason: 'unsupported' };
  const divisions = divisionsAt(measure.parentElement, measure);
  const length = DURATION_QUARTERS[choice.type] * (choice.dotted ? 1.5 : 1) * divisions;
  if (!Number.isInteger(length)) return { ok: false, reason: 'divisions' };

  const alter =
    accidental === 'auto' ? keyAlter(doc.keyAt(target.measureIndex), target.step) : ACCIDENTAL_ALTER[accidental];
  const pitch: Pitch = { step: target.step, alter, octave: target.octave };
  if (!inRange(pitchToMidi(pitch))) return { ok: false, reason: 'range' };

  const touched: Touched = new Map();
  touched.set(`${target.partIndex}|${target.measureIndex}`, {
    partIndex: target.partIndex,
    measureIndex: target.measureIndex,
  });
  const label = `Thêm nốt ${pitch.step}${alter > 0 ? '#' : alter < 0 ? 'b' : ''}${pitch.octave}`;

  // Thay dấu lặng bằng nốt
  if (target.restEntry !== null) {
    const entry = entries[target.restEntry];
    if (!entry || !entry.isRest || entry.members.length !== 1) return { ok: false, reason: 'unsupported' };
    const head = entry.members[0];
    const plan = planDuration(head, choice, keepMeasure || length < entry.duration);
    if ('error' in plan && plan.error !== 'unchanged') return { ok: false, reason: plan.error };
    const command = commitEdit(doc, label, touched, [], () => {
      if ('run' in plan) plan.run();
      const owner = head.ownerDocument;
      const pitchEl = owner.createElement('pitch');
      childOf(head, 'rest')?.replaceWith(pitchEl);
      writePitch(head, pitch);
    });
    command.selectAfter = idsOfEntry(doc, head);
    command.changedIds = command.selectAfter;
    return { ok: true, command };
  }

  // Chèn nốt mới
  const at = Math.max(0, Math.min(target.beforeEntry, entries.length));
  const prev = entries[at - 1];
  const next = entries[at];
  const tupleOf = (e?: Entry) => e?.members.some((m) => hasChild(m, 'time-modification')) ?? false;
  if (tupleOf(prev) && tupleOf(next)) return { ok: false, reason: 'tuplet' };
  if (prev?.members.some((m) => hasTie(m, 'start')) || next?.members.some((m) => hasTie(m, 'stop'))) {
    return { ok: false, reason: 'tie' };
  }

  // Giữ ô đủ phách: ghi đè các mục phía sau cho vừa chỗ nốt mới
  const consumed: Entry[] = [];
  let leftover = 0;
  if (keepMeasure) {
    let remaining = length;
    for (let j = at; j < entries.length && remaining > 0; j++) {
      const e = entries[j];
      if (tupleOf(e)) return { ok: false, reason: 'tuplet' };
      if (e.members.some((m) => hasTie(m, 'start') || hasTie(m, 'stop'))) return { ok: false, reason: 'tie' };
      consumed.push(e);
      if (e.duration <= remaining) remaining -= e.duration;
      else {
        leftover = e.duration - remaining;
        remaining = 0;
      }
    }
    if (remaining > 0) return { ok: false, reason: 'noSpace' };
  }
  const leftoverRests = leftover > 0 ? splitRests(leftover, divisions) : [];
  if (!leftoverRests) return { ok: false, reason: 'divisions' };

  const like = (prev ?? next).members[0];
  const staffTag = hasChild(like, 'staff') || target.staff > 1 ? target.staff : null;
  const created = makePitched(measure.ownerDocument, pitch, length, choice, target.voice, staffTag);
  const command = commitEdit(doc, label, touched, [], () => {
    stripBeams(entries);
    if (next) next.members[0].before(created);
    else prev.members[prev.members.length - 1].after(created);
    consumed.forEach((e) => e.members.forEach((m) => m.remove()));
    let anchor: Element = created;
    for (const r of leftoverRests) {
      const rest = makeRest(like, r.d, r.type, r.dotted);
      anchor.after(rest);
      anchor = rest;
    }
  });
  command.selectAfter = idsOfEntry(doc, created);
  command.changedIds = command.selectAfter;
  return { ok: true, command };
}
