/**
 * Hợp âm (chord symbol) ghi trên nốt: <harmony> đứng ngay trước thẻ <note> đầu của mục. Gõ bằng ký hiệu thường dùng
 * như "C", "Am7", "G/B", "F#m", "Bbmaj7"; hậu tố lạ vẫn giữ nguyên chữ (kind = other).
 */
import { commitEdit, touch } from './commands';
import type { EditResult, Touched } from './commands';
import type { NoteInfo, ScoreDocument } from './ScoreDocument';

interface Note {
  step: string;
  alter: number;
}

export interface ChordSpec {
  root: Note;
  /** Giá trị <kind> của MusicXML. */
  kind: string;
  /** Chữ hiển thị sau tên gốc (ví dụ "m7"). */
  text: string;
  bass: Note | null;
}

/** Hậu tố gõ vào → kind của MusicXML (chữ hiển thị giữ đúng như người dùng gõ). */
const KINDS: Record<string, string> = {
  '': 'major',
  m: 'minor',
  min: 'minor',
  '-': 'minor',
  '7': 'dominant',
  maj7: 'major-seventh',
  M7: 'major-seventh',
  m7: 'minor-seventh',
  min7: 'minor-seventh',
  dim: 'diminished',
  dim7: 'diminished-seventh',
  aug: 'augmented',
  '+': 'augmented',
  sus4: 'suspended-fourth',
  sus2: 'suspended-second',
  sus: 'suspended-fourth',
  '6': 'major-sixth',
  m6: 'minor-sixth',
  '9': 'dominant-ninth',
  maj9: 'major-ninth',
  m9: 'minor-ninth',
  m7b5: 'half-diminished',
  '5': 'power',
};

const ALTER_SYMBOL: Record<number, string> = { [-2]: 'bb', [-1]: 'b', 0: '', 1: '#', 2: '##' };

const alterOf = (symbol: string): number =>
  symbol === '#' || symbol === '♯' ? 1 : symbol === 'b' || symbol === '♭' ? -1 : 0;

const PATTERN = /^([A-Ga-g])([#b♯♭]?)([^/]*)(?:\/([A-Ga-g])([#b♯♭]?))?$/;

/** Hiểu một ký hiệu hợp âm; null nếu không đọc được. */
export function parseChord(input: string): ChordSpec | null {
  const match = PATTERN.exec(input.trim());
  if (!match) return null;
  const suffix = match[3].trim();
  return {
    root: { step: match[1].toUpperCase(), alter: alterOf(match[2]) },
    kind: KINDS[suffix] ?? 'other',
    text: suffix,
    bass: match[4] ? { step: match[4].toUpperCase(), alter: alterOf(match[5]) } : null,
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
  const root = noteText(child(harmony, 'root'), 'root-step', 'root-alter');
  const kind = child(harmony, 'kind');
  const text = kind?.hasAttribute('text') ? (kind.getAttribute('text') ?? '') : defaultSuffix(textOf(kind));
  const bass = noteText(child(harmony, 'bass'), 'bass-step', 'bass-alter');
  return `${root}${text}${bass ? `/${bass}` : ''}`;
};

const defaultSuffix = (kind: string): string => {
  const hit = Object.entries(KINDS).find(
    ([suffix, k]) => k === kind && suffix !== '' && suffix !== 'min' && suffix !== '-',
  );
  return kind === 'major' ? '' : (hit?.[0] ?? '');
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
  const root = make('root');
  root.appendChild(make('root-step', spec.root.step));
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
