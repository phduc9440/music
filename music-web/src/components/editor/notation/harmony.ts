/**
 * Hợp âm (chord symbol) ghi trên nốt: <harmony> đứng ngay trước thẻ <note> đầu của mục. Gõ bằng ký hiệu thường dùng
 * như "C", "Am7", "G/B", "F#m", "Bbmaj7", "C6/9", "N.C."; hậu tố lạ vẫn giữ nguyên chữ (kind = other).
 */
import { childOf, commitEdit, textOf, touch } from '../core/commands';
import type { EditLabel, EditResult, Touched } from '../core/commands';
import type { NoteInfo, ScoreDocument } from '../core/ScoreDocument';
import { t } from '../../../i18n/core';

interface Note {
  step: string;
  alter: number;
}

/** Nốt thêm hoặc đổi của hợp âm (<degree>): ví dụ nốt 9 thêm vào "C6/9", nốt 11 tăng nửa cung trong "C7#11". */
export interface ChordDegree {
  value: number;
  alter: number;
  /** subtract: bỏ bớt nốt (ví dụ "7(no3)"). */
  type: 'add' | 'alter' | 'subtract';
}

export interface ChordSpec {
  root: Note;
  /** Giá trị <kind> của MusicXML. */
  kind: string;
  /** Chữ hiển thị sau tên gốc (ví dụ "m7"). */
  text: string;
  bass: Note | null;
  /** Các <degree> đi kèm kind (rỗng với đa số hợp âm). */
  degrees: ChordDegree[];
  /** Hợp âm "N.C." (không hợp âm): hiện chữ N.C., không hiện tên gốc. */
  noChord: boolean;
}

interface KindDef {
  kind: string;
  degrees?: ChordDegree[];
}

const addDegree = (value: number, alter = 0): ChordDegree => ({ value, alter, type: 'add' });
const alterDegree = (value: number, alter: number): ChordDegree => ({ value, alter, type: 'alter' });

/**
 * Hậu tố gõ vào → kind (và degree) của MusicXML. Chữ hiển thị luôn giữ đúng như người dùng gõ. Với mỗi kind, hậu tố
 * đứng đầu là cách viết mặc định khi đọc hợp âm từ file không có thuộc tính text.
 */
