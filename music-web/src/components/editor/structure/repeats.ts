/**
 * Dấu lặp, nhà 1/nhà 2 (volta) và chỉ dẫn nhảy (Segno, Coda, D.C., D.S., Fine, To Coda). Lặp và nhà ghi vào
 * <barline> của ô nhịp ở mọi part; chỉ dẫn nhảy là <direction> ở part đầu tiên.
 */
import { commitEdit } from './commands';
import type { EditResult, Touched } from './commands';
import type { ScoreDocument } from './ScoreDocument';

const child = (parent: Element, tag: string, pred?: (el: Element) => boolean): Element | undefined =>
  Array.from(parent.children).find((c) => c.tagName === tag && (!pred || pred(c)));

const make = (owner: Document, tag: string, attrs: Record<string, string> = {}, text?: string): Element => {
  const el = owner.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  if (text !== undefined) el.textContent = text;
  return el;
};

/** Thứ tự phần tử con của <barline> theo MusicXML. */
const BARLINE_ORDER = ['bar-style', 'footnote', 'level', 'wavy-line', 'segno', 'coda', 'fermata', 'ending', 'repeat'];

const barlineAt = (measure: Element, location: 'left' | 'right'): Element | undefined =>
  child(measure, 'barline', (b) => (b.getAttribute('location') ?? 'right') === location);

/** Thẻ <barline> ở `location` của ô nhịp, tạo mới nếu chưa có (trái: đầu ô; phải: cuối ô). */
const ensureBarline = (measure: Element, location: 'left' | 'right'): Element => {
  const existing = barlineAt(measure, location);
  if (existing) return existing;
  const el = make(measure.ownerDocument, 'barline', { location });
  if (location === 'left') measure.prepend(el);
  else measure.appendChild(el);
  return el;
};

/** Thêm `el` vào <barline> đúng thứ tự phần tử con. */
const addToBarline = (barline: Element, el: Element): void => {
  const rank = BARLINE_ORDER.indexOf(el.tagName);
  const after = Array.from(barline.children).find((c) => BARLINE_ORDER.indexOf(c.tagName) > rank);
  barline.insertBefore(el, after ?? null);
};

/** Bỏ <barline> nếu không còn nội dung có nghĩa ngoài kiểu vạch. */
const tidyBarline = (barline: Element): void => {
  const meaningful = Array.from(barline.children).some((c) => c.tagName !== 'bar-style');
  if (!meaningful) barline.remove();
};

const setBarStyle = (barline: Element, style: string): void => {
  let el = child(barline, 'bar-style');
  if (!el) {
    el = make(barline.ownerDocument, 'bar-style');
    addToBarline(barline, el);
  }
  el.textContent = style;
};

const allParts = (doc: ScoreDocument, measureIndex: number) => {
  const touched: Touched = new Map();
  const measures: Element[] = [];
  for (let p = 0; p < doc.partCount; p++) {
    const m = doc.getMeasure(p, measureIndex);
    if (!m) continue;
    measures.push(m);
    touched.set(`${p}|${measureIndex}`, { partIndex: p, measureIndex });
  }
  return { touched, measures };
};

/** Bật/tắt dấu lặp ở đầu (`start`, |:) hoặc cuối (`end`, :|) ô nhịp. */
export function toggleRepeat(doc: ScoreDocument, measureIndex: number, side: 'start' | 'end'): EditResult {
  const { touched, measures } = allParts(doc, measureIndex);
  if (measures.length === 0) return { ok: false, reason: 'noMeasure' };
  const location = side === 'start' ? 'left' : 'right';
  const direction = side === 'start' ? 'forward' : 'backward';
  const present = measures.every((m) => {
    const b = barlineAt(m, location);
    return b && child(b, 'repeat', (r) => r.getAttribute('direction') === direction);
  });
  const command = commitEdit(doc, side === 'start' ? 'Dấu lặp đầu ô' : 'Dấu lặp cuối ô', touched, [], () => {
    for (const m of measures) {
      if (present) {
        const b = barlineAt(m, location);
        if (!b) continue;
        child(b, 'repeat')?.remove();
        child(b, 'bar-style')?.remove();
        tidyBarline(b);
      } else {
        const b = ensureBarline(m, location);
        child(b, 'repeat')?.remove();
        setBarStyle(b, side === 'start' ? 'heavy-light' : 'light-heavy');
        addToBarline(b, make(m.ownerDocument, 'repeat', { direction }));
      }
    }
  });
  return { ok: true, command };
}

/**
 * Bật/tắt nhà `number` ("1", "2"...) trải từ ô `from` đến ô `to`. Nhà đầu thường đóng bằng dấu lặp cuối ô
 * (`closeWithRepeat`), nhà cuối để hở.
 */
