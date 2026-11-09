/**
 * Dấu nối (tie) và dấu luyến (slur). Dấu nối: hai nốt liền nhau cùng cao độ trong cùng bè, ghi `<tie>` (phát âm)
 * và `<notations><tied>` (hiển thị). Dấu luyến: từ nốt đầu đến nốt cuối của vùng chọn, ghi `<notations><slur>`.
 * Bấm lại trên cùng vùng chọn thì gỡ bỏ.
 */
import { childOf, commitEdit, hasTie, readPitch, slursOf, touch } from './commands';
import type { EditResult, Touched } from './commands';
import { pitchToMidi } from './pitch';
import type { NoteInfo, ScoreDocument } from './ScoreDocument';

/** Thẻ <notations> của nốt, tạo mới (đúng chỗ: trước <lyric>/<play>) nếu chưa có. */
export const notationsOf = (note: Element): Element => {
  const existing = childOf(note, 'notations');
  if (existing) return existing;
  const el = note.ownerDocument.createElement('notations');
  const after = Array.from(note.children).find((c) => c.tagName === 'lyric' || c.tagName === 'play');
  if (after) after.before(el);
  else note.appendChild(el);
  return el;
};

/** Xóa thẻ con của <notations> thỏa điều kiện; bỏ luôn <notations> nếu trống. */
export const removeNotation = (note: Element, tag: string, match: (el: Element) => boolean): void => {
  const notations = childOf(note, 'notations');
  if (!notations) return;
  Array.from(notations.children)
    .filter((c) => c.tagName === tag && match(c))
    .forEach((c) => c.remove());
  if (notations.children.length === 0) notations.remove();
};

/** Thêm `<tie type>` đúng chỗ (sau <duration>, trước <voice>) và `<tied type>` trong <notations>. */
const addTie = (note: Element, type: 'start' | 'stop'): void => {
  const owner = note.ownerDocument;
  const tie = owner.createElement('tie');
  tie.setAttribute('type', type);
  const anchor = Array.from(note.children)
    .filter((c) => c.tagName === 'duration' || c.tagName === 'tie')
    .pop();
  if (anchor) anchor.after(tie);
  else note.appendChild(tie);
  const tied = owner.createElement('tied');
  tied.setAttribute('type', type);
  notationsOf(note).appendChild(tied);
};

const removeTie = (note: Element, type: 'start' | 'stop'): void => {
  Array.from(note.children)
    .filter((c) => c.tagName === 'tie' && c.getAttribute('type') === type)
    .forEach((c) => c.remove());
  removeNotation(note, 'tied', (el) => el.getAttribute('type') === type);
};

const midiOf = (n: NoteInfo): number | null => {
  const p = readPitch(n.element);
  return p ? pitchToMidi(p) : null;
};

/** Mục (đầu hợp âm) liền sau của `info` trong cùng bè, kể cả ở ô nhịp kế tiếp; undefined nếu không có. */
const nextEntryMembers = (doc: ScoreDocument, info: NoteInfo): NoteInfo[] => {
  const heads = doc.notes.filter(
    (n) =>
      n.partIndex === info.partIndex &&
      n.staff === info.staff &&
      n.voice === info.voice &&
      !n.isGrace &&
      n.chordIndex === 0,
  );
  const at = heads.findIndex((h) => h.measureIndex === info.measureIndex && h.entryIndex === info.entryIndex);
  const next = at >= 0 ? heads[at + 1] : undefined;
  if (!next) return [];
  return doc.notes.filter(
    (n) =>
      n.partIndex === next.partIndex &&
      n.measureIndex === next.measureIndex &&
      n.staff === next.staff &&
      n.voice === next.voice &&
      n.entryIndex === next.entryIndex,
  );
};

/**
 * Nối / bỏ nối các nốt đã chọn với nốt cùng cao độ liền sau. Chọn nhiều nốt thì chỉ nối những cặp liền nhau nằm
 * trong vùng chọn; chọn một nốt thì nối với nốt liền sau nó. Đã nối hết thì gỡ nối.
 */
