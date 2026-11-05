/**
 * Khuông nhạc và các thiết lập đầu khuông: thêm/xóa khuông (khuông Fa cho đàn, phần nhạc riêng cho SATB...), đổi khóa
 * (Sol/Fa/Đô), dấu hóa theo khóa nhạc, và chỉ số nhịp (đổi nhịp giữa bài, nhịp tự do).
 */
import { childOf, commitEdit } from './commands';
import type { EditResult, Touched } from './commands';
import { runStructural } from './structure';
import type { NoteInfo, ScoreDocument } from './ScoreDocument';
import { measureEnd } from './voices';

export type ClefSign = 'G' | 'F' | 'C';
export const CLEFS: Record<ClefSign, { sign: string; line: number; label: string }> = {
  G: { sign: 'G', line: 2, label: 'Khóa Sol' },
  F: { sign: 'F', line: 4, label: 'Khóa Fa' },
  C: { sign: 'C', line: 3, label: 'Khóa Đô' },
};

/** Phạm vi áp dụng: chỉ các ô đã chọn (sau đó trở lại như cũ) hoặc từ ô đầu đã chọn đến hết bài. */
export type Scope = 'selected' | 'toEnd';

/** Thay đổi đầu khuông người dùng yêu cầu. */
export type NotationChange =
  | { kind: 'clef'; sign: ClefSign; scope: Scope }
  | { kind: 'key'; fifths: number; scope: Scope }
  | { kind: 'time'; beats: number; beatType: number; free: boolean; scope: Scope };

const el = (owner: Document, tag: string, text?: string): Element => {
  const e = owner.createElement(tag);
  if (text !== undefined) e.textContent = text;
  return e;
};

/** Thứ tự các phần tử con của <attributes> theo MusicXML. */
const ATTR_ORDER = [
  'footnote',
  'level',
  'divisions',
  'key',
  'time',
  'staves',
  'part-symbol',
  'instruments',
  'clef',
  'staff-details',
  'transpose',
  'directive',
  'measure-style',
];

const clefNumber = (clef: Element): number => Number(clef.getAttribute('number') ?? 1);

/** <attributes> của ô (tạo mới đứng trước nốt đầu tiên nếu chưa có và `create`). */
const attributesOf = (measure: Element, create: boolean): Element | null => {
  const existing = Array.from(measure.children).find((c) => c.tagName === 'attributes');
  if (existing || !create) return existing ?? null;
  const fresh = el(measure.ownerDocument, 'attributes');
  const firstNote = Array.from(measure.children).find((c) => c.tagName === 'note');
  if (firstNote) measure.insertBefore(fresh, firstNote);
  else measure.appendChild(fresh);
  return fresh;
};

const insertInAttributes = (attributes: Element, item: Element): void => {
  const order = ATTR_ORDER.indexOf(item.tagName);
  const next = Array.from(attributes.children).find((c) => {
    const o = ATTR_ORDER.indexOf(c.tagName);
    if (o > order) return true;
    return o === order && item.tagName === 'clef' && clefNumber(c) > clefNumber(item);
  });
  attributes.insertBefore(item, next ?? null);
};

type Slot = { tag: 'key' | 'time' | 'clef'; staff?: number };

const matches = (child: Element, slot: Slot): boolean =>
  child.tagName === slot.tag && (slot.tag !== 'clef' || clefNumber(child) === (slot.staff ?? 1));

/** Phần tử đầu khuông (khóa/dấu hóa/nhịp) đang có hiệu lực tại ô `upTo` của một part (bản sao), nếu có. */
const effective = (doc: ScoreDocument, partIndex: number, upTo: number, slot: Slot): Element | null => {
  let found: Element | null = null;
  doc.getMeasures(partIndex).forEach((measure, i) => {
    if (i > upTo) return;
    for (const attributes of Array.from(measure.children).filter((c) => c.tagName === 'attributes')) {
      for (const child of Array.from(attributes.children)) if (matches(child, slot)) found = child;
    }
  });
  return found ? ((found as Element).cloneNode(true) as Element) : null;
};

const sameXml = (a: Element | null, b: Element | null): boolean =>
  !!a && !!b && new XMLSerializer().serializeToString(a) === new XMLSerializer().serializeToString(b);

/** Ô có tự khai báo phần tử đầu khuông này không (không tính kế thừa). */
const hasOwn = (measure: Element, slot: Slot): boolean =>
  Array.from(measure.children)
    .filter((c) => c.tagName === 'attributes')
    .some((a) => Array.from(a.children).some((c) => matches(c, slot)));