const KINDS = new Map<string, KindDef>([
  ['', { kind: 'major' }],
  ['m', { kind: 'minor' }],
  ['min', { kind: 'minor' }],
  ['mi', { kind: 'minor' }],
  ['-', { kind: 'minor' }],
  ['7', { kind: 'dominant' }],
  ['maj7', { kind: 'major-seventh' }],
  ['Maj7', { kind: 'major-seventh' }],
  ['M7', { kind: 'major-seventh' }],
  ['Δ', { kind: 'major-seventh' }],
  ['Δ7', { kind: 'major-seventh' }],
  ['m7', { kind: 'minor-seventh' }],
  ['min7', { kind: 'minor-seventh' }],
  ['mi7', { kind: 'minor-seventh' }],
  ['-7', { kind: 'minor-seventh' }],
  ['mM7', { kind: 'major-minor' }],
  ['mMaj7', { kind: 'major-minor' }],
  ['mmaj7', { kind: 'major-minor' }],
  ['m(maj7)', { kind: 'major-minor' }],
  ['dim', { kind: 'diminished' }],
  ['°', { kind: 'diminished' }],
  ['o', { kind: 'diminished' }],
  ['dim7', { kind: 'diminished-seventh' }],
  ['°7', { kind: 'diminished-seventh' }],
  ['o7', { kind: 'diminished-seventh' }],
  ['m(b5)', { kind: 'minor', degrees: [alterDegree(5, -1)] }],
  ['m(♭5)', { kind: 'minor', degrees: [alterDegree(5, -1)] }],
  ['mb5', { kind: 'minor', degrees: [alterDegree(5, -1)] }],
  ['m♭5', { kind: 'minor', degrees: [alterDegree(5, -1)] }],
  ['m7(b5)', { kind: 'half-diminished' }],
  ['m7(♭5)', { kind: 'half-diminished' }],
  ['m7b5', { kind: 'half-diminished' }],
  ['m7♭5', { kind: 'half-diminished' }],
  ['ø', { kind: 'half-diminished' }],
  ['ø7', { kind: 'half-diminished' }],
  ['aug', { kind: 'augmented' }],
  ['+', { kind: 'augmented' }],
  ['aug7', { kind: 'augmented-seventh' }],
  ['+7', { kind: 'augmented-seventh' }],
  ['sus4', { kind: 'suspended-fourth' }],
  ['sus', { kind: 'suspended-fourth' }],
  ['sus2', { kind: 'suspended-second' }],
  ['7sus4', { kind: 'suspended-fourth', degrees: [addDegree(7, -1)] }],
  ['7sus', { kind: 'suspended-fourth', degrees: [addDegree(7, -1)] }],
  ['6', { kind: 'major-sixth' }],
  ['m6', { kind: 'minor-sixth' }],
  ['6/9', { kind: 'major-sixth', degrees: [addDegree(9)] }],
  ['m6/9', { kind: 'minor-sixth', degrees: [addDegree(9)] }],
  ['9', { kind: 'dominant-ninth' }],
  ['maj9', { kind: 'major-ninth' }],
  ['M9', { kind: 'major-ninth' }],
  ['m9', { kind: 'minor-ninth' }],
  ['min9', { kind: 'minor-ninth' }],
  ['11', { kind: 'dominant-11th' }],
  ['m11', { kind: 'minor-11th' }],
  ['13', { kind: 'dominant-13th' }],
  ['maj13', { kind: 'major-13th' }],
  ['m13', { kind: 'minor-13th' }],
  ['5', { kind: 'power' }],
  ['add9', { kind: 'major', degrees: [addDegree(9)] }],
  ['add2', { kind: 'major', degrees: [addDegree(2)] }],
  ['m(add9)', { kind: 'minor', degrees: [addDegree(9)] }],
  ['madd9', { kind: 'minor', degrees: [addDegree(9)] }],
  ['7#11', { kind: 'dominant', degrees: [addDegree(11, 1)] }],
  ['7b13', { kind: 'dominant', degrees: [addDegree(13, -1)] }],
  ['7b9', { kind: 'dominant', degrees: [addDegree(9, -1)] }],
  ['7#9', { kind: 'dominant', degrees: [addDegree(9, 1)] }],
  ['7b5', { kind: 'dominant', degrees: [alterDegree(5, -1)] }],
  ['7#5', { kind: 'dominant', degrees: [alterDegree(5, 1)] }],
  // "alt" không có kind riêng: dominant kèm b9, #9 và #5 (nghe đúng màu hợp âm biến hóa), chữ "7alt" giữ trong text.
  ['7alt', { kind: 'dominant', degrees: [addDegree(9, -1), addDegree(9, 1), alterDegree(5, 1)] }],
]);

const lookupKind = (suffix: string): KindDef =>
  KINDS.get(suffix) ?? KINDS.get(suffix.replace(/\s+/g, '')) ?? parseSuffix(suffix) ?? { kind: 'other' };

// ---- Đọc hậu tố hợp âm bất kỳ (không có sẵn trong bảng KINDS) ----------------------------------------------------
//
// Hậu tố = phần chất lượng ở đầu (m, dim, aug, ø, maj, 5) + số mở rộng (6, 7, 9, 11, 13, 6/9) + các nốt thêm / biến hóa /
// bỏ bớt viết liền hoặc trong ngoặc: "7b9", "7(b9,#11)", "13sus4", "maj7#5", "m9b5", "9#11", "7alt", "madd2",
// "dim(maj7)", "+maj7", "7(no3,add4)", "m#5", "(b5)"... Kết quả là kind chuẩn của MusicXML kèm các <degree>, nên trình
// phát đánh đúng các nốt và hợp âm AI gợi ý (có nốt thêm) gõ lại được y hệt.

