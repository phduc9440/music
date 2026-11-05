/**
 * Đổi trường độ và nhập nốt bằng bàn phím. Độ dài mỗi ô nhịp luôn được giữ nguyên:
 * - nốt ngắn đi thì phần trống phía sau được lấp bằng dấu lặng;
 * - nốt dài ra thì ghi đè các nốt/dấu lặng liền sau nó trong cùng bè (phần dư của mục bị cắt dở thành dấu lặng);
 *   kéo quá cuối ô nhịp thì từ chối.
 * Nốt trong chùm (chùm ba...) đổi trường độ trong phạm vi chùm, xem `tuplets.ts`. Chưa hỗ trợ đổi trường độ nốt có
 * dấu nối.
 */
import { chordKey, childOf, commitEdit, hasTie, readPitch, touch, writePitch } from './commands';
import type { EditFailure, EditResult, Touched } from './commands';
import {
  DURATION_LABELS,
  DURATION_QUARTERS,
  divisionsAt,
  hasChild,
  headOf,
  idsOfEntry,
  makeRest,
  numberOf,
  splitRests,
  stripBeams,
  voiceEntries,
  writeDuration,
} from './durationCore';
import type { DurationChoice, DurationType, Entry, Plan } from './durationCore';
import { scaleDivisions } from './divisions';
import { inRange, keyAlter, pitchToMidi, isStep } from './pitch';
import type { Pitch, Step } from './pitch';
import type { NoteInfo, ScoreDocument } from './ScoreDocument';
import { groupRange, planTupletDuration, ratioOf } from './tuplets';

export { DURATION_LABELS, DURATION_QUARTERS };
export type { DurationChoice, DurationType };

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
  const part = measure.parentElement;
  const divisions = divisionsAt(part, measure);
  // Nốt trong chùm: đổi trong phạm vi chùm, tổng độ dài chùm không đổi
  if (ratioOf(entry.members[0])) return planTupletDuration(entries, index, choice, divisions);
  if (keep && entry.members.some((m) => hasTie(m, 'start') || hasTie(m, 'stop'))) return { error: 'tie' };

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

/** Các hệ số thử nhân divisions khi một trường độ không chia hết (ví dụ nốt móc đơn khi divisions = 3). */
const RESCALE_FACTORS = [2, 4, 8, 16];

/**
 * Chạy `run`; nếu thất bại vì divisions quá thô thì nhân divisions của part lên (2, 4, 8, 16 lần) rồi thử lại. Lần
 * thử thành công thành một lệnh cấu trúc (bản chụp cả bài) để hoàn tác khôi phục luôn divisions cũ; thất bại thì
 * bản nhạc nguyên như cũ.
 */
function withRescale(doc: ScoreDocument, partIndex: number, run: () => EditResult): EditResult {
  const first = run();
  if (first.ok || first.reason !== 'divisions') return first;
  const before = doc.partsSnapshot();
  for (const factor of RESCALE_FACTORS) {
    scaleDivisions(doc, partIndex, factor);
    doc.reindex();
    const result = run();
    if (result.ok) {
      const { command } = result;
      return {
        ok: true,
        command: {
          label: command.label,
          snapshots: [],
          changedIds: command.changedIds,
          selectAfter: command.selectAfter,
          parts: { before, after: doc.partsSnapshot() },
        },
      };
    }
    doc.restoreParts(before);
    if (result.reason !== 'divisions') return result;
  }
  return first;
}

const DURATION_LABEL_PREFIX = 'Đổi trường độ';

/**
 * Đổi trường độ các nốt (hoặc dấu lặng) đã chọn. Có bước nào không làm được thì không đổi gì.
 * Đổi thẳng đúng trường độ đã chọn: độ dài ô nhịp thay đổi theo (ô sai phách được viền đỏ để sửa tiếp).
 */