export function toggleEnding(
  doc: ScoreDocument,
  from: number,
  to: number,
  number: string,
  closeWithRepeat: boolean,
): EditResult {
  const first = allParts(doc, from);
  const last = allParts(doc, to);
  if (first.measures.length === 0 || last.measures.length === 0) return { ok: false, reason: 'noMeasure' };
  const touched: Touched = new Map([...first.touched, ...last.touched]);
  const isStart = (e: Element) => e.getAttribute('number') === number && e.getAttribute('type') === 'start';
  const isEnd = (e: Element) => e.getAttribute('number') === number && e.getAttribute('type') !== 'start';
  const present = first.measures.every((m) => {
    const b = barlineAt(m, 'left');
    return b && child(b, 'ending', isStart);
  });
  const command = commitEdit(doc, `Nhà ${number}`, touched, [], () => {
    if (present) {
      for (const m of first.measures) {
        const b = barlineAt(m, 'left');
        if (!b) continue;
        Array.from(b.children)
          .filter((c) => c.tagName === 'ending' && isStart(c))
          .forEach((c) => c.remove());
        tidyBarline(b);
      }
      for (const m of last.measures) {
        const b = barlineAt(m, 'right');
        if (!b) continue;
        Array.from(b.children)
          .filter((c) => c.tagName === 'ending' && isEnd(c))
          .forEach((c) => c.remove());
        tidyBarline(b);
      }
      return;
    }
    for (const m of first.measures) {
      addToBarline(ensureBarline(m, 'left'), make(m.ownerDocument, 'ending', { number, type: 'start' }));
    }
    for (const m of last.measures) {
      const b = ensureBarline(m, 'right');
      addToBarline(b, make(m.ownerDocument, 'ending', { number, type: closeWithRepeat ? 'stop' : 'discontinue' }));
      if (closeWithRepeat && !child(b, 'repeat')) {
        setBarStyle(b, 'light-heavy');
        addToBarline(b, make(m.ownerDocument, 'repeat', { direction: 'backward' }));
      }
    }
  });
  return { ok: true, command };
}

export type NavKind = 'segno' | 'coda' | 'dc' | 'ds' | 'fine' | 'tocoda';

interface NavSpec {
  /** Đặt ở đầu hay cuối ô nhịp. */
  at: 'start' | 'end';
  label: string;
  /** Dựng nội dung <direction-type> và thuộc tính <sound>. */
  build: (owner: Document) => { type: Element; sound: Record<string, string> };
  match: (direction: Element) => boolean;
}

const wordsSpec = (label: string, sound: Record<string, string>, at: 'start' | 'end'): NavSpec => ({
  at,
  label,
  build: (owner) => ({ type: make(owner, 'words', {}, label), sound }),
  match: (d) => Array.from(d.getElementsByTagName('words')).some((w) => w.textContent?.trim() === label),
});

const NAV: Record<NavKind, NavSpec> = {
  segno: {
    at: 'start',
    label: 'Segno',
    build: (o) => ({ type: make(o, 'segno'), sound: { segno: 'segno' } }),
    match: (d) => d.getElementsByTagName('segno').length > 0,
  },
  coda: {
    at: 'start',
    label: 'Coda',
    build: (o) => ({ type: make(o, 'coda'), sound: { coda: 'coda' } }),
    match: (d) => d.getElementsByTagName('coda').length > 0,
  },
  dc: wordsSpec('D.C.', { dacapo: 'yes' }, 'end'),
  ds: wordsSpec('D.S.', { dalsegno: 'segno' }, 'end'),
  fine: wordsSpec('Fine', { fine: 'yes' }, 'end'),
  tocoda: wordsSpec('To Coda', { tocoda: 'coda' }, 'end'),
};

export const NAV_LABELS: Record<NavKind, string> = {
  segno: 'Segno',
  coda: 'Coda',
  dc: 'D.C.',
  ds: 'D.S.',
  fine: 'Fine',
  tocoda: 'To Coda',
};