export function toggleTie(doc: ScoreDocument, ids: readonly string[]): EditResult {
  const selected = ids
    .map((id) => doc.getInfo(id))
    .filter((n): n is NoteInfo => n !== undefined && !n.isRest && !n.isGrace && readPitch(n.element) !== null);
  if (selected.length === 0) return { ok: false, reason: 'empty' };
  const chosen = new Set(selected);

  const pairsFor = (restrictToSelection: boolean) => {
    const pairs: [NoteInfo, NoteInfo][] = [];
    for (const a of selected) {
      const midi = midiOf(a);
      const b = nextEntryMembers(doc, a).find((n) => !n.isRest && midiOf(n) === midi);
      if (!b || (restrictToSelection && !chosen.has(b))) continue;
      pairs.push([a, b]);
    }
    return pairs;
  };
  let pairs = selected.length > 1 ? pairsFor(true) : [];
  if (pairs.length === 0) pairs = pairsFor(false);
  if (pairs.length === 0) return { ok: false, reason: 'tieTarget' };

  const tiedAlready = pairs.every(([a, b]) => hasTie(a.element, 'start') && hasTie(b.element, 'stop'));
  const touched: Touched = new Map();
  pairs.forEach(([a, b]) => {
    touch(touched, a);
    touch(touched, b);
  });
  const command = commitEdit(
    doc,
    tiedAlready ? 'Bỏ dấu nối' : 'Thêm dấu nối',
    touched,
    [...chosen].map((n) => n.id),
    () => {
      for (const [a, b] of pairs) {
        if (tiedAlready) {
          removeTie(a.element, 'start');
          removeTie(b.element, 'stop');
        } else {
          if (!hasTie(a.element, 'start')) addTie(a.element, 'start');
          if (!hasTie(b.element, 'stop')) addTie(b.element, 'stop');
        }
      }
    },
  );
  return { ok: true, command };
}

/**
 * Luyến / bỏ luyến từ nốt đầu đến nốt cuối của vùng chọn (cùng part và khuông; dấu lặng bị bỏ qua). Nếu đã có đúng
 * dấu luyến đó thì gỡ ra.
 */
export function toggleSlur(doc: ScoreDocument, ids: readonly string[]): EditResult {
  const selected = ids
    .map((id) => doc.getInfo(id))
    .filter((n): n is NoteInfo => n !== undefined && !n.isRest && !n.isGrace);
  if (selected.length < 2) return { ok: false, reason: 'slurTarget' };
  const order = new Map(doc.notes.map((n, i) => [n, i]));
  selected.sort((x, y) => (order.get(x) ?? 0) - (order.get(y) ?? 0));
  const first = selected[0];
  const last = selected[selected.length - 1];
  if (first.partIndex !== last.partIndex || first.staff !== last.staff) return { ok: false, reason: 'slurTarget' };
  if (first.measureIndex === last.measureIndex && first.entryIndex === last.entryIndex) {
    return { ok: false, reason: 'slurTarget' };
  }
  // Đầu hợp âm của mục đầu và mục cuối
  const headOfEntry = (n: NoteInfo) =>
    doc.notes.find(
      (m) =>
        m.chordIndex === 0 &&
        m.partIndex === n.partIndex &&
        m.measureIndex === n.measureIndex &&
        m.staff === n.staff &&
        m.voice === n.voice &&
        m.entryIndex === n.entryIndex,
    ) ?? n;
  const start = headOfEntry(first);
  const stop = headOfEntry(last);

  const numberOf = (el: Element) => el.getAttribute('number') ?? '1';
  const existing = slursOf(start.element).find(
    (s) =>
      s.getAttribute('type') === 'start' &&
      slursOf(stop.element).some((e) => e.getAttribute('type') === 'stop' && numberOf(e) === numberOf(s)),
  );

  const touched: Touched = new Map();
  touch(touched, start);
  touch(touched, stop);
  const label = existing ? 'Bỏ dấu luyến' : 'Thêm dấu luyến';

  // Số hiệu dấu luyến chưa dùng trong đoạn (để các dấu luyến chồng nhau không lẫn)
  const used = new Set<string>();
  const from = order.get(start) ?? 0;
  const to = order.get(stop) ?? 0;
  doc.notes.slice(from, to + 1).forEach((n) => {
    if (n.partIndex === start.partIndex) slursOf(n.element).forEach((s) => used.add(numberOf(s)));
  });
  let number = 1;
  while (used.has(String(number))) number += 1;

  const command = commitEdit(
    doc,
    label,
    touched,
    selected.map((n) => n.id),
    () => {
      if (existing) {
        const n = numberOf(existing);
        removeNotation(start.element, 'slur', (s) => s.getAttribute('type') === 'start' && numberOf(s) === n);
        removeNotation(stop.element, 'slur', (s) => s.getAttribute('type') === 'stop' && numberOf(s) === n);
        return;
      }
      for (const [note, type] of [
        [start.element, 'start'],
        [stop.element, 'stop'],
      ] as const) {
        const slur = note.ownerDocument.createElement('slur');
        slur.setAttribute('type', type);
        slur.setAttribute('number', String(number));
        notationsOf(note).appendChild(slur);
      }
    },
  );
  return { ok: true, command };
}
