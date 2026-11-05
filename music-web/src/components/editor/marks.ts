/**
 * Ký hiệu sắc thái và biểu cảm áp lên vùng chọn: staccato, accent, tenuto, fermata (trên nốt), mức to nhỏ (pp…ff),
 * cresc./dim. (vạch mở rộng/thu hẹp từ nốt đầu đến nốt cuối vùng chọn); cùng bộ điều phối cho dấu lặp và chỉ dẫn nhảy.
 * Bấm lần nữa trên cùng vùng chọn thì gỡ ký hiệu.
 */
import { childOf, commitEdit, touch } from './commands';
import type { EditResult, Touched } from './commands';
import { NAV_LABELS, toggleEnding, toggleNavigation, toggleRepeat } from './repeats';
import type { NavKind } from './repeats';
import type { NoteInfo, ScoreDocument } from './ScoreDocument';
import { notationsOf, removeNotation } from './ties';

export type Articulation = 'staccato' | 'accent' | 'tenuto' | 'fermata';
export const DYNAMICS = ['pp', 'p', 'mp', 'mf', 'f', 'ff'] as const;
export type Dynamic = (typeof DYNAMICS)[number];

export type MarkOp =
  | Articulation
  | 'cresc'
  | 'dim'
  | `dyn:${Dynamic}`
  | 'repeatStart'
  | 'repeatEnd'
  | 'volta1'
  | 'volta2'
  | NavKind;

export const ARTICULATION_LABELS: Record<Articulation, string> = {
  staccato: 'Staccato',
  accent: 'Accent',
  tenuto: 'Tenuto',
  fermata: 'Fermata',
};

/** Nốt đầu (không phải nốt thêm trong hợp âm) của mỗi mục được chọn, theo thứ tự bản nhạc, bỏ dấu lặng và nốt trang trí. */
const selectedHeads = (doc: ScoreDocument, ids: readonly string[], allowRests = false): NoteInfo[] => {
  const keys = new Set<string>();
  for (const id of ids) {
    const n = doc.getInfo(id);
    if (n) keys.add(`${n.partIndex}|${n.measureIndex}|${n.staff}|${n.voice}|${n.entryIndex}`);
  }
  return doc.notes.filter(
    (n) =>
      n.chordIndex === 0 &&
      !n.isGrace &&
      (allowRests || !n.isRest) &&
      keys.has(`${n.partIndex}|${n.measureIndex}|${n.staff}|${n.voice}|${n.entryIndex}`),
  );
};

const hasArticulation = (note: Element, kind: Articulation): boolean => {
  const notations = childOf(note, 'notations');
  if (!notations) return false;
  if (kind === 'fermata') return childOf(notations, 'fermata') !== undefined;
  const group = childOf(notations, 'articulations');
  return !!group && childOf(group, kind) !== undefined;
};

const addArticulation = (note: Element, kind: Articulation): void => {
  const owner = note.ownerDocument;
  const notations = notationsOf(note);
  if (kind === 'fermata') {
    notations.appendChild(owner.createElement('fermata'));
    return;
  }
  let group = childOf(notations, 'articulations');
  if (!group) {
    group = owner.createElement('articulations');
    notations.appendChild(group);
  }
  group.appendChild(owner.createElement(kind));
};

const removeArticulation = (note: Element, kind: Articulation): void => {
  if (kind === 'fermata') {
    removeNotation(note, 'fermata', () => true);
    return;
  }
  const notations = childOf(note, 'notations');
  const group = notations && childOf(notations, 'articulations');
  if (!group) return;
  Array.from(group.children)
    .filter((c) => c.tagName === kind)
    .forEach((c) => c.remove());
  if (group.children.length === 0) group.remove();
  if (notations.children.length === 0) notations.remove();
};

/** Bật/tắt một dấu thể hiện (staccato, accent, tenuto, fermata) trên các nốt đã chọn. */
export function toggleArticulation(doc: ScoreDocument, ids: readonly string[], kind: Articulation): EditResult {
  const heads = selectedHeads(doc, ids);
  if (heads.length === 0) return { ok: false, reason: 'empty' };
  const all = heads.every((h) => hasArticulation(h.element, kind));
  const touched: Touched = new Map();
  heads.forEach((h) => touch(touched, h));
  const command = commitEdit(
    doc,
    `${all ? 'Bỏ' : 'Thêm'} ${ARTICULATION_LABELS[kind]}`,
    touched,
    heads.map((h) => h.id),
    () => {
      for (const h of heads) {
        removeArticulation(h.element, kind);
        if (!all) addArticulation(h.element, kind);
      }
    },
  );
  return { ok: true, command };
}

/** Các <direction> liền ngay trước `note` thỏa `pred`. */
const directionsBefore = (note: Element, pred: (d: Element) => boolean): Element[] => {
  const out: Element[] = [];
  let prev = note.previousElementSibling;
  while (prev && (prev.tagName === 'direction' || prev.tagName === 'harmony')) {
    if (prev.tagName === 'direction' && pred(prev)) out.push(prev);
    prev = prev.previousElementSibling;
  }
  return out;
};

const makeDirection = (owner: Document, content: Element): Element => {
  const direction = owner.createElement('direction');
  direction.setAttribute('placement', 'below');
  const type = owner.createElement('direction-type');
  type.appendChild(content);
  direction.appendChild(type);
  return direction;
};

const isDynamics = (d: Element): boolean => d.getElementsByTagName('dynamics').length > 0;