type Quality = 'major' | 'minor' | 'dim' | 'hdim' | 'aug' | 'power';
/** Số mở rộng ở đầu: 69 = "6/9"; maj = có chữ maj/M/Δ đi trước (maj7, maj9...). */
interface Head {
  quality: Quality;
  ext: number | null;
  maj: boolean;
}

/** Quãng (nửa cung) của bậc tự nhiên trong gam trưởng: 2 → 2, 9 → 14, 11 → 17, 13 → 21. */
const naturalSemitones = (value: number): number => {
  const index = value - 1;
  return [0, 2, 4, 5, 7, 9, 11][index % 7] + 12 * Math.floor(index / 7);
};

/** Các bậc tự nhiên có sẵn trong mỗi kind (để "b9" trên hợp âm 9 là biến hóa nốt 9, còn trên hợp âm 7 là thêm nốt). */
const KIND_DEGREES: Record<string, readonly number[]> = {
  'dominant-ninth': [9],
  'major-ninth': [9],
  'minor-ninth': [9],
  'dominant-11th': [9, 11],
  'major-11th': [9, 11],
  'minor-11th': [9, 11],
  'dominant-13th': [9, 13],
  'major-13th': [9, 13],
  'minor-13th': [9, 13],
};

const readHead = (s: string): { head: Head; rest: string } | null => {
  let rest = s;
  let quality: Quality = 'major';
  let maj = false;
  const take = (re: RegExp): RegExpExecArray | null => {
    const m = re.exec(rest);
    if (m) rest = rest.slice(m[0].length);
    return m;
  };
  if (take(/^(m7b5|ø7?)/)) quality = 'hdim';
  else if (take(/^(dim|°|o)/)) quality = 'dim';
  else if (take(/^(aug|\+)/)) quality = 'aug';
  else if (take(/^(min|mi|m(?!aj)|-)/)) quality = 'minor';
  const majMark = quality !== 'hdim' ? take(/^(maj|Maj|MAJ|ma|M|Δ)/) : null;
  if (majMark) maj = true;
  let ext: number | null = null;
  const num = take(/^(6\/9|69|13|11|9|7|6|5)/);
  if (num) {
    ext = num[1] === '6/9' || num[1] === '69' ? 69 : Number(num[1]);
    if (ext === 5 && quality === 'major' && !maj) quality = 'power';
    else if (ext === 5) return null;
  } else if (majMark) {
    // "CΔ" là maj7; "Cmaj", "CM" đứng một mình là hợp âm trưởng
    if (majMark[1] === 'Δ') ext = 7;
    else maj = false;
  }
  return { head: { quality, ext, maj }, rest };
};

/** Kind + degree gốc từ phần đầu (chất lượng, số mở rộng, sus). */
const baseOf = (head: Head, sus: 2 | 4 | null): KindDef | null => {
  const { quality, ext, maj } = head;
  const d = addDegree;
  if (sus) {
    if (quality !== 'major') return null;
    const kind = sus === 2 ? 'suspended-second' : 'suspended-fourth';
    const seventh = maj ? [d(7)] : ext && ext >= 7 && ext !== 69 ? [d(7, -1)] : [];
    const upper = ext === 9 || ext === 11 ? [d(9)] : ext === 13 ? [d(9), d(13)] : ext === 69 ? [d(6), d(9)] : [];
    const sixth = ext === 6 ? [d(6)] : [];
    return { kind, degrees: [...seventh, ...sixth, ...upper] };
  }
  switch (quality) {
    case 'power':
      return { kind: 'power' };
    case 'hdim':
      return ext === 9 ? { kind: 'half-diminished', degrees: [d(9)] } : { kind: 'half-diminished' };
    case 'dim':
      if (maj) return { kind: 'diminished', degrees: [d(7)] };
      return { kind: ext === 7 ? 'diminished-seventh' : 'diminished' };
    case 'aug':
      if (maj) return { kind: 'augmented', degrees: [d(7)] };
      if (ext === 9) return { kind: 'augmented-seventh', degrees: [d(9)] };
      return { kind: ext === 7 ? 'augmented-seventh' : 'augmented' };
    case 'minor':
      if (maj) {
        const more = ext === 9 ? [d(9)] : ext === 11 ? [d(9), d(11)] : ext === 13 ? [d(9), d(11), d(13)] : [];
        return { kind: 'major-minor', degrees: more };
      }
      if (ext === 69) return { kind: 'minor-sixth', degrees: [d(9)] };
      return {
        kind:
          { 6: 'minor-sixth', 7: 'minor-seventh', 9: 'minor-ninth', 11: 'minor-11th', 13: 'minor-13th' }[ext ?? 0] ??
          'minor',
      };
    default:
      if (ext === 69) return { kind: 'major-sixth', degrees: [d(9)] };
      if (maj) return { kind: { 9: 'major-ninth', 11: 'major-11th', 13: 'major-13th' }[ext ?? 0] ?? 'major-seventh' };
      return {
        kind:
          { 6: 'major-sixth', 7: 'dominant', 9: 'dominant-ninth', 11: 'dominant-11th', 13: 'dominant-13th' }[
            ext ?? 0
          ] ?? 'major',
      };
  }
};