/** Bật/tắt chỉ dẫn nhảy ở ô nhịp (part đầu tiên): Segno/Coda ở đầu ô, D.C./D.S./Fine/To Coda ở cuối ô. */
export function toggleNavigation(doc: ScoreDocument, measureIndex: number, kind: NavKind): EditResult {
  const measure = doc.getMeasure(0, measureIndex);
  if (!measure) return { ok: false, reason: 'noMeasure' };
  const spec = NAV[kind];
  const existing = Array.from(measure.children).filter((c) => c.tagName === 'direction' && spec.match(c));
  const touched: Touched = new Map([[`0|${measureIndex}`, { partIndex: 0, measureIndex }]]);
  const command = commitEdit(doc, `${spec.label}`, touched, [], () => {
    if (existing.length > 0) {
      existing.forEach((d) => d.remove());
      return;
    }
    const owner = measure.ownerDocument;
    const { type, sound } = spec.build(owner);
    const direction = make(owner, 'direction', { placement: 'above' });
    const dt = make(owner, 'direction-type');
    dt.appendChild(type);
    direction.appendChild(dt);
    direction.appendChild(make(owner, 'sound', sound));
    if (spec.at === 'start') {
      const firstNote = Array.from(measure.children).find((c) => c.tagName === 'note');
      if (firstNote) firstNote.before(direction);
      else measure.appendChild(direction);
    } else {
      const rightBar = barlineAt(measure, 'right');
      measure.insertBefore(direction, rightBar ?? null);
    }
  });
  return { ok: true, command };
}

/** Bật/tắt vạch đôi (light-light) ở cuối ô nhịp: dùng ngăn các đoạn. Ô đang có dấu lặp cuối thì không đặt được. */
export function toggleDoubleBar(doc: ScoreDocument, measureIndex: number): EditResult {
  const { touched, measures } = allParts(doc, measureIndex);
  if (measures.length === 0) return { ok: false, reason: 'noMeasure' };
  const hasRepeat = measures.some((m) => {
    const b = barlineAt(m, 'right');
    return !!b && child(b, 'repeat') !== undefined;
  });
  if (hasRepeat) return { ok: false, reason: 'barRepeat' };
  const present = measures.every((m) => {
    const b = barlineAt(m, 'right');
    return !!b && child(b, 'bar-style')?.textContent === 'light-light';
  });
  const command = commitEdit(doc, present ? 'Bỏ vạch đôi' : 'Thêm vạch đôi', touched, [], () => {
    for (const m of measures) {
      if (present) {
        const b = barlineAt(m, 'right');
        if (!b) continue;
        child(b, 'bar-style')?.remove();
        tidyBarline(b);
      } else {
        setBarStyle(ensureBarline(m, 'right'), 'light-light');
      }
    }
  });
  return { ok: true, command };
}

/**
 * Bật/tắt ngắt dòng (`system`) hoặc sang trang (`page`) ngay TRƯỚC ô `measureIndex`: ô này mở đầu dòng/trang mới.
 * Ghi `<print new-system="yes">` / `<print new-page="yes">` ở đầu ô, mọi part. Ô đầu bài thì không cần.
 */
export function toggleBreak(doc: ScoreDocument, measureIndex: number, kind: 'system' | 'page'): EditResult {
  if (measureIndex <= 0) return { ok: false, reason: 'breakFirst' };
  const { touched, measures } = allParts(doc, measureIndex);
  if (measures.length === 0) return { ok: false, reason: 'noMeasure' };
  const attr = kind === 'page' ? 'new-page' : 'new-system';
  const present = measures.every((m) => child(m, 'print')?.getAttribute(attr) === 'yes');
  const label = kind === 'page' ? 'sang trang tại ô' : 'xuống dòng tại ô';
  const command = commitEdit(doc, `${present ? 'Bỏ' : 'Đặt'} ${label} ${measureIndex + 1}`, touched, [], () => {
    for (const m of measures) {
      let print = child(m, 'print');
      if (present) {
        print?.removeAttribute(attr);
        if (print && print.attributes.length === 0 && print.children.length === 0) print.remove();
        continue;
      }
      if (!print) {
        print = make(m.ownerDocument, 'print');
        m.prepend(print);
      }
      print.setAttribute(attr, 'yes');
    }
  });
  return { ok: true, command };
}

/** Đặt số lần chơi của đoạn lặp kết thúc ở ô `measureIndex` (`times` ở dấu lặp cuối; 2 là mặc định nên không ghi). */
export function setRepeatTimes(doc: ScoreDocument, measureIndex: number, times: number): EditResult {
  const { touched, measures } = allParts(doc, measureIndex);
  if (measures.length === 0) return { ok: false, reason: 'noMeasure' };
  const repeats = measures.map((m) => {
    const b = barlineAt(m, 'right');
    return b && child(b, 'repeat', (r) => r.getAttribute('direction') === 'backward');
  });
  if (repeats.some((r) => !r)) return { ok: false, reason: 'noRepeat' };
  const ends = repeats.filter((r): r is Element => r !== undefined);
  if (ends.every((r) => (r.getAttribute('times') ?? '2') === String(times))) return { ok: false, reason: 'unchanged' };
  const command = commitEdit(doc, `Lặp ${times} lần`, touched, [], () => {
    for (const r of ends) {
      if (times <= 2) r.removeAttribute('times');
      else r.setAttribute('times', String(times));
    }
  });
  return { ok: true, command };
}
