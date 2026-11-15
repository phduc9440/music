/**
 * Đổi ký hiệu hợp âm MusicXML (<harmony>) thành các nốt MIDI để đệm khi phát. Chỉ chứa hàm thuần.
 *
 * Cách đánh: một nốt bass ở quãng thấp (gốc, hoặc nốt sau dấu "/") và các nốt của hợp âm xếp sát nhau ở quãng giữa đàn
 * ở thế gốc. Hợp âm "không có hợp âm" (N.C.) trả về null: đệm im.
 */

/** Cách các nốt của một hợp âm cách gốc (nửa cung). */
const KIND_INTERVALS: Record<string, readonly number[]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  augmented: [0, 4, 8],
  diminished: [0, 3, 6],
  dominant: [0, 4, 7, 10],
  'major-seventh': [0, 4, 7, 11],
  'minor-seventh': [0, 3, 7, 10],
  'diminished-seventh': [0, 3, 6, 9],
  'augmented-seventh': [0, 4, 8, 10],
  'half-diminished': [0, 3, 6, 10],
  'major-minor': [0, 3, 7, 11],
  'major-sixth': [0, 4, 7, 9],
  'minor-sixth': [0, 3, 7, 9],
  'dominant-ninth': [0, 4, 7, 10, 14],
  'major-ninth': [0, 4, 7, 11, 14],
  'minor-ninth': [0, 3, 7, 10, 14],
  'dominant-11th': [0, 4, 7, 10, 14, 17],
  'major-11th': [0, 4, 7, 11, 14, 17],
  'minor-11th': [0, 3, 7, 10, 14, 17],
  'dominant-13th': [0, 4, 7, 10, 14, 21],
  'major-13th': [0, 4, 7, 11, 14, 21],
  'minor-13th': [0, 3, 7, 10, 14, 21],
  'suspended-second': [0, 2, 7],
  'suspended-fourth': [0, 5, 7],
  Neapolitan: [0, 4, 7],
  Italian: [0, 4, 10],
  French: [0, 4, 6, 10],
  German: [0, 4, 7, 10],
  pedal: [0],
  power: [0, 7],
  Tristan: [0, 3, 6, 10],
};

/** Loại không đọc được và cũng không có chữ hiển thị để đoán: chỉ đánh gốc và quãng năm, vì không biết là trưởng hay thứ. */
const UNKNOWN_KIND: readonly number[] = [0, 7];

/**
 * Họ hợp âm theo TIÊN TỐ của tên loại, cho các loại không có trong bảng chuẩn mà file vẫn ghi (ví dụ "minor-fifth" do
 * một số phần mềm xuất cho Em(♭5)). Thứ tự quan trọng: tiên tố dài hơn đứng trước.
 */
const KIND_FAMILIES: readonly (readonly [string, readonly number[]])[] = [
  ['half-diminished', [0, 3, 6, 10]],
  ['diminished', [0, 3, 6]],
  ['augmented', [0, 4, 8]],
  ['minor', [0, 3, 7]],
  ['major', [0, 4, 7]],
  ['dominant', [0, 4, 7, 10]],
  ['suspended', [0, 5, 7]],
  ['power', [0, 7]],
];

/**
 * Đoán các quãng từ chữ hiển thị của hợp âm ("m(b5)", "dim", "sus4", "aug"...) khi loại không nhận ra. Không đoán được
 * (chữ rỗng) thì trả null. Chữ không giống loại nào được coi là hợp âm trưởng. Nhận ra cả "b5" / "#5" ghi trong chữ.
 */