const ACCIDENTAL: Record<string, number> = { '': 0, b: -1, '-': -1, '#': 1, '+': 1 };

/**
 * Hiểu một hậu tố hợp âm bất kỳ thành kind + degree; null nếu có phần không đọc được (khi đó vẫn giữ nguyên chữ người dùng
 * gõ với kind "other" như trước).
 */
export function parseSuffix(input: string): KindDef | null {
  const s = input.replace(/♭/g, 'b').replace(/♯/g, '#').replace(/\s+/g, '');
  const read = readHead(s);
  if (!read) return null;
  let rest = read.rest;
  let sus: 2 | 4 | null = null;
  let alt = false;
  const tokens: { type: 'add' | 'alter' | 'subtract' | 'auto' | 'maj'; value: number; alter: number }[] = [];
  while (rest.length > 0) {
    let m: RegExpExecArray | null;
    if (/^[(),/]/.test(rest)) {
      rest = rest.slice(1);
    } else if ((m = /^sus(2|4)?/.exec(rest))) {
      sus = m[1] === '2' ? 2 : 4;
      rest = rest.slice(m[0].length);
    } else if (rest.startsWith('alt')) {
      alt = true;
      rest = rest.slice(3);
    } else if ((m = /^(add)?(maj|Maj|M|Δ)(7|9)/.exec(rest))) {
      tokens.push({ type: 'maj', value: Number(m[3]), alter: 0 });
      rest = rest.slice(m[0].length);
    } else if ((m = /^(no|omit)(\d+)/.exec(rest))) {
      tokens.push({ type: 'subtract', value: Number(m[2]), alter: 0 });
      rest = rest.slice(m[0].length);
    } else if ((m = /^(add)?([b#+-]?)(\d{1,2})/.exec(rest))) {
      const value = Number(m[3]);
      if (value < 2 || value > 13) return null;
      tokens.push({ type: m[1] ? 'add' : 'auto', value, alter: ACCIDENTAL[m[2]] });
      rest = rest.slice(m[0].length);
    } else {
      return null;
    }
  }
  // "7sus4": số mở rộng đứng trước sus; "sus4" một mình đứng sau phần đầu rỗng
  const base = baseOf(read.head, sus);
  if (!base) return null;
  const degrees = [...(base.degrees ?? [])];
  const has = (value: number) =>
    (KIND_DEGREES[base.kind] ?? []).includes(value) || degrees.some((g) => g.value === value && g.type === 'add');
  if (alt) degrees.push(addDegree(9, -1), addDegree(9, 1), alterDegree(5, 1));
  for (const tk of tokens) {
    if (tk.type === 'subtract') degrees.push({ value: tk.value, alter: 0, type: 'subtract' });
    else if (tk.type === 'maj') degrees.push(addDegree(7), ...(tk.value === 9 ? [addDegree(9)] : []));
    else if (tk.type === 'add') degrees.push(addDegree(tk.value, tk.value === 7 && tk.alter === 0 ? -1 : tk.alter));
    else if (tk.value === 5) degrees.push(tk.alter ? alterDegree(5, tk.alter) : addDegree(5));
    else if (tk.value === 7)
      degrees.push(addDegree(7, tk.alter - 1)); // "7" trong ngoặc là quãng bảy thứ
    else if (tk.alter !== 0 && has(tk.value)) degrees.push(alterDegree(tk.value, tk.alter));
    else degrees.push(addDegree(tk.value, tk.alter));
  }
  return degrees.length ? { kind: base.kind, degrees } : { kind: base.kind };
}

/** Quãng của các nốt hợp âm theo kind + degree đã đọc (để kiểm tra; trình phát dùng chordNotes trên thẻ <harmony>). */
export const degreeSemitones = (degree: ChordDegree): number => naturalSemitones(degree.value) + degree.alter;

const ALTER_SYMBOL: Record<number, string> = { [-2]: 'bb', [-1]: 'b', 0: '', 1: '#', 2: '##' };

const alterOf = (symbol: string): number =>
  ({ '#': 1, '♯': 1, b: -1, '♭': -1, '##': 2, x: 2, '𝄪': 2, bb: -2, '𝄫': -2 })[symbol] ?? 0;

/** "N.C.", "NC", "N.C" — không có hợp âm. */
const NO_CHORD = /^N\.?C\.?$/i;
/** Nốt bass ở cuối: "/E", "/F#", "/Bbb". Dấu "/" theo sau là CHỮ SỐ (như "6/9") không phải bass. */
const BASS = /\/([A-Ga-g])(##|bb|x|𝄪|𝄫|[#b♯♭]?)$/;
const ROOT = /^([A-Ga-g])(##|bb|x|𝄪|𝄫|[#b♯♭]?)(.*)$/;

/** Hiểu một ký hiệu hợp âm; null nếu không đọc được. */
export function parseChord(input: string): ChordSpec | null {
  const clean = input.trim();
  if (NO_CHORD.test(clean)) {
    return { root: { step: 'C', alter: 0 }, kind: 'none', text: 'N.C.', bass: null, degrees: [], noChord: true };
  }
  const bassMatch = BASS.exec(clean);
  const match = ROOT.exec(bassMatch ? clean.slice(0, bassMatch.index) : clean);
  if (!match) return null;
  const suffix = match[3].trim();
  if (suffix.endsWith('/')) return null;
  const def = lookupKind(suffix);
  return {
    root: { step: match[1].toUpperCase(), alter: alterOf(match[2]) },
    kind: def.kind,
    text: suffix,
    bass: bassMatch ? { step: bassMatch[1].toUpperCase(), alter: alterOf(bassMatch[2]) } : null,
    degrees: def.degrees ?? [],
    noChord: false,
  };
}

const noteText = (el: Element | undefined, stepTag: string, alterTag: string): string => {
  if (!el) return '';
  const alter = Number(textOf(childOf(el, alterTag)) || 0) || 0;
  return `${textOf(childOf(el, stepTag))}${ALTER_SYMBOL[alter] ?? ''}`;
};

/** Ký hiệu hợp âm đang ghi trong một thẻ <harmony>, theo dạng người dùng gõ. */
export const chordText = (harmony: Element): string => {
  const kind = childOf(harmony, 'kind');
  if (textOf(kind) === 'none') return kind?.getAttribute('text') || 'N.C.';
  const root = noteText(childOf(harmony, 'root'), 'root-step', 'root-alter');
  const text = kind?.hasAttribute('text') ? (kind.getAttribute('text') ?? '') : defaultSuffix(textOf(kind));
  const bass = noteText(childOf(harmony, 'bass'), 'bass-step', 'bass-alter');
  return `${root}${text}${bass ? `/${bass}` : ''}`;
};

/** Hậu tố mặc định của một kind khi file không ghi thuộc tính text (không tính các kind có degree). */
const defaultSuffix = (kind: string): string => {
  for (const [suffix, def] of KINDS) {
    if (def.kind === kind && !def.degrees) return suffix;
  }
  return '';
};

/** Các thẻ <harmony> đứng liền ngay trước thẻ `note`. */
const harmoniesBefore = (note: Element): Element[] => {
  const out: Element[] = [];
  let prev = note.previousElementSibling;
  while (prev && prev.tagName === 'harmony') {
    out.push(prev);
    prev = prev.previousElementSibling;
  }
  return out;
};

/** Hợp âm đang gắn ở nốt `id` (chuỗi rỗng nếu chưa có). */
export const readChord = (doc: ScoreDocument, id: string): string => {
  const info = doc.getInfo(id);
  const first = info ? harmoniesBefore(info.element).pop() : undefined;
  return first ? chordText(first) : '';
};

/** Các mục (đầu hợp âm, kể cả dấu lặng) của cùng part/khuông/bè với `info` có thể mang hợp âm, theo thứ tự. */
export const chordSlots = (doc: ScoreDocument, info: NoteInfo): NoteInfo[] =>
  doc.notes.filter(
    (n) =>
      n.partIndex === info.partIndex &&
      n.staff === info.staff &&
      n.voice === info.voice &&
      n.chordIndex === 0 &&
      !n.isGrace,
  );

export const canHoldChord = (doc: ScoreDocument, id: string): boolean => {
  const info = doc.getInfo(id);
  return !!info && chordSlots(doc, info).includes(info);
};

/** Nốt kế tiếp (1) / liền trước (−1) có thể mang hợp âm; null nếu hết. */
export const stepChordNote = (doc: ScoreDocument, id: string, delta: 1 | -1): string | null => {
  const info = doc.getInfo(id);
  if (!info) return null;
  const slots = chordSlots(doc, info);
  const at = slots.indexOf(info);
  return at < 0 ? null : (slots[at + delta]?.id ?? null);
};

/** Thẻ <harmony> của một hợp âm đã đọc (dùng chung cho lệnh sửa và kiểm tra cách đánh). */
export const buildHarmony = (owner: Document, spec: ChordSpec): Element => {
  const make = (tag: string, text?: string) => {
    const el = owner.createElement(tag);
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const harmony = make('harmony');
  if (spec.noChord) harmony.setAttribute('print-frame', 'no');
  const root = make('root');
  const step = make('root-step', spec.root.step);
  if (spec.noChord) step.setAttribute('text', '');
  root.appendChild(step);
  if (spec.root.alter !== 0) root.appendChild(make('root-alter', String(spec.root.alter)));
  harmony.appendChild(root);
  const kind = make('kind', spec.kind);
  kind.setAttribute('text', spec.text);
  harmony.appendChild(kind);
  if (spec.bass) {
    const bass = make('bass');
    bass.appendChild(make('bass-step', spec.bass.step));
    if (spec.bass.alter !== 0) bass.appendChild(make('bass-alter', String(spec.bass.alter)));
    harmony.appendChild(bass);
  }
  for (const degree of spec.degrees) {
    const el = make('degree');
    el.appendChild(make('degree-value', String(degree.value)));
    el.appendChild(make('degree-alter', String(degree.alter)));
    el.appendChild(make('degree-type', degree.type));
    harmony.appendChild(el);
  }
  return harmony;
};

const writeChord = (note: Element, spec: ChordSpec | null): void => {
  harmoniesBefore(note).forEach((h) => h.remove());
  if (spec) note.before(buildHarmony(note.ownerDocument, spec));
};

/** Gắn (hoặc xóa khi `text` rỗng) hợp âm cho nốt `id`. */
export function setChord(doc: ScoreDocument, id: string, text: string): EditResult {
  const info = doc.getInfo(id);
  if (!info) return { ok: false, reason: 'empty' };
  if (!canHoldChord(doc, id)) return { ok: false, reason: 'empty' };
  const clean = text.trim();
  const spec = clean ? parseChord(clean) : null;
  if (clean && !spec) return { ok: false, reason: 'badChord' };
  const existing = readChord(doc, id);
  const wanted = spec ? chordText(buildHarmony(info.element.ownerDocument, spec)) : '';
  if (existing === wanted) return { ok: false, reason: 'unchanged' };
  const touched: Touched = new Map();
  touch(touched, info);
  const command = commitEdit(doc, t(spec ? 'editor.cmd.chord.set' : 'editor.cmd.chord.clear'), touched, [id], () =>
    writeChord(info.element, spec),
  );
  command.selectAfter = [id];
  return { ok: true, command };
}

/** Bản sao các thẻ <harmony> đang gắn ở nốt `id` (theo thứ tự trong file), để chép sang tài liệu khác. */
export const harmoniesOf = (doc: ScoreDocument, id: string): Element[] => {
  const info = doc.getInfo(id);
  return info
    ? harmoniesBefore(info.element)
        .reverse()
        .map((h) => h.cloneNode(true) as Element)
    : [];
};

/**
 * Thay hợp âm của nhiều nốt trong MỘT lệnh (hoàn tác một lần là trả lại hết): mỗi nốt nhận đúng các thẻ <harmony> cho
 * sẵn (chép nguyên, kể cả <degree>, vị trí), mảng rỗng là xóa. Dùng để nạp hoặc gỡ hợp âm AI gợi ý.
 */
export function replaceHarmonies(
  doc: ScoreDocument,
  entries: readonly { id: string; harmonies: readonly Element[] }[],
  label: EditLabel,
): EditResult {
  const targets = entries
    .map((e) => ({ info: doc.getInfo(e.id), harmonies: e.harmonies }))
    .filter((e): e is { info: NoteInfo; harmonies: readonly Element[] } => !!e.info);
  if (targets.length === 0) return { ok: false, reason: 'empty' };
  const touched: Touched = new Map();
  targets.forEach((e) => touch(touched, e.info));
  const ids = targets.map((e) => e.info.id);
  const command = commitEdit(doc, label, touched, ids, () => {
    for (const { info, harmonies } of targets) {
      const owner = info.element.ownerDocument;
      harmoniesBefore(info.element).forEach((h) => h.remove());
      for (const h of harmonies) info.element.before(owner.importNode(h, true));
    }
  });
  return { ok: true, command };
}

/**
 * Gán một dãy hợp âm cách nhau bằng dấu cách (hoặc "|") lên các nốt liên tiếp từ nốt `startId`; "_" bỏ qua một nốt.
 * Có hợp âm không hiểu được thì không gán gì.
 */
export function pasteChords(
  doc: ScoreDocument,
  startId: string,
  text: string,
): { result: EditResult; placed: number; leftover: number } {
  const fail = (reason: 'empty' | 'badChord') => ({
    result: { ok: false, reason } as EditResult,
    placed: 0,
    leftover: 0,
  });
  const info = doc.getInfo(startId);
  if (!info) return fail('empty');
  const slots = chordSlots(doc, info);
  const start = slots.indexOf(info);
  if (start < 0) return fail('empty');
  const tokens = text.split(/[\s|]+/).filter(Boolean);
  if (tokens.length === 0) return fail('empty');
  const specs = tokens.map((t) => (t === '_' ? 'skip' : parseChord(t)));
  if (specs.some((s) => s === null)) return fail('badChord');
  const targets = slots.slice(start, start + specs.length);
  const touched: Touched = new Map();
  targets.forEach((n) => touch(touched, n));
  let placed = 0;
  const command = commitEdit(
    doc,
    t('editor.cmd.chord.paste'),
    touched,
    targets.map((n) => n.id),
    () => {
      targets.forEach((note, i) => {
        const spec = specs[i];
        if (spec === 'skip' || spec === null) return;
        writeChord(note.element, spec);
        placed += 1;
      });
    },
  );
  const last = targets[targets.length - 1];
  command.selectAfter = [last ? (stepChordNote(doc, last.id, 1) ?? last.id) : startId];
  return { result: { ok: true, command }, placed, leftover: Math.max(0, specs.length - targets.length) };
}