/** Đặt (hoặc bỏ nếu đã đúng mức này) ký hiệu to nhỏ ngay trước nốt đầu tiên trong vùng chọn. */
export function setDynamic(doc: ScoreDocument, ids: readonly string[], dynamic: Dynamic): EditResult {
  const heads = selectedHeads(doc, ids, true);
  const target = heads[0];
  if (!target) return { ok: false, reason: 'empty' };
  const existing = directionsBefore(target.element, isDynamics);
  const same = existing.some((d) => d.getElementsByTagName(dynamic).length > 0);
  const touched: Touched = new Map();
  touch(touched, target);
  const command = commitEdit(doc, same ? `Bỏ ${dynamic}` : `Đặt ${dynamic}`, touched, [target.id], () => {
    existing.forEach((d) => d.remove());
    if (same) return;
    const owner = target.element.ownerDocument;
    const dynamics = owner.createElement('dynamics');
    dynamics.appendChild(owner.createElement(dynamic));
    target.element.before(makeDirection(owner, dynamics));
  });
  return { ok: true, command };
}

type Hairpin = 'crescendo' | 'diminuendo';

const wedgesOf = (d: Element): Element[] => Array.from(d.getElementsByTagName('wedge'));

/** Bật/tắt cresc. (crescendo) hoặc dim. (diminuendo) từ nốt đầu đến nốt cuối của vùng chọn. */
export function toggleHairpin(doc: ScoreDocument, ids: readonly string[], kind: Hairpin): EditResult {
  const heads = selectedHeads(doc, ids, true);
  if (heads.length < 2) return { ok: false, reason: 'hairpinTarget' };
  const first = heads[0];
  const last = heads[heads.length - 1];
  if (first.partIndex !== last.partIndex || first.staff !== last.staff) return { ok: false, reason: 'hairpinTarget' };

  const startDirs = directionsBefore(first.element, (d) => wedgesOf(d).some((w) => w.getAttribute('type') === kind));
  const label = kind === 'crescendo' ? 'cresc.' : 'dim.';
  const touched: Touched = new Map();
  touch(touched, first);
  touch(touched, last);

  // Số hiệu <wedge number> chưa dùng trong đoạn
  const used = new Set<string>();
  const part = doc.getMeasures(first.partIndex);
  for (let m = first.measureIndex; m <= last.measureIndex; m++) {
    part[m]?.querySelectorAll('wedge').forEach((w) => used.add(w.getAttribute('number') ?? '1'));
  }
  let number = 1;
  while (used.has(String(number))) number += 1;

  const command = commitEdit(
    doc,
    `${startDirs.length > 0 ? 'Bỏ' : 'Thêm'} ${label}`,
    touched,
    [first.id, last.id],
    () => {
      const owner = first.element.ownerDocument;
      if (startDirs.length > 0) {
        // Gỡ vạch bắt đầu và vạch kết thúc cùng số hiệu
        const num = wedgesOf(startDirs[0])[0]?.getAttribute('number') ?? '1';
        startDirs.forEach((d) => d.remove());
        for (let m = first.measureIndex; m < part.length; m++) {
          const stop = Array.from(part[m].children).find(
            (c) =>
              c.tagName === 'direction' &&
              wedgesOf(c).some((w) => w.getAttribute('type') === 'stop' && (w.getAttribute('number') ?? '1') === num),
          );
          if (stop) {
            stop.remove();
            break;
          }
        }
        return;
      }
      const open = owner.createElement('wedge');
      open.setAttribute('type', kind);
      open.setAttribute('number', String(number));
      first.element.before(makeDirection(owner, open));
      const close = owner.createElement('wedge');
      close.setAttribute('type', 'stop');
      close.setAttribute('number', String(number));
      // Kết thúc ngay sau mục cuối (sau mọi nốt thêm trong hợp âm của mục đó)
      let anchor: Element = last.element;
      while (
        anchor.nextElementSibling?.tagName === 'note' &&
        anchor.nextElementSibling.querySelector(':scope > chord')
      ) {
        anchor = anchor.nextElementSibling;
      }
      anchor.after(makeDirection(owner, close));
    },
  );
  return { ok: true, command };
}

/** Ô nhịp (chỉ số) mà vùng chọn nằm trong: ô đầu và ô cuối; null nếu chưa chọn gì. */
const measureRange = (doc: ScoreDocument, ids: readonly string[]): { from: number; to: number } | null => {
  const indexes = ids.map((id) => doc.getInfo(id)?.measureIndex).filter((m): m is number => m !== undefined);
  return indexes.length === 0 ? null : { from: Math.min(...indexes), to: Math.max(...indexes) };
};

/** Điều phối một thao tác ký hiệu lên vùng chọn. */
export function applyMark(doc: ScoreDocument, ids: readonly string[], op: MarkOp): EditResult {
  if (op === 'staccato' || op === 'accent' || op === 'tenuto' || op === 'fermata')
    return toggleArticulation(doc, ids, op);
  if (op === 'cresc') return toggleHairpin(doc, ids, 'crescendo');
  if (op === 'dim') return toggleHairpin(doc, ids, 'diminuendo');
  if (op.startsWith('dyn:')) return setDynamic(doc, ids, op.slice(4) as Dynamic);
  const range = measureRange(doc, ids);
  if (!range) return { ok: false, reason: 'noMeasure' };
  if (op === 'repeatStart') return toggleRepeat(doc, range.from, 'start');
  if (op === 'repeatEnd') return toggleRepeat(doc, range.to, 'end');
  if (op === 'volta1') return toggleEnding(doc, range.from, range.to, '1', true);
  if (op === 'volta2') return toggleEnding(doc, range.from, range.to, '2', false);
  // Segno/Coda ở ô đầu của vùng chọn; D.C./D.S./Fine/To Coda ở ô cuối
  const kind = op as NavKind;
  return toggleNavigation(doc, kind === 'segno' || kind === 'coda' ? range.from : range.to, kind);
}

export { NAV_LABELS };