const removeOwn = (measure: Element, slot: Slot): void => {
  for (const attributes of Array.from(measure.children).filter((c) => c.tagName === 'attributes')) {
    Array.from(attributes.children)
      .filter((c) => matches(c, slot))
      .forEach((c) => c.remove());
    if (attributes.children.length === 0) attributes.remove();
  }
};

/**
 * Đặt phần tử đầu khuông `make()` cho các ô `from..to` của một part: bỏ khai báo riêng trong khoảng, khai báo tại ô
 * `from`, và (nếu `restore`) khai báo lại giá trị cũ ở ô ngay sau khoảng nếu ô đó chưa có khai báo riêng.
 */
const applyRange = (
  doc: ScoreDocument,
  partIndex: number,
  from: number,
  to: number,
  slot: Slot,
  make: () => Element,
  restore: boolean,
): void => {
  const measures = doc.getMeasures(partIndex);
  const old = restore ? effective(doc, partIndex, to, slot) : null;
  for (let i = from; i <= to && i < measures.length; i++) removeOwn(measures[i], slot);
  const attributes = attributesOf(measures[from], true) as Element;
  insertInAttributes(attributes, make());
  const after = measures[to + 1];
  if (restore && after && old && !hasOwn(after, slot) && !sameXml(old, make())) {
    insertInAttributes(attributesOf(after, true) as Element, old);
  }
};

const touchRange = (doc: ScoreDocument, parts: number[], from: number, to: number): Touched => {
  const touched: Touched = new Map();
  for (const partIndex of parts) {
    for (let m = from; m <= Math.min(to + 1, doc.measureCount - 1); m++) {
      touched.set(`${partIndex}|${m}`, { partIndex, measureIndex: m });
    }
  }
  return touched;
};

/** Thay đổi đầu khuông (khóa / dấu hóa / nhịp) cho các ô `from..last` (hoặc đến hết bài). */
export function changeNotation(
  doc: ScoreDocument,
  target: { partIndex: number; staff: number; from: number; to: number },
  change: NotationChange,
): EditResult {
  const from = Math.max(0, Math.min(target.from, doc.measureCount - 1));
  const to =
    change.scope === 'toEnd' ? doc.measureCount - 1 : Math.min(Math.max(target.to, from), doc.measureCount - 1);
  const restore = change.scope === 'selected';
  const all = Array.from({ length: doc.partCount }, (_, i) => i);
  const parts = change.kind === 'clef' ? [target.partIndex] : all;
  if (
    change.kind === 'time' &&
    !change.free &&
    !(change.beats > 0 && change.beats <= 32 && [1, 2, 4, 8, 16, 32].includes(change.beatType))
  ) {
    return { ok: false, reason: 'badValue' };
  }
  if (change.kind === 'key' && !(Number.isInteger(change.fifths) && Math.abs(change.fifths) <= 7)) {
    return { ok: false, reason: 'badValue' };
  }
  const range =
    from === to ? `ô ${from + 1}` : to === doc.measureCount - 1 ? `từ ô ${from + 1}` : `ô ${from + 1}–${to + 1}`;
  const label =
    change.kind === 'clef'
      ? `${CLEFS[change.sign].label} (${range})`
      : change.kind === 'key'
        ? `Đổi dấu hóa đầu khuông (${range})`
        : change.free
          ? `Nhịp tự do (${range})`
          : `Đổi nhịp ${change.beats}/${change.beatType} (${range})`;

  const command = commitEdit(doc, label, touchRange(doc, parts, from, to), [], () => {
    for (const partIndex of parts) {
      const owner = doc.getMeasures(partIndex)[0].ownerDocument;
      if (change.kind === 'clef') {
        const multi = doc.staffCountOfPart(partIndex) > 1;
        const spec = CLEFS[change.sign];
        const make = () => {
          const clef = el(owner, 'clef');
          if (multi) clef.setAttribute('number', String(target.staff));
          clef.appendChild(el(owner, 'sign', spec.sign));
          clef.appendChild(el(owner, 'line', String(spec.line)));
          return clef;
        };
        applyRange(doc, partIndex, from, to, { tag: 'clef', staff: multi ? target.staff : 1 }, make, restore);
      } else if (change.kind === 'key') {
        const make = () => {
          const key = el(owner, 'key');
          key.appendChild(el(owner, 'fifths', String(change.fifths)));
          return key;
        };
        applyRange(doc, partIndex, from, to, { tag: 'key' }, make, restore);
      } else {
        const make = () => {
          const time = el(owner, 'time');
          if (change.free) time.appendChild(el(owner, 'senza-misura'));
          else {
            time.appendChild(el(owner, 'beats', String(change.beats)));
            time.appendChild(el(owner, 'beat-type', String(change.beatType)));
          }
          return time;
        };
        applyRange(doc, partIndex, from, to, { tag: 'time' }, make, restore);
      }
    }
  });
  return { ok: true, command };
}

