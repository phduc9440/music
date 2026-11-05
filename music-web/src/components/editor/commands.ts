/**
 * Các lệnh sửa MusicXML của trình chỉnh sửa. Mỗi lệnh sửa DOM trong {@link ScoreDocument} và trả về bản sao ô nhịp
 * trước/sau để {@link History} hoàn tác, làm lại. Không phụ thuộc React hay OSMD.
 */
import type { NoteInfo, ScoreDocument } from './ScoreDocument';
import { AccidentalState, accidentalName, inRange, isStep, movePitch, pitchToMidi } from './pitch';
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
  /** Vùng chọn nên đặt sau lệnh (khi id đổi, ví dụ sau khi chèn dấu lặng); không có thì giữ vùng chọn cũ. */
  selectAfter?: string[];
  /** Phần đầu file (tiêu đề, tác giả...) trước và sau khi sửa; chỉ có ở lệnh sửa các chữ đầu bản nhạc. */
  head?: { before: Element[]; after: Element[] };
  /** Toàn bộ các part trước và sau khi sửa; chỉ có ở lệnh làm đổi số ô nhịp (thêm/xóa ô). */
  parts?: { before: Element[]; after: Element[] };
}

/** Lý do một thao tác không thực hiện được. */
export type EditFailure =
  | 'range'
  | 'rest'
  | 'duplicate'
  | 'unchanged'
  | 'empty'
  | 'tuplet'
  | 'tupletFit'
  | 'tupletType'
  | 'noTuplet'
  | 'tie'
  | 'noSpace'
  | 'divisions'
  | 'unsupported'
  | 'tieTarget'
  | 'slurTarget'
  | 'lyricTarget'
  | 'badValue'
  | 'badChord'
  | 'hairpinTarget'
  | 'spanTarget'
  | 'arpeggioTarget'
  | 'noMeasure'
  | 'lastMeasure'
  | 'voiceMain'
  | 'voiceNone'
  | 'hasBass'
  | 'lastStaff'
  | 'noStaff';

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
  unchanged: 'Nốt đã ở đúng trạng thái này rồi',
  empty: 'Hãy chọn ít nhất một nốt (không phải dấu lặng)',
  tuplet: 'Nốt này đã nằm trong chùm, hoặc vị trí chèn nằm giữa một chùm (chưa hỗ trợ chùm lồng nhau)',
  tupletFit: 'Trường độ mới không vừa chùm; hãy bỏ chùm trước',
  tupletType: 'Không viết được chùm này bằng các hình nốt hiện có (thử chùm khác hoặc trường độ khác)',
  noTuplet: 'Nốt đang chọn không nằm trong chùm nào',
  tie: 'Chưa hỗ trợ đổi trường độ khi có nốt dính dấu nối (nốt đang sửa hoặc nốt bị đè)',
  noSpace: 'Không kéo dài được: nốt sẽ vượt quá cuối ô nhịp',
  divisions: 'Bản nhạc chia nhịp quá thô nên không đổi sang trường độ này được',
  unsupported: 'Cấu trúc ô nhịp này chưa hỗ trợ đổi trường độ',
  tieTarget: 'Dấu nối cần hai nốt liền nhau cùng cao độ trong cùng bè: hãy chọn nốt trước (hoặc cả hai nốt)',
  slurTarget: 'Dấu luyến cần chọn từ hai nốt trở lên trong cùng một khuông',
  lyricTarget: 'Hãy chọn một nốt (không phải dấu lặng hay nốt nối tiếp) để nhập lời',
  badValue: 'Giá trị không hợp lệ',
  badChord: 'Không hiểu hợp âm này. Ví dụ: C, Am7, G/B, F#m, Bbmaj7, Dsus4, C6/9, N.C.',
  hairpinTarget: 'Cresc./dim. cần chọn từ hai nốt trở lên (từ nốt bắt đầu đến nốt kết thúc)',
  spanTarget: 'Vùng chọn phải nằm trong cùng một khuông của cùng một phần nhạc',
  arpeggioTarget: 'Dấu rải cần một hợp âm có từ hai nốt trở lên: hãy chọn hợp âm',
  noMeasure: 'Hãy chọn một nốt để biết thao tác này áp dụng cho ô nhịp nào',
  lastMeasure: 'Bản nhạc phải còn ít nhất một ô nhịp',
  voiceMain: 'Đây là bè chính của khuông nên không xóa theo cách này (hãy dùng nút Xóa nốt / Dấu lặng)',
  hasBass: 'Phần nhạc này đã có hai khuông rồi (dùng "Thêm khuông Sol/Fa" để thêm khuông riêng)',
  lastStaff: 'Bản nhạc phải còn ít nhất một khuông (khuông 1 của đàn chỉ xóa được khi còn phần nhạc khác)',
  noStaff: 'Hãy chọn một nốt hoặc dấu lặng để biết thao tác này áp dụng cho khuông nào',
  voiceNone: 'Hãy chọn các nốt (không phải dấu lặng hay nốt trang trí) để viết bè',
};

