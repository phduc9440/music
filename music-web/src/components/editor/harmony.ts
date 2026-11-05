/**
 * Hợp âm (chord symbol) ghi trên nốt: <harmony> đứng ngay trước thẻ <note> đầu của mục. Gõ bằng ký hiệu thường dùng
 * như "C", "Am7", "G/B", "F#m", "Bbmaj7", "C6/9", "N.C."; hậu tố lạ vẫn giữ nguyên chữ (kind = other).
 */
import { commitEdit, touch } from './commands';
import type { EditResult, Touched } from './commands';
import type { NoteInfo, ScoreDocument } from './ScoreDocument';

interface Note {
  step: string;
  alter: number;
}

/** Nốt thêm hoặc đổi của hợp âm (<degree>): ví dụ nốt 9 thêm vào "C6/9", nốt 11 tăng nửa cung trong "C7#11". */
export interface ChordDegree {
  value: number;
  alter: number;
  type: 'add' | 'alter';
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
  // "alt" gồm nhiều nốt biến hóa nên không có kind riêng: ghi là dominant, chữ "7alt" giữ trong thuộc tính text.
  ['7alt', { kind: 'dominant' }],
]);

const lookupKind = (suffix: string): KindDef =>
  KINDS.get(suffix) ?? KINDS.get(suffix.replace(/\s+/g, '')) ?? { kind: 'other' };

const ALTER_SYMBOL: Record<number, string> = { [-2]: 'bb', [-1]: 'b', 0: '', 1: '#', 2: '##' };

const alterOf = (symbol: string): number =>
  symbol === '#' || symbol === '♯' ? 1 : symbol === 'b' || symbol === '♭' ? -1 : 0;

/** "N.C.", "NC", "N.C" — không có hợp âm. */
const NO_CHORD = /^N\.?C\.?$/i;
/** Nốt bass ở cuối: "/E", "/F#". Dấu "/" theo sau là CHỮ SỐ (như "6/9") không phải bass. */
const BASS = /\/([A-Ga-g])([#b♯♭]?)$/;
const ROOT = /^([A-Ga-g])([#b♯♭]?)(.*)$/;

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

const child = (parent: Element, tag: string): Element | undefined =>
  Array.from(parent.children).find((c) => c.tagName === tag);
const textOf = (el?: Element): string => el?.textContent?.trim() ?? '';

const noteText = (el: Element | undefined, stepTag: string, alterTag: string): string => {
  if (!el) return '';
  const alter = Number(textOf(child(el, alterTag)) || 0) || 0;
  return `${textOf(child(el, stepTag))}${ALTER_SYMBOL[alter] ?? ''}`;
};

/** Ký hiệu hợp âm đang ghi trong một thẻ <harmony>, theo dạng người dùng gõ. */
export const chordText = (harmony: Element): string => {
  const kind = child(harmony, 'kind');
  if (textOf(kind) === 'none') return kind?.getAttribute('text') || 'N.C.';
  const root = noteText(child(harmony, 'root'), 'root-step', 'root-alter');
  const text = kind?.hasAttribute('text') ? (kind.getAttribute('text') ?? '') : defaultSuffix(textOf(kind));
  const bass = noteText(child(harmony, 'bass'), 'bass-step', 'bass-alter');
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

const buildHarmony = (owner: Document, spec: ChordSpec): Element => {
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
  const command = commitEdit(doc, spec ? 'Nhập hợp âm' : 'Xóa hợp âm', touched, [id], () =>
    writeChord(info.element, spec),
  );
  command.selectAfter = [id];
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
    'Dán hợp âm',
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