/** Thông tin đầu khuông tại vùng chọn, để hiện trong hộp thoại. */
export interface NotationInfo {
  partIndex: number;
  staff: number;
  from: number;
  to: number;
  clef: ClefSign | null;
  fifths: number;
  beats: number;
  beatType: number;
  free: boolean;
}

export function readNotation(doc: ScoreDocument, ids: readonly string[]): NotationInfo | null {
  const infos = ids.map((id) => doc.getInfo(id)).filter((n): n is NoteInfo => n !== undefined);
  if (infos.length === 0) return null;
  const first = infos[0];
  const indexes = infos.map((n) => n.measureIndex);
  const from = Math.min(...indexes);
  const clefEl = effective(doc, first.partIndex, from, {
    tag: 'clef',
    staff: doc.staffCountOfPart(first.partIndex) > 1 ? first.staff : 1,
  });
  const sign = childOf(clefEl ?? el(doc.root.ownerDocument, 'clef'), 'sign')?.textContent?.trim();
  const { beats, beatType, free } = doc.timeAt(from);
  return {
    partIndex: first.partIndex,
    staff: first.staff,
    from,
    to: Math.max(...indexes),
    clef: sign === 'G' || sign === 'F' || sign === 'C' ? sign : null,
    fifths: doc.keyAt(from),
    beats,
    beatType,
    free,
  };
}

// ------------------------------------------------------------------ thêm / xóa khuông

/** Độ dài (divisions) của một ô: cuối nội dung, hoặc theo chỉ số nhịp nếu ô chưa có nốt. */
const measureLength = (doc: ScoreDocument, partIndex: number, measureIndex: number): number => {
  const measure = doc.getMeasure(partIndex, measureIndex) as Element;
  const { cursor } = measureEnd(measure);
  if (cursor > 0) return cursor;
  const { beats, beatType } = doc.timeAt(measureIndex);
  const length = (beats * 4 * doc.divisionsAtPart(partIndex, measureIndex)) / beatType;
  return Number.isInteger(length) && length > 0 ? length : doc.divisionsAtPart(partIndex, measureIndex) * 4;
};

const restNote = (owner: Document, length: number, voice: number, staff: number | null): Element => {
  const note = el(owner, 'note');
  const rest = el(owner, 'rest');
  rest.setAttribute('measure', 'yes');
  note.appendChild(rest);
  note.appendChild(el(owner, 'duration', String(length)));
  note.appendChild(el(owner, 'voice', String(voice)));
  if (staff !== null) note.appendChild(el(owner, 'staff', String(staff)));
  return note;
};

/** Thêm khuông thứ hai (khóa Fa) vào một phần nhạc: đàn hai khuông. */
export function addBassStaff(doc: ScoreDocument, partIndex: number): EditResult {
  if (partIndex < 0 || partIndex >= doc.partCount) return { ok: false, reason: 'noStaff' };
  if (doc.staffCountOfPart(partIndex) >= 2) return { ok: false, reason: 'hasBass' };
  const measures = doc.getMeasures(partIndex);
  const lengths = measures.map((_, m) => measureLength(doc, partIndex, m));
  const voice = Math.max(5, ...doc.notes.filter((n) => n.partIndex === partIndex).map((n) => n.voice + 1));
  const result = runStructural(doc, 'Thêm khuông Fa (đàn hai khuông)', () => {
    const owner = measures[0].ownerDocument;
    const first = attributesOf(measures[0], true) as Element;
    measures.forEach((m) =>
      m.querySelectorAll('clef').forEach((c) => {
        if (!c.hasAttribute('number')) c.setAttribute('number', '1');
      }),
    );
    insertInAttributes(first, el(owner, 'staves', '2'));
    const clef = el(owner, 'clef');
    clef.setAttribute('number', '2');
    clef.appendChild(el(owner, 'sign', 'F'));
    clef.appendChild(el(owner, 'line', '4'));
    insertInAttributes(first, clef);
    measures.forEach((measure, m) => {
      const { anchor } = measureEnd(measure);
      const backup = el(owner, 'backup');
      backup.appendChild(el(owner, 'duration', String(lengths[m])));
      measure.insertBefore(backup, anchor);
      measure.insertBefore(restNote(owner, lengths[m], voice, 2), anchor);
    });
    return 0;
  });
  if (result.ok) {
    result.command.selectAfter = doc.notes
      .filter((n) => n.partIndex === partIndex && n.staff === 2 && n.measureIndex === 0)
      .map((n) => n.id);
  }
  return result;
}

