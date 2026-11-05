/**
 * Các chữ đầu bản nhạc: tiêu đề, tác giả. Nội dung nằm ở <movement-title> / <work-title> / <creator type="composer">
 * (và <credit> nếu có). Kiểu chữ (cỡ, đậm, nghiêng) là cài đặt riêng của ứng dụng, lưu trong
 * <identification><miscellaneous> nên vẫn là MusicXML hợp lệ.
 */
import type { EditResult } from './commands';
import type { ScoreDocument } from './ScoreDocument';

export type HeaderField = 'title' | 'composer';

export interface TextStyle {
  /** Cỡ chữ (px ở mức zoom 100%); null = mặc định. */
  size: number | null;
  bold: boolean;
  italic: boolean;
}

export interface HeaderState {
  title: string;
  composer: string;
  styles: Record<HeaderField, TextStyle>;
}

/** Cỡ chữ mặc định của OSMD (px ở zoom 100%). */
export const DEFAULT_SIZE: Record<HeaderField, number> = { title: 40, composer: 20 };
export const SIZE_MIN = 8;
export const SIZE_MAX = 96;

const NO_STYLE: TextStyle = { size: null, bold: false, italic: false };

const child = (parent: Element, tag: string, pred?: (el: Element) => boolean): Element | undefined =>
  Array.from(parent.children).find((c) => c.tagName === tag && (!pred || pred(c)));

const textOf = (el?: Element): string => el?.textContent?.trim() ?? '';

const encodeStyle = (s: TextStyle): string =>
  [s.size ? `size=${s.size}` : '', s.bold ? 'bold' : '', s.italic ? 'italic' : ''].filter(Boolean).join(';');

const decodeStyle = (raw: string): TextStyle => {
  const parts = raw.split(';').map((p) => p.trim());
  const size = Number(parts.find((p) => p.startsWith('size='))?.slice(5));
  return {
    size: Number.isFinite(size) && size >= SIZE_MIN && size <= SIZE_MAX ? size : null,
    bold: parts.includes('bold'),
    italic: parts.includes('italic'),
  };
};

const miscField = (root: Element, name: string): Element | undefined => {
  const misc = child(root, 'identification') && child(child(root, 'identification') as Element, 'miscellaneous');
  return misc ? child(misc, 'miscellaneous-field', (f) => f.getAttribute('name') === name) : undefined;
};

/** Đọc tiêu đề, tác giả và kiểu chữ hiện có. */
export function readHeader(doc: ScoreDocument): HeaderState {
  const root = doc.root;
  const work = child(root, 'work');
  const identification = child(root, 'identification');
  const creator = identification && child(identification, 'creator', (c) => c.getAttribute('type') === 'composer');
  const style = (field: HeaderField) => {
    const raw = textOf(miscField(root, `style-${field}`));
    return raw ? decodeStyle(raw) : { ...NO_STYLE };
  };
  return {
    title: textOf(child(root, 'movement-title')) || textOf(work && child(work, 'work-title')),
    composer: textOf(creator),
    styles: { title: style('title'), composer: style('composer') },
  };
}

/** Chèn `el` vào phần đầu file trước phần tử đầu tiên có tên trong `before` (cuối cùng: trước <part-list>). */
const insertHead = (root: Element, el: Element, before: string[]): void => {
  const anchor =
    Array.from(root.children).find((c) => before.includes(c.tagName)) ??
    Array.from(root.children).find((c) => c.tagName === 'part-list');
  root.insertBefore(el, anchor ?? null);
};

const setCreditWords = (root: Element, type: string, text: string): void => {
  for (const credit of Array.from(root.children).filter((c) => c.tagName === 'credit')) {
    if (child(credit, 'credit-type', (t) => textOf(t) === type)) {
      const words = child(credit, 'credit-words');
      if (words) words.textContent = text;
    }
  }
};

const writeTitle = (root: Element, text: string): void => {
  const owner = root.ownerDocument;
  let movement = child(root, 'movement-title');
  if (!movement) {
    movement = owner.createElement('movement-title');
    insertHead(root, movement, ['identification', 'defaults', 'credit']);
  }
  movement.textContent = text;
  const work = child(root, 'work');
  const workTitle = work && child(work, 'work-title');
  if (workTitle) workTitle.textContent = text;
  setCreditWords(root, 'title', text);
};