export const childOf = (parent: Element, tag: string): Element | undefined =>
  Array.from(parent.children).find((c) => c.tagName === tag);

/** Đọc cao độ của thẻ <note>; null nếu là dấu lặng hoặc dữ liệu thiếu. */
export const readPitch = (note: Element): Pitch | null => {
  const pitch = childOf(note, 'pitch');
  if (!pitch) return null;
  const step = childOf(pitch, 'step')?.textContent?.trim() ?? '';
  const octave = Number(childOf(pitch, 'octave')?.textContent);
  // Giữ vi cung: làm tròn tới bội của 0,5 chứ không tới số nguyên
  const alter = Math.round((Number(childOf(pitch, 'alter')?.textContent ?? 0) || 0) * 2) / 2;
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

export const hasTie = (note: Element, type: 'start' | 'stop'): boolean =>
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
  const fifths = doc.keyAtPart(partIndex, measureIndex);
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
      // Nốt nối (stop) không vẽ lại dấu hóa và cũng không làm đổi trạng thái dấu hóa của ô: nốt cùng cao độ đứng sau
      // (không nối) vẫn phải ghi lại dấu hóa, nếu không sẽ bị đọc thành nốt tự nhiên.
      if (hasTie(info.element, 'stop')) continue;
      setAccidental(info.element, state.visit(pitch));
    }
  }
};

export const chordKey = (n: NoteInfo): string =>
  `${n.partIndex}|${n.measureIndex}|${n.staff}|${n.voice}|${n.entryIndex}`;

/** Ký hiệu áp lên nốt đang chọn. */
export type SymbolOp = 'sharp' | 'flat' | 'natural' | 'rest' | 'delete' | 'tie' | 'slur';

/** Nhãn hiển thị của từng ký hiệu (dùng cho thông báo hoàn tác / làm lại). */
export const SYMBOL_OP_LABELS: Record<SymbolOp, string> = {
  sharp: 'Thêm dấu thăng',
  flat: 'Thêm dấu giáng',
  natural: 'Thêm dấu bình',
  rest: 'Đổi thành dấu lặng',
  delete: 'Xóa nốt',
  tie: 'Dấu nối',
  slur: 'Dấu luyến',
};

export type Touched = Map<string, { partIndex: number; measureIndex: number }>;

export const touch = (touched: Touched, info: NoteInfo): void => {
  touched.set(`${info.partIndex}|${info.measureIndex}`, { partIndex: info.partIndex, measureIndex: info.measureIndex });
};

/**
 * Chụp các ô nhịp bị ảnh hưởng, chạy `apply` để sửa DOM, tính lại id và dấu hóa hiển thị, rồi chụp lại để dựng lệnh.
 */
export function commitEdit(
  doc: ScoreDocument,
  label: string,
  touched: Touched,
  changedIds: string[],
  apply: () => void,
): EditCommand {
  const snapshots: MeasureSnapshot[] = [...touched.values()].map((t) => ({
    ...t,
    before: doc.getMeasure(t.partIndex, t.measureIndex)?.cloneNode(true) as Element,
    after: null as unknown as Element,
  }));
  apply();
  doc.reindex();
  for (const t of touched.values()) refreshAccidentals(doc, t.partIndex, t.measureIndex);
  for (const s of snapshots) s.after = doc.getMeasure(s.partIndex, s.measureIndex)?.cloneNode(true) as Element;
  return { label, snapshots, changedIds };
}

type Mover = (old: Pitch, info: NoteInfo) => Pitch | 'range';

/**
 * Đổi cao độ từng nốt đã chọn theo `mover`. Dấu lặng bị bỏ qua; nốt có dấu nối kéo theo cả chuỗi nốt nối (nhận cùng
 * cao độ mới). Nếu có nốt vượt A0–C8, làm trùng cao độ trong hợp âm, hoặc không có gì thay đổi thì không sửa gì.
 */
