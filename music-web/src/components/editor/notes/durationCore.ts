/**
 * Bảng trường độ và các hàm đọc/ghi "mục" nốt (nốt, hợp âm hoặc dấu lặng trong một bè) dùng chung cho
 * `durations.ts` và `tuplets.ts`. Tách riêng để hai file không import vòng tròn nhau.
 */
import { childOf } from '../core/commands';
import type { EditFailure } from '../core/commands';
import type { NoteInfo, ScoreDocument } from '../core/ScoreDocument';
import { t } from '../../../i18n/core';

/** Các trường độ cơ bản của bảng công cụ (từ tròn đôi đến móc tứ). */
export type DurationType = 'breve' | 'whole' | 'half' | 'quarter' | 'eighth' | '16th' | '32nd' | '64th';

/** Số chấm dôi: 0 = không, 1 = chấm dôi, 2 = chấm dôi kép. */
export type Dots = 0 | 1 | 2;

export interface DurationChoice {
  type: DurationType;
  dots: Dots;
}

/** Độ dài tính bằng số nốt đen. */
export const DURATION_QUARTERS: Record<DurationType, number> = {
  breve: 8,
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
  '16th': 0.25,
  '32nd': 0.125,
  '64th': 0.0625,
};

/** Tên trường độ theo ngôn ngữ hiện tại. */
export const durationLabel = (type: DurationType): string => t(`editor.duration.${type}`);

/** Hệ số độ dài do chấm dôi: 1, 1,5 hoặc 1,75. */
export const dotFactor = (dots: Dots): number => 2 - 1 / 2 ** dots;

/** Hậu tố tên của chấm dôi (rỗng nếu không có chấm). */
export const dotsLabel = (dots: Dots): string =>
  dots === 0 ? '' : t(dots === 1 ? 'editor.dots.one' : 'editor.dots.two');

/** Số chấm dôi (<dot/>) của một thẻ <note>, tối đa 2. */
export const dotCount = (note: Element): Dots => {
  const n = Array.from(note.children).filter((c) => c.tagName === 'dot').length;
  return n >= 2 ? 2 : n === 1 ? 1 : 0;
};

/** Chấm dôi kế tiếp khi bấm phím "." : 0 → 1 → 2 → 0. */
export const nextDots = (dots: Dots): Dots => (dots === 0 ? 1 : dots === 1 ? 2 : 0);

/** Độ dài (số nốt đen) của một lựa chọn trường độ. */
export const choiceQuarters = (choice: DurationChoice): number =>
  DURATION_QUARTERS[choice.type] * dotFactor(choice.dots);

/**
 * Độ dài `quarters` nốt đen đổi sang đơn vị divisions (nếu có `ratio` thì là độ dài thật của nốt viết ra trong chùm);
 * null nếu không ra số nguyên (divisions quá thô). Tính bằng số nguyên (bội của 1/64 nốt đen) nên không sai số.
 */
export const scaledLength = (quarters: number, divisions: number, ratio?: Ratio): number | null => {
  const numerator = Math.round(quarters * 64) * divisions * (ratio?.normal ?? 1);
  const denominator = 64 * (ratio?.actual ?? 1);
  return numerator % denominator === 0 ? numerator / denominator : null;
};

/** Hình nốt (loại nốt + chấm dôi) có độ dài `quarters` nốt đen; null nếu không có hình nốt nào đúng độ dài đó. */
export const writtenChoice = (quarters: number): DurationChoice | null => {
  for (const dots of [0, 1, 2] as const) {
    for (const type of Object.keys(DURATION_QUARTERS) as DurationType[]) {
      if (Math.abs(choiceQuarters({ type, dots }) - quarters) < 1e-9) return { type, dots };
    }
  }
  return null;
};