const writeComposer = (root: Element, text: string): void => {
  const owner = root.ownerDocument;
  let identification = child(root, 'identification');
  if (!identification) {
    identification = owner.createElement('identification');
    insertHead(root, identification, ['defaults', 'credit']);
  }
  let creator = child(identification, 'creator', (c) => c.getAttribute('type') === 'composer');
  if (!creator) {
    creator = owner.createElement('creator');
    creator.setAttribute('type', 'composer');
    identification.prepend(creator);
  }
  creator.textContent = text;
  setCreditWords(root, 'composer', text);
};

/** Đặt (hoặc xóa khi value = null) một trường <miscellaneous-field> của ứng dụng. */
const writeMisc = (root: Element, name: string, value: string | null): void => {
  const owner = root.ownerDocument;
  let identification = child(root, 'identification');
  let misc = identification && child(identification, 'miscellaneous');
  const field = miscField(root, name);
  if (value === null) {
    field?.remove();
    if (misc && misc.children.length === 0) misc.remove();
    return;
  }
  if (!identification) {
    identification = owner.createElement('identification');
    insertHead(root, identification, ['defaults', 'credit']);
  }
  if (!misc) {
    misc = owner.createElement('miscellaneous');
    identification.appendChild(misc);
  }
  const target = field ?? owner.createElement('miscellaneous-field');
  target.setAttribute('name', name);
  target.textContent = value;
  if (!field) misc.appendChild(target);
};

/**
 * Cho tiêu đề bản nhạc theo tên bài hát trong ứng dụng, trừ khi người dùng đã tự sửa tiêu đề trong trình sửa.
 * Không ghi lịch sử (là bước chuẩn bị khi mở bản nhạc).
 * @returns true nếu đã đổi nội dung
 */
export function syncTitle(doc: ScoreDocument, name: string): boolean {
  const wanted = name.trim();
  if (!wanted || miscField(doc.root, 'title-custom')) return false;
  if (readHeader(doc).title === wanted) return false;
  writeTitle(doc.root, wanted);
  return true;
}

const sameStyle = (a: TextStyle, b: TextStyle): boolean =>
  a.size === b.size && a.bold === b.bold && a.italic === b.italic;

/** Sửa nội dung và kiểu chữ của tiêu đề hoặc tác giả (một bước hoàn tác được). */
export function setHeaderText(doc: ScoreDocument, field: HeaderField, text: string, style: TextStyle): EditResult {
  const clean = text.trim();
  if (style.size !== null && (!Number.isFinite(style.size) || style.size < SIZE_MIN || style.size > SIZE_MAX)) {
    return { ok: false, reason: 'badValue' };
  }
  const current = readHeader(doc);
  const normalized: TextStyle = { size: style.size, bold: style.bold, italic: style.italic };
  if (current[field] === clean && sameStyle(current.styles[field], normalized))
    return { ok: false, reason: 'unchanged' };

  const before = doc.headSnapshot();
  if (field === 'title') {
    writeTitle(doc.root, clean);
    writeMisc(doc.root, 'title-custom', '1');
  } else {
    writeComposer(doc.root, clean);
  }
  const encoded = encodeStyle(normalized);
  writeMisc(doc.root, `style-${field}`, encoded || null);
  return {
    ok: true,
    command: {
      label: field === 'title' ? 'Sửa tiêu đề' : 'Sửa tên tác giả',
      snapshots: [],
      changedIds: [],
      head: { before, after: doc.headSnapshot() },
    },
  };
}

interface OsmdLike {
  EngravingRules: unknown;
  Sheet?: { Title?: { fontStyle?: number }; Composer?: { fontStyle?: number } };
}

/** OSMD FontStyles: 0 thường, 1 đậm, 2 nghiêng, 3 đậm nghiêng. */
const fontOf = (s: TextStyle): number => (s.bold ? 1 : 0) + (s.italic ? 2 : 0);

/** Áp cỡ chữ và kiểu chữ của tiêu đề / tác giả lên OSMD (gọi sau mỗi lần nạp, trước khi vẽ). */
export function applyHeaderStyle(osmd: unknown, header: HeaderState): void {
  const target = osmd as OsmdLike;
  const rules = target.EngravingRules as Record<string, number>;
  rules.SheetTitleHeight = (header.styles.title.size ?? DEFAULT_SIZE.title) / 10;
  rules.SheetComposerHeight = (header.styles.composer.size ?? DEFAULT_SIZE.composer) / 10;
  if (target.Sheet?.Title) target.Sheet.Title.fontStyle = fontOf(header.styles.title);
  if (target.Sheet?.Composer) target.Sheet.Composer.fontStyle = fontOf(header.styles.composer);
}