function transformPitches(doc: ScoreDocument, ids: readonly string[], label: string, mover: Mover): EditResult {
  const selected = ids.map((id) => doc.getInfo(id)).filter((n): n is NoteInfo => n !== undefined);
  const pitched = selected.filter((n) => !n.isRest && readPitch(n.element));
  if (pitched.length === 0) return { ok: false, reason: 'rest' };

  const indexOf = new Map<string, number>();
  doc.notes.forEach((n, i) => indexOf.set(n.id, i));

  // Cao độ mới của từng nốt (nốt chọn trước, rồi nốt nối nhận cùng cao độ với nốt gốc)
  const next = new Map<string, Pitch>();
  for (const info of pitched) {
    const moved = mover(readPitch(info.element) as Pitch, info);
    if (moved === 'range') return { ok: false, reason: 'range' };
    next.set(info.id, moved);
  }
  for (const info of pitched) {
    const moved = next.get(info.id) as Pitch;
    for (const tied of tieChain(doc, info, indexOf)) {
      if (!next.has(tied.id)) next.set(tied.id, moved);
    }
  }

  const unchanged = [...next].every(([id, pitch]) => {
    const old = readPitch((doc.getInfo(id) as NoteInfo).element);
    return old && old.step === pitch.step && old.alter === pitch.alter && old.octave === pitch.octave;
  });
  if (unchanged) return { ok: false, reason: 'unchanged' };

  // Không để hai nốt trong cùng hợp âm trùng cao độ
  const touchedChords = new Set<string>();
  for (const id of next.keys()) touchedChords.add(chordKey(doc.getInfo(id) as NoteInfo));
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

  const touched: Touched = new Map();
  for (const id of next.keys()) touch(touched, doc.getInfo(id) as NoteInfo);
  const command = commitEdit(doc, label, touched, [...next.keys()], () => {
    for (const [id, pitch] of next) writePitch((doc.getInfo(id) as NoteInfo).element, pitch);
  });
  return { ok: true, command };
}

/**
 * Đổi cao độ cho các nốt đã chọn.
 * @param doc tài liệu đang sửa
 * @param ids id các nốt đang chọn
 * @param op thao tác
 * @param count số lần lặp thao tác (kéo nốt nhiều bậc vẫn là một lệnh)
 * @returns lệnh đã áp dụng (để đưa vào lịch sử) hoặc lý do thất bại; khi thất bại DOM không thay đổi
 */
export function changePitch(doc: ScoreDocument, ids: readonly string[], op: PitchOp, count = 1): EditResult {
  const label = count > 1 ? `${PITCH_OP_LABELS[op]} (${count} lần)` : PITCH_OP_LABELS[op];
  return transformPitches(doc, ids, label, (old, info) => {
    let moved: Pitch = old;
    for (let i = 0; i < count; i++) {
      const step = movePitch(moved, op, doc.keyAtPart(info.partIndex, info.measureIndex));
      if (step === 'range') return 'range';
      moved = step;
    }
    return moved;
  });
}

/**
 * Đặt dấu thăng / giáng / bình cho nốt đã chọn (giữ nguyên bậc và quãng tám). Bấm lại dấu đang có thì trở về
 * nốt tự nhiên (alter 0).
 */
export function setAlteration(
  doc: ScoreDocument,
  ids: readonly string[],
  kind: 'sharp' | 'flat' | 'natural',
): EditResult {
  const target = kind === 'sharp' ? 1 : kind === 'flat' ? -1 : 0;
  return transformPitches(doc, ids, SYMBOL_OP_LABELS[kind], (old) => {
    const moved = { ...old, alter: old.alter === target ? 0 : target };
    return inRange(pitchToMidi(moved)) ? moved : 'range';
  });
}

/** Biến thẻ <note> thành dấu lặng cùng trường độ: thay <pitch> bằng <rest/>, bỏ dấu hóa, dấu nối, cán và nét nối. */
const convertToRest = (note: Element): void => {
  const owner = note.ownerDocument;
  Array.from(note.children).forEach((c) => {
    if (c.tagName === 'pitch') c.replaceWith(owner.createElement('rest'));
    else if (['accidental', 'tie', 'stem', 'notehead', 'beam', 'chord'].includes(c.tagName)) c.remove();
    else if (c.tagName === 'notations') {
      Array.from(c.children)
        .filter((n) => n.tagName === 'tied' || n.tagName === 'slur')
        .forEach((n) => n.remove());
      if (c.children.length === 0) c.remove();
    }
  });
};

/** Các thẻ <slur> nằm trong <notations> của một nốt. */
export const slursOf = (note: Element): Element[] =>
  Array.from(note.children)
    .filter((c) => c.tagName === 'notations')
    .flatMap((n) => Array.from(n.children))
    .filter((c) => c.tagName === 'slur');