/** Các giá trị dùng để chia phần trống thành dấu lặng, từ lớn đến nhỏ. */
const REST_VALUES: { quarters: number; type: DurationType; dots: Dots }[] = [
  { quarters: 8, type: 'breve', dots: 0 },
  { quarters: 4, type: 'whole', dots: 0 },
  { quarters: 3.5, type: 'half', dots: 2 },
  { quarters: 3, type: 'half', dots: 1 },
  { quarters: 2, type: 'half', dots: 0 },
  { quarters: 1.75, type: 'quarter', dots: 2 },
  { quarters: 1.5, type: 'quarter', dots: 1 },
  { quarters: 1, type: 'quarter', dots: 0 },
  { quarters: 0.875, type: 'eighth', dots: 2 },
  { quarters: 0.75, type: 'eighth', dots: 1 },
  { quarters: 0.5, type: 'eighth', dots: 0 },
  { quarters: 0.375, type: '16th', dots: 1 },
  { quarters: 0.25, type: '16th', dots: 0 },
  { quarters: 0.125, type: '32nd', dots: 0 },
  { quarters: 0.0625, type: '64th', dots: 0 },
];

/** Tỉ lệ của nhóm nốt đặc biệt: `actual` nốt chiếm chỗ của `normal` nốt (3:2 = chùm ba). */
export interface Ratio {
  actual: number;
  normal: number;
}

/**
 * Chia `total` (đơn vị divisions) thành các dấu lặng hợp lệ; null nếu không chia vừa (divisions quá thô).
 * Với `ratio` (dấu lặng nằm trong chùm) thì `total` là độ dài thật còn hình dấu lặng là độ dài viết ra.
 */
export const splitRests = (
  total: number,
  divisions: number,
  ratio?: Ratio,
): { d: number; type: DurationType; dots: Dots }[] | null => {
  const out: { d: number; type: DurationType; dots: Dots }[] = [];
  let left = total;
  while (left > 0) {
    let fit: { d: number; type: DurationType; dots: Dots } | null = null;
    for (const v of REST_VALUES) {
      const d = scaledLength(v.quarters, divisions, ratio);
      if (d !== null && d <= left) {
        fit = { d, type: v.type, dots: v.dots };
        break;
      }
    }
    if (!fit) return null;
    out.push(fit);
    left -= fit.d;
  }
  return out;
};

export interface Entry {
  /** Các thẻ <note> của một nốt hoặc hợp âm; phần tử đầu là nốt đầu. */
  members: Element[];
  duration: number;
  isRest: boolean;
}

export const numberOf = (parent: Element, tag: string): number | null => {
  const text = childOf(parent, tag)?.textContent?.trim();
  const value = Number(text);
  return text && Number.isFinite(value) ? value : null;
};

export const hasChild = (el: Element, tag: string): boolean => childOf(el, tag) !== undefined;

/** Các nốt/hợp âm/dấu lặng của một bè trong ô nhịp, theo thứ tự; null nếu bè có <forward> (chưa hỗ trợ). */
export const voiceEntries = (measure: Element, staff: number, voice: number): Entry[] | null => {
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

/** Đặt thẻ `el` sau thẻ đầu tiên tìm thấy trong `after` (theo thứ tự ưu tiên); không có thì thêm vào cuối. */
export const placeAfter = (note: Element, el: Element, after: string[]): void => {
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
export const writeDuration = (note: Element, d: number, type: DurationType, dots: Dots): void => {
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
  let anchor: Element = typeEl;
  for (let i = 0; i < dots; i++) {
    const dot = owner.createElement('dot');
    anchor.after(dot);
    anchor = dot;
  }
};

/** Bỏ thông tin nối nét (<beam>) của cả bè trong ô để OSMD không gặp nét nối đứt đoạn sau khi trường độ đổi. */
export const stripBeams = (entries: Entry[]): void => {
  for (const entry of entries) {
    for (const note of entry.members) {
      Array.from(note.children)
        .filter((c) => c.tagName === 'beam')
        .forEach((c) => c.remove());
    }
  }
};

/** Dựng thẻ <note> dấu lặng có cùng khuông và bè với `like`. */
export const makeRest = (like: Element, d: number, type: DurationType, dots: Dots): Element => {
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
  for (let i = 0; i < dots; i++) add('dot');
  if (hasChild(like, 'staff')) add('staff', String(numberOf(like, 'staff') ?? 1));
  return note;
};

export type Plan = { error: EditFailure } | { run: () => void };

/** Divisions có hiệu lực tại ô nhịp `measure` của part `part`. */
export const divisionsAt = (part: Element | null, measure: Element): number => {
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
export const headOf = (doc: ScoreDocument, info: NoteInfo): NoteInfo =>
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
export const idsOfEntry = (doc: ScoreDocument, head: Element): string[] => {
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