function intervalsFromText(text: string): readonly number[] | null {
  const t = text.trim();
  if (!t) return null;
  let base: number[];
  if (/^(dim|°|o)/.test(t)) base = [0, 3, 6];
  else if (/^(aug|\+)/.test(t)) base = [0, 4, 8];
  else if (/^sus/.test(t)) base = [0, 5, 7];
  else if (/^(min|mi|m(?!a)|-)/.test(t)) base = [0, 3, 7];
  else base = [0, 4, 7];
  if (/[b♭]5/.test(t)) base = base.map((i) => (i === 7 ? 6 : i));
  else if (/[#♯]5/.test(t)) base = base.map((i) => (i === 7 ? 8 : i));
  return base;
}

/** Các quãng của loại hợp âm: theo bảng chuẩn, rồi theo họ của tên loại, rồi theo chữ hiển thị, cuối cùng gốc + quãng năm. */
function intervalsOf(kindEl: Element | undefined): readonly number[] {
  const kind = textOf(kindEl);
  if (Object.prototype.hasOwnProperty.call(KIND_INTERVALS, kind)) return KIND_INTERVALS[kind];
  const family = KIND_FAMILIES.find(([prefix]) => kind.startsWith(prefix));
  if (family) return family[1];
  return intervalsFromText(kindEl?.getAttribute('text') ?? '') ?? UNKNOWN_KIND;
}

const STEP_SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** Quãng (nửa cung) của bậc 1…7 trong gam trưởng. */
const DEGREE_SEMITONE = [0, 2, 4, 5, 7, 9, 11];

/** Nốt bass thấp nhất / nốt gốc của thế hợp âm (MIDI): bass nằm trong C2–B2, gốc hợp âm trong E3–D♯4. */
const BASS_BASE = 36;
const CHORD_BASE = 52;

export interface ChordNotes {
  /** Nốt bass (MIDI). */
  bass: number;
  /** Các nốt của hợp âm (MIDI), từ thấp lên cao, không trùng. */
  tones: number[];
}

const child = (parent: Element, tag: string): Element | undefined =>
  Array.from(parent.children).find((c) => c.tagName === tag);

const textOf = (el: Element | undefined): string => el?.textContent?.trim() ?? '';

/** Cao độ (0–11) của một cặp <xxx-step> / <xxx-alter>; null nếu bậc không hợp lệ. */
const pitchClass = (holder: Element | undefined, stepTag: string, alterTag: string): number | null => {
  if (!holder) return null;
  const step = textOf(child(holder, stepTag));
  if (!(step in STEP_SEMITONE)) return null;
  const alter = Math.round(Number(textOf(child(holder, alterTag)) || 0)) || 0;
  return (((STEP_SEMITONE[step] + alter) % 12) + 12) % 12;
};

/** Quãng (nửa cung kể từ gốc) của bậc `value` (1, 3, 5, 7, 9, 11, 13...) chưa biến hóa. */
const naturalDegree = (value: number): number => {
  const index = Math.max(1, Math.round(value)) - 1;
  return DEGREE_SEMITONE[index % 7] + 12 * Math.floor(index / 7);
};

/** Áp các thẻ <degree> (add / alter / subtract) lên danh sách quãng của hợp âm. */
function applyDegrees(harmony: Element, intervals: number[]): number[] {
  let result = [...intervals];
  for (const degree of Array.from(harmony.children).filter((c) => c.tagName === 'degree')) {
    const value = Number(textOf(child(degree, 'degree-value')));
    const alter = Math.round(Number(textOf(child(degree, 'degree-alter')) || 0)) || 0;
    const type = textOf(child(degree, 'degree-type'));
    if (!Number.isFinite(value) || value < 1) continue;
    const natural = naturalDegree(value);
    const target = natural + alter;
    const samePitchClass = (t: number, other: number) => (((t - other) % 12) + 12) % 12 === 0;
    if (type === 'add') {
      if (!result.includes(target)) result.push(target);
    } else if (type === 'alter') {
      // đổi nốt của bậc đó (chưa biến hóa) sang nốt đã nâng/hạ; hợp âm chưa có bậc đó thì thêm vào
      result = result.filter((t) => !samePitchClass(t, natural));
      result.push(target);
    } else if (type === 'subtract') {
      result = result.filter((t) => !samePitchClass(t, target));
    }
  }
  return [...new Set(result)].sort((a, b) => a - b);
}

/**
 * Các nốt đệm của một thẻ <harmony>, hoặc null nếu không có gì để đánh ("không có hợp âm", hay thiếu gốc).
 */
export function chordNotes(harmony: Element): ChordNotes | null {
  const kind = textOf(child(harmony, 'kind'));
  if (kind === 'none') return null;
  const root = pitchClass(child(harmony, 'root'), 'root-step', 'root-alter');
  if (root === null) return null;
  const intervals = applyDegrees(harmony, [...intervalsOf(child(harmony, 'kind'))]);

  const rootMidi = CHORD_BASE + ((((root - CHORD_BASE) % 12) + 12) % 12);
  const tones = [...new Set(intervals.map((i) => rootMidi + i))].sort((a, b) => a - b);
  const bassClass = pitchClass(child(harmony, 'bass'), 'bass-step', 'bass-alter') ?? root;
  const bass = BASS_BASE + ((((bassClass - BASS_BASE) % 12) + 12) % 12);
  return { bass, tones };
}