function setDurationOnce(doc: ScoreDocument, ids: readonly string[], choice: DurationChoice): EditResult {
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
      const plan = planDuration(h.element, choice, false);
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
function enterNoteOnce(doc: ScoreDocument, id: string, letter: string, choice: DurationChoice | null): EditResult {
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
 * - Bấm vào dấu lặng: dấu lặng trở thành nốt; nốt ngắn hơn thì phần dư thành dấu lặng, dài hơn thì đổi thẳng.
 * - Bấm vào chỗ trống: chèn nốt mới, các nốt sau lùi lại; ô nhịp thừa phách sẽ được viền đỏ.
 * Từ chối khi dính dấu nối, chùm ba hoặc bè có <forward>. Khi thất bại DOM không thay đổi.
 */
function insertNoteOnce(
  doc: ScoreDocument,
  target: InsertTarget,
  choice: DurationChoice,
  accidental: AccidentalChoice,
): EditResult {
  const measure = doc.getMeasure(target.partIndex, target.measureIndex);
  if (!measure) return { ok: false, reason: 'empty' };
  const entries = voiceEntries(measure, target.staff, target.voice);
  if (!entries || entries.length === 0) return { ok: false, reason: 'unsupported' };
  const divisions = divisionsAt(measure.parentElement, measure);
  // Bấm vào dấu lặng trong chùm: nốt mới nằm trong chùm nên độ dài thật = hình nốt × normal / actual
  const restEntry = target.restEntry !== null ? entries[target.restEntry] : undefined;
  const ratio = restEntry ? ratioOf(restEntry.members[0]) : null;
  const lengthNumerator =
    DURATION_QUARTERS[choice.type] * (choice.dotted ? 1.5 : 1) * 4 * divisions * (ratio?.normal ?? 1);
  const lengthDenominator = 4 * (ratio?.actual ?? 1);
  if (lengthNumerator % lengthDenominator !== 0) return { ok: false, reason: 'divisions' };
  const length = lengthNumerator / lengthDenominator;

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
    const plan = planDuration(head, choice, length < entry.duration);
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
  // Không chèn vào giữa một chùm (chèn sau mục cuối của chùm, hoặc giữa hai chùm liền nhau thì được)
  const prevGroup = prev && next && ratioOf(prev.members[0]) ? groupRange(entries, at - 1, divisions) : null;
  if (prevGroup && prevGroup.to >= at) return { ok: false, reason: 'tuplet' };
  if (prev?.members.some((m) => hasTie(m, 'start')) || next?.members.some((m) => hasTie(m, 'stop'))) {
    return { ok: false, reason: 'tie' };
  }

  const like = (prev ?? next).members[0];
  const staffTag = hasChild(like, 'staff') || target.staff > 1 ? target.staff : null;
  const created = makePitched(measure.ownerDocument, pitch, length, choice, target.voice, staffTag);
  const command = commitEdit(doc, label, touched, [], () => {
    stripBeams(entries);
    if (next) next.members[0].before(created);
    else prev.members[prev.members.length - 1].after(created);
  });
  command.selectAfter = idsOfEntry(doc, created);
  command.changedIds = command.selectAfter;
  return { ok: true, command };
}

/** Đổi trường độ các nốt đã chọn; tự chia nhỏ divisions của part khi cần (xem {@link withRescale}). */
export function setDuration(doc: ScoreDocument, ids: readonly string[], choice: DurationChoice): EditResult {
  const first = ids.map((id) => doc.getInfo(id)).find((n) => n !== undefined);
  return withRescale(doc, first?.partIndex ?? 0, () => setDurationOnce(doc, ids, choice));
}

/** Nhập nốt bằng phím A–G; tự chia nhỏ divisions của part khi cần. */
export function enterNote(doc: ScoreDocument, id: string, letter: string, choice: DurationChoice | null): EditResult {
  return withRescale(doc, doc.getInfo(id)?.partIndex ?? 0, () => enterNoteOnce(doc, id, letter, choice));
}

/** Thêm một nốt vào bè tại `target`; tự chia nhỏ divisions của part khi cần. */
export function insertNote(
  doc: ScoreDocument,
  target: InsertTarget,
  choice: DurationChoice,
  accidental: AccidentalChoice = 'auto',
): EditResult {
  return withRescale(doc, target.partIndex, () => insertNoteOnce(doc, target, choice, accidental));
}