/**
 * Với các nốt sắp bị xóa/đổi thành dấu lặng, tìm đầu kia của dấu luyến dính vào chúng (nằm ở nốt khác) để gỡ nốt,
 * tránh để lại dấu luyến mồ côi.
 */
const slurPartners = (doc: ScoreDocument, removed: ReadonlySet<NoteInfo>) => {
  const out: { info: NoteInfo; type: string; number: string }[] = [];
  doc.notes.forEach((n, index) => {
    if (!removed.has(n)) return;
    for (const slur of slursOf(n.element)) {
      const type = slur.getAttribute('type');
      const number = slur.getAttribute('number') ?? '1';
      const wanted = type === 'start' ? 'stop' : 'start';
      if (type !== 'start' && type !== 'stop') continue;
      const range = type === 'start' ? doc.notes.slice(index + 1) : doc.notes.slice(0, index).reverse();
      const partner = range.find(
        (m) =>
          m.partIndex === n.partIndex &&
          slursOf(m.element).some(
            (x) => x.getAttribute('type') === wanted && (x.getAttribute('number') ?? '1') === number,
          ),
      );
      if (partner && !removed.has(partner)) out.push({ info: partner, type: wanted, number });
    }
  });
  return out;
};

/**
 * Đổi nốt đã chọn thành dấu lặng ('rest', cả hợp âm) hoặc xóa nốt ('delete', chỉ các nốt chọn; hợp âm còn nốt khác thì
 * giữ lại, xóa hết thì thành dấu lặng). Trường độ không đổi nên ô nhịp vẫn đủ phách. Nốt nối kéo theo cả chuỗi.
 */
export function removeNotes(doc: ScoreDocument, ids: readonly string[], mode: 'rest' | 'delete'): EditResult {
  const selected = ids.map((id) => doc.getInfo(id)).filter((n): n is NoteInfo => n !== undefined && !n.isRest);
  if (selected.length === 0) return { ok: false, reason: 'empty' };

  const indexOf = new Map<string, number>();
  doc.notes.forEach((n, i) => indexOf.set(n.id, i));
  const chosen = new Map<string, NoteInfo>();
  for (const info of selected) {
    chosen.set(info.id, info);
    for (const tied of tieChain(doc, info, indexOf)) chosen.set(tied.id, tied);
  }

  // Gom theo hợp âm (cùng thời điểm, bè, khuông)
  const groups = new Map<string, NoteInfo[]>();
  for (const info of doc.notes) {
    if (info.isRest) continue;
    const key = chordKey(info);
    const list = groups.get(key) ?? [];
    list.push(info);
    groups.set(key, list);
  }

  const touched: Touched = new Map();
  const plan: { members: NoteInfo[]; remove: NoteInfo[] }[] = [];
  for (const members of groups.values()) {
    const picked = members.filter((m) => chosen.has(m.id));
    if (picked.length === 0) continue;
    plan.push({ members, remove: mode === 'rest' ? members : picked });
    touch(touched, members[0]);
  }

  const removedSet = new Set(plan.flatMap((p) => p.remove));
  const partners = slurPartners(doc, removedSet);
  partners.forEach((p) => touch(touched, p.info));
  const command = commitEdit(doc, SYMBOL_OP_LABELS[mode], touched, [...chosen.keys()], () => {
    for (const p of partners) {
      slursOf(p.info.element)
        .filter((x) => x.getAttribute('type') === p.type && (x.getAttribute('number') ?? '1') === p.number)
        .forEach((x) => {
          const parent = x.parentElement;
          x.remove();
          if (parent && parent.children.length === 0) parent.remove();
        });
    }
    for (const { members, remove } of plan) {
      const removeSet = new Set(remove);
      const keepers = members.filter((m) => !removeSet.has(m));
      const head = members[0];
      if (keepers.length === 0) {
        if (head.isGrace) members.forEach((m) => m.element.remove());
        else {
          convertToRest(head.element);
          members.slice(1).forEach((m) => m.element.remove());
        }
        continue;
      }
      remove.forEach((m) => m.element.remove());
      // Nếu nốt đầu hợp âm bị xóa thì nốt còn lại đầu tiên trở thành nốt đầu (bỏ <chord/>)
      if (removeSet.has(head)) {
        Array.from(keepers[0].element.children)
          .filter((c) => c.tagName === 'chord')
          .forEach((c) => c.remove());
      }
    }
  });
  return { ok: true, command };
}