/** Thêm một phần nhạc mới một khuông (ví dụ khuông hát cho SATB) với khóa Sol hoặc Fa, toàn dấu lặng. */
export function addPart(doc: ScoreDocument, sign: 'G' | 'F'): EditResult {
  const source = doc.getMeasures(0);
  const lengths = source.map((_, m) => measureLength(doc, 0, m));
  const result = runStructural(doc, `Thêm khuông ${sign === 'G' ? 'Sol' : 'Fa'}`, () => {
    const owner = source[0].ownerDocument;
    const root = doc.root;
    const list = Array.from(root.children).find((c) => c.tagName === 'part-list') as Element;
    const ids = new Set(Array.from(root.querySelectorAll('score-part')).map((p) => p.getAttribute('id')));
    let n = ids.size + 1;
    while (ids.has(`P${n}`)) n += 1;
    const id = `P${n}`;
    const scorePart = el(owner, 'score-part');
    scorePart.setAttribute('id', id);
    scorePart.appendChild(el(owner, 'part-name', `Khuông ${doc.partCount + 1}`));
    list.appendChild(scorePart);

    const part = el(owner, 'part');
    part.setAttribute('id', id);
    source.forEach((m, i) => {
      const measure = el(owner, 'measure');
      measure.setAttribute('number', m.getAttribute('number') ?? String(i + 1));
      if (m.getAttribute('implicit')) measure.setAttribute('implicit', m.getAttribute('implicit') as string);
      for (const attributes of Array.from(m.children).filter((c) => c.tagName === 'attributes')) {
        const copy = attributes.cloneNode(true) as Element;
        Array.from(copy.children)
          .filter((c) =>
            ['staves', 'clef', 'staff-details', 'part-symbol', 'instruments', 'transpose'].includes(c.tagName),
          )
          .forEach((c) => c.remove());
        if (i === 0 && measure.querySelector('attributes') === null) {
          const clef = el(owner, 'clef');
          clef.appendChild(el(owner, 'sign', CLEFS[sign].sign));
          clef.appendChild(el(owner, 'line', String(CLEFS[sign].line)));
          insertInAttributes(copy, clef);
        }
        if (copy.children.length > 0) measure.appendChild(copy);
      }
      measure.appendChild(restNote(owner, lengths[i], 1, null));
      Array.from(m.children)
        .filter((c) => c.tagName === 'barline')
        .forEach((b) => measure.appendChild(b.cloneNode(true)));
      part.appendChild(measure);
    });
    root.appendChild(part);
    return 0;
  });
  if (result.ok) {
    const last = doc.partCount - 1;
    result.command.selectAfter = doc.notes.filter((x) => x.partIndex === last && x.measureIndex === 0).map((x) => x.id);
  }
  return result;
}

/**
 * Xóa khuông của nốt đang chọn: khuông thứ hai của đàn thì bỏ khuông đó; khuông của một phần nhạc riêng thì xóa phần
 * nhạc. Bản nhạc phải còn ít nhất một khuông.
 */
export function removeStaff(doc: ScoreDocument, partIndex: number, staff: number): EditResult {
  if (partIndex < 0 || partIndex >= doc.partCount) return { ok: false, reason: 'noStaff' };
  const staves = doc.staffCountOfPart(partIndex);
  if (staves >= 2 && staff === staves) {
    const measures = doc.getMeasures(partIndex);
    return runStructural(doc, 'Xóa khuông Fa của đàn', () => {
      for (const measure of measures) {
        for (const child of Array.from(measure.children)) {
          const inStaff = Number(childOf(child, 'staff')?.textContent) === staff;
          if (child.tagName === 'note' && inStaff) {
            const prev = child.previousElementSibling;
            if (prev?.tagName === 'backup') prev.remove();
            child.remove();
          } else if ((child.tagName === 'direction' || child.tagName === 'harmony') && inStaff) child.remove();
          else if (child.tagName === 'attributes') {
            Array.from(child.children)
              .filter((c) => (c.tagName === 'clef' && clefNumber(c) === staff) || c.tagName === 'staves')
              .forEach((c) => c.remove());
            if (child.children.length === 0) child.remove();
          }
        }
      }
      return 0;
    });
  }
  if (doc.partCount < 2) return { ok: false, reason: 'lastStaff' };
  return runStructural(doc, 'Xóa khuông', () => {
    const part = Array.from(doc.root.children).filter((c) => c.tagName === 'part')[partIndex];
    const id = part.getAttribute('id');
    part.remove();
    Array.from(doc.root.querySelectorAll('score-part'))
      .filter((p) => p.getAttribute('id') === id)
      .forEach((p) => p.remove());
    return 0;
  });
}
