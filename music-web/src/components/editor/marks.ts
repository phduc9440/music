/**
 * Ký hiệu áp lên vùng chọn: dấu thể hiện (staccato, accent, marcato, lấy hơi…), nốt láy (láy rền, láy ngắn, láy vòng),
 * fermata, rải hợp âm, mức to nhỏ (ppp…fff, sf, sfz…), cresc./dim., pedal, 8va/8vb và nốt hoa mỹ; cùng bộ điều phối cho
 * dấu lặp và chỉ dẫn nhảy. Bấm lần nữa trên cùng vùng chọn thì gỡ ký hiệu (trừ nốt hoa mỹ: thêm một nốt mỗi lần bấm).
 */
import { childOf, commitEdit, readPitch, touch } from './commands';
import type { EditResult, Touched } from './commands';
import { inRange, keyAlter, pitchToMidi, STEPS } from './pitch';
import type { Pitch } from './pitch';
import {
  NAV_LABELS,
  setRepeatTimes,
  toggleBreak,
  toggleDoubleBar,
  toggleEnding,
  toggleNavigation,
  toggleRepeat,
} from './repeats';
import type { NavKind } from './repeats';
import { setSectionLabel } from './sections';
import type { NoteInfo, ScoreDocument } from './ScoreDocument';
import { notationsOf, removeNotation } from './ties';

export type Articulation =
  | 'staccato'
  | 'accent'
  | 'tenuto'
  | 'fermata'
  | 'fermataBelow'
  | 'marcato'
  | 'staccatissimo'
  | 'breath'
  | 'caesura';
export type Ornament = 'trill' | 'mordent' | 'invMordent' | 'turn';
/** Ký hiệu ghi trong <notations> của từng nốt. */
export type NotationMark = Articulation | Ornament;

/** Mức to nhỏ có sẵn trên hàng nút nhanh. */
export const DYNAMICS = ['pp', 'p', 'mp', 'mf', 'f', 'ff'] as const;
/** Mức to nhỏ ít dùng, nằm trong menu "Thêm ký hiệu…". */
export const EXTRA_DYNAMICS = ['ppp', 'fff', 'sf', 'sfz', 'fp', 'sfp', 'rfz', 'fz'] as const;
export type Dynamic = (typeof DYNAMICS)[number] | (typeof EXTRA_DYNAMICS)[number];

/** Giá trị `<sound dynamics>` (vận tốc MIDI xấp xỉ) của các mức to nhỏ; sf, sfz, fz… chỉ nhấn một nốt nên không có. */
export const DYNAMIC_VELOCITY: Partial<Record<Dynamic, number>> = {
  ppp: 20,
  pp: 36,
  p: 54,
  mp: 69,
  mf: 83,
  f: 98,
  ff: 112,
  fff: 127,
};

export type MarkOp =
  | NotationMark
  | 'arpeggio'
  | 'arpeggioDown'
  | 'trillSharp'
  | 'trillFlat'
  | 'trillNatural'
  | 'glissando'
  | 'slide'
  | 'graceToggle'
  | 'pedal'
  | 'ottava8va'
  | 'ottava8vb'
  | 'graceSlash'
  | 'gracePlain'
  | 'cresc'
  | 'dim'
  | `dyn:${Dynamic}`
  | 'repeatStart'
  | 'repeatEnd'
  | 'volta1'
  | 'volta2'
  | 'volta3'
  | `repeatTimes:${2 | 3 | 4}`
  | 'sectionRemove'
  | `section:${string}`
  | 'barDouble'
  | 'lineBreak'
  | 'pageBreak'
  | NavKind;

/** Thẻ MusicXML của từng ký hiệu trong <notations>; `group` là thẻ chứa (null = nằm trực tiếp trong <notations>). */
const NOTATION_DEF: Record<
  NotationMark,
  { group: 'articulations' | 'ornaments' | null; tag: string; type?: 'inverted' }
> = {
  staccato: { group: 'articulations', tag: 'staccato' },
  accent: { group: 'articulations', tag: 'accent' },
  tenuto: { group: 'articulations', tag: 'tenuto' },
  marcato: { group: 'articulations', tag: 'strong-accent' },
  staccatissimo: { group: 'articulations', tag: 'staccatissimo' },
  breath: { group: 'articulations', tag: 'breath-mark' },
  caesura: { group: 'articulations', tag: 'caesura' },
  fermata: { group: null, tag: 'fermata' },
  fermataBelow: { group: null, tag: 'fermata', type: 'inverted' },
  trill: { group: 'ornaments', tag: 'trill-mark' },
  mordent: { group: 'ornaments', tag: 'mordent' },
  invMordent: { group: 'ornaments', tag: 'inverted-mordent' },
  turn: { group: 'ornaments', tag: 'turn' },
};

export const ARTICULATION_LABELS: Record<NotationMark | 'arpeggio', string> = {
  staccato: 'Staccato',
  accent: 'Accent',
  tenuto: 'Tenuto',
  fermata: 'Fermata',
  fermataBelow: 'Fermata ngược',
  marcato: 'Marcato',
  staccatissimo: 'Staccatissimo',
  breath: 'Lấy hơi',
  caesura: 'Ngắt nghỉ',
  trill: 'Láy rền',
  mordent: 'Láy ngắn',
  invMordent: 'Láy ngắn ngược',
  turn: 'Láy vòng',
  arpeggio: 'Rải hợp âm',
};

const isNotationMark = (op: string): op is NotationMark => Object.prototype.hasOwnProperty.call(NOTATION_DEF, op);

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

/** Mọi nốt (kể cả nốt thêm trong hợp âm) thuộc cùng mục với `head`. */
const membersOf = (doc: ScoreDocument, head: NoteInfo): NoteInfo[] =>
  doc.notes.filter(
    (n) =>
      n.partIndex === head.partIndex &&
      n.measureIndex === head.measureIndex &&
      n.staff === head.staff &&
      n.voice === head.voice &&
      n.entryIndex === head.entryIndex,
  );

/**
 * Thẻ `el` có đúng là ký hiệu `kind` không. Fermata thường và fermata ngược dùng chung thẻ <fermata>, phân biệt bằng
 * `type="inverted"` (thiếu `type` hoặc `type="upright"` là fermata thường).
 */
const matchesMark = (el: Element, kind: NotationMark): boolean => {
  const { tag, type } = NOTATION_DEF[kind];
  if (el.tagName !== tag) return false;
  if (tag !== 'fermata') return true;
  return (el.getAttribute('type') === 'inverted') === (type === 'inverted');
};

const hasMark = (note: Element, kind: NotationMark): boolean => {
  const { group } = NOTATION_DEF[kind];
  const notations = childOf(note, 'notations');
  const holder = notations && (group ? childOf(notations, group) : notations);
  return !!holder && Array.from(holder.children).some((c) => matchesMark(c, kind));
};

const addMark = (note: Element, kind: NotationMark): void => {
  const owner = note.ownerDocument;
  const { group, tag } = NOTATION_DEF[kind];
  const notations = notationsOf(note);
  let holder = notations;
  if (group) {
    let found = childOf(notations, group);
    if (!found) {
      found = owner.createElement(group);
      notations.appendChild(found);
    }
    holder = found;
  }
  const mark = owner.createElement(tag);
  const { type } = NOTATION_DEF[kind];
  if (type) mark.setAttribute('type', type);
  holder.appendChild(mark);
};

const removeMark = (note: Element, kind: NotationMark): void => {
  const { group, tag } = NOTATION_DEF[kind];
  if (!group) {
    removeNotation(note, tag, (el) => matchesMark(el, kind));
    return;
  }
  const notations = childOf(note, 'notations');
  const holder = notations && childOf(notations, group);
  if (!notations || !holder) return;
  Array.from(holder.children)
    // Bỏ láy rền thì bỏ luôn dấu hóa của nó, tránh để lại dấu hóa không thuộc láy nào
    .filter((c) => c.tagName === tag || (kind === 'trill' && c.tagName === 'accidental-mark'))
    .forEach((c) => c.remove());
  if (holder.children.length === 0) holder.remove();
  if (notations.children.length === 0) notations.remove();
};

/** Bật/tắt một ký hiệu ghi trong <notations> (dấu thể hiện, nốt láy, fermata) trên các nốt đã chọn. */
export function toggleArticulation(doc: ScoreDocument, ids: readonly string[], kind: NotationMark): EditResult {
  const heads = selectedHeads(doc, ids);
  if (heads.length === 0) return { ok: false, reason: 'empty' };
  const all = heads.every((h) => hasMark(h.element, kind));
  const touched: Touched = new Map();
  heads.forEach((h) => touch(touched, h));
  const command = commitEdit(
    doc,
    `${all ? 'Bỏ' : 'Thêm'} ${ARTICULATION_LABELS[kind]}`,
    touched,
    heads.map((h) => h.id),
    () => {
      for (const h of heads) {
        removeMark(h.element, kind);
        if (all) continue;
        // Fermata thường và fermata ngược loại trừ nhau trên cùng một nốt
        if (kind === 'fermata') removeMark(h.element, 'fermataBelow');
        if (kind === 'fermataBelow') removeMark(h.element, 'fermata');
        addMark(h.element, kind);
      }
    },
  );
  return { ok: true, command };
}

/** Dấu hóa của láy rền: giá trị trong <accidental-mark> và nhãn tiếng Việt. */
const TRILL_ACCIDENTAL = {
  trillSharp: { value: 'sharp', label: 'thăng' },
  trillFlat: { value: 'flat', label: 'giáng' },
  trillNatural: { value: 'natural', label: 'bình' },
} as const;
type TrillAccidental = keyof typeof TRILL_ACCIDENTAL;

const trillAccidentalOf = (note: Element): string | null => {
  const notations = childOf(note, 'notations');
  const ornaments = notations && childOf(notations, 'ornaments');
  const mark = ornaments && childOf(ornaments, 'accidental-mark');
  return mark?.textContent?.trim() ?? null;
};

/**
 * Đặt dấu hóa (♯ ♭ ♮) cho nốt láy trên các nốt đã chọn: ghi `<accidental-mark>` ngay sau `<trill-mark>`, nốt chưa có láy
 * rền thì thêm luôn. Mọi nốt đã có đúng dấu hóa này thì bỏ dấu hóa (giữ láy rền); dấu hóa khác thì được thay.
 */
export function setTrillAccidental(doc: ScoreDocument, ids: readonly string[], kind: TrillAccidental): EditResult {
  const heads = selectedHeads(doc, ids);
  if (heads.length === 0) return { ok: false, reason: 'empty' };
  const { value, label } = TRILL_ACCIDENTAL[kind];
  const all = heads.every((h) => hasMark(h.element, 'trill') && trillAccidentalOf(h.element) === value);
  const touched: Touched = new Map();
  heads.forEach((h) => touch(touched, h));
  const command = commitEdit(
    doc,
    `${all ? 'Bỏ' : 'Đặt'} dấu ${label} cho láy rền`,
    touched,
    heads.map((h) => h.id),
    () => {
      for (const h of heads) {
        if (!hasMark(h.element, 'trill')) addMark(h.element, 'trill');
        const notations = notationsOf(h.element);
        const ornaments = childOf(notations, 'ornaments');
        if (!ornaments) continue;
        Array.from(ornaments.children)
          .filter((c) => c.tagName === 'accidental-mark')
          .forEach((c) => c.remove());
        if (all) continue;
        const trill = childOf(ornaments, 'trill-mark');
        const mark = h.element.ownerDocument.createElement('accidental-mark');
        mark.setAttribute('placement', 'above');
        mark.textContent = value;
        ornaments.insertBefore(mark, trill ? trill.nextSibling : null);
      }
    },
  );
  return { ok: true, command };
}

/**
 * Bật/tắt dấu rải (<arpeggiate/>) trên MỌI nốt của các hợp âm đã chọn; mục chỉ có một nốt thì bỏ qua.
 * `direction`: 'up' (mặc định, từ dưới lên) hoặc 'down' (từ trên xuống, ghi `direction="down"`). Đang có dấu rải
 * hướng khác thì đổi sang hướng mới thay vì gỡ.
 */
export function toggleArpeggio(
  doc: ScoreDocument,
  ids: readonly string[],
  direction: 'up' | 'down' = 'up',
): EditResult {
  const chords = selectedHeads(doc, ids)
    .map((head) => ({ head, members: membersOf(doc, head) }))
    .filter((c) => c.members.length >= 2);
  if (chords.length === 0) return { ok: false, reason: 'arpeggioTarget' };
  const hasSame = (el: Element) => {
    const notations = childOf(el, 'notations');
    const mark = notations && childOf(notations, 'arpeggiate');
    return !!mark && (mark.getAttribute('direction') === 'down') === (direction === 'down');
  };
  const all = chords.every((c) => c.members.every((m) => hasSame(m.element)));
  const touched: Touched = new Map();
  chords.forEach((c) => touch(touched, c.head));
  const name = ARTICULATION_LABELS.arpeggio.toLowerCase() + (direction === 'down' ? ' xuống' : '');
  const command = commitEdit(
    doc,
    `${all ? 'Bỏ' : 'Thêm'} ${name}`,
    touched,
    chords.map((c) => c.head.id),
    () => {
      for (const { members } of chords) {
        for (const m of members) {
          removeNotation(m.element, 'arpeggiate', () => true);
          if (all) continue;
          const mark = m.element.ownerDocument.createElement('arpeggiate');
          if (direction === 'down') mark.setAttribute('direction', 'down');
          notationsOf(m.element).appendChild(mark);
        }
      }
    },
  );
  return { ok: true, command };
}

/** Hai kiểu đường nối giữa hai nốt: glissando (đường lượn, chữ "gliss.") và trượt/slide (đường thẳng). */
const LINE_DEF = {
  glissando: { tag: 'glissando', label: 'glissando', lineType: 'wavy' },
  slide: { tag: 'slide', label: 'đường trượt', lineType: 'solid' },
} as const;
type LineKind = keyof typeof LINE_DEF;

/** Thẻ `<glissando>`/`<slide>` có `type` cho trước trong <notations> của nốt. */
const lineMark = (note: Element, tag: string, type: 'start' | 'stop'): Element | undefined => {
  const notations = childOf(note, 'notations');
  return notations && Array.from(notations.children).find((c) => c.tagName === tag && c.getAttribute('type') === type);
};

/**
 * Bật/tắt glissando hoặc đường trượt: bắt đầu ở nốt đầu của vùng chọn, kết thúc ở nốt cuối của vùng chọn (từ hai nốt
 * trở lên), hoặc ở nốt liền sau cùng khuông và bè nếu chỉ chọn một nốt. Nốt đầu đã có đường nối thì bấm cùng kiểu là
 * gỡ cả hai đầu, bấm kiểu kia là đổi kiểu.
 */
export function toggleLine(doc: ScoreDocument, ids: readonly string[], kind: LineKind): EditResult {
  const heads = selectedHeads(doc, ids);
  if (heads.length === 0) return { ok: false, reason: 'empty' };
  const start = heads[0];
  const sameVoice = (n: NoteInfo) =>
    n.partIndex === start.partIndex && n.staff === start.staff && n.voice === start.voice;
  const def = LINE_DEF[kind];

  // Đường nối đang có ở nốt đầu (kiểu nào cũng tính) và nốt kết thúc của nó
  const current = (['glissando', 'slide'] as const)
    .map((tag) => ({ tag, mark: lineMark(start.element, tag, 'start') }))
    .find((x) => x.mark !== undefined);
  const currentNumber = current?.mark?.getAttribute('number') ?? '1';
  const startAt = doc.notes.indexOf(start);
  const oldEnd = current
    ? doc.notes
        .slice(startAt + 1)
        .find(
          (n) =>
            sameVoice(n) &&
            (lineMark(n.element, current.tag, 'stop')?.getAttribute('number') ?? '1') === currentNumber &&
            lineMark(n.element, current.tag, 'stop') !== undefined,
        )
    : undefined;

  let end = oldEnd;
  if (!end) {
    if (heads.length >= 2) {
      const last = heads[heads.length - 1];
      if (!sameVoice(last)) return { ok: false, reason: 'glissTarget' };
      end = last;
    } else {
      const line = doc.notes.filter((n) => sameVoice(n) && n.chordIndex === 0 && !n.isRest && !n.isGrace);
      end = line[line.indexOf(start) + 1];
    }
  }
  const removeOnly = current?.tag === kind;
  if (!removeOnly && (!end || end === start)) return { ok: false, reason: 'glissTarget' };

  // Số hiệu `number` chưa dùng trong đoạn từ nốt đầu tới nốt cuối
  const used = new Set<string>();
  if (end && !removeOnly) {
    const part = doc.getMeasures(start.partIndex);
    for (let m = start.measureIndex; m <= end.measureIndex; m++) {
      part[m]?.querySelectorAll('notations > glissando, notations > slide').forEach((el) => {
        if (el !== current?.mark) used.add(el.getAttribute('number') ?? '1');
      });
    }
  }
  let number = 1;
  while (used.has(String(number))) number += 1;

  const touched: Touched = new Map();
  touch(touched, start);
  if (end) touch(touched, end);
  const label = removeOnly ? `Bỏ ${def.label}` : current ? `Đổi sang ${def.label}` : `Thêm ${def.label}`;
  const command = commitEdit(doc, label, touched, end ? [start.id, end.id] : [start.id], () => {
    if (current) {
      removeNotation(start.element, current.tag, (el) => el.getAttribute('type') === 'start');
      if (oldEnd) {
        removeNotation(
          oldEnd.element,
          current.tag,
          (el) => el.getAttribute('type') === 'stop' && (el.getAttribute('number') ?? '1') === currentNumber,
        );
      }
    }
    if (removeOnly || !end) return;
    const make = (note: Element, type: 'start' | 'stop'): void => {
      const el = note.ownerDocument.createElement(def.tag);
      el.setAttribute('type', type);
      el.setAttribute('number', String(number));
      el.setAttribute('line-type', def.lineType);
      if (kind === 'glissando' && type === 'start') el.textContent = 'gliss.';
      notationsOf(note).appendChild(el);
    };
    make(start.element, 'start');
    make(end.element, 'stop');
  });
  return { ok: true, command };
}

/** Đổi nốt hoa mỹ đang chọn giữa có gạch chéo (acciaccatura) và không gạch (appoggiatura). */
export function toggleGraceSlash(doc: ScoreDocument, ids: readonly string[]): EditResult {
  const graces = ids
    .map((id) => doc.getInfo(id))
    .filter((n): n is NoteInfo => n !== undefined && n.isGrace && n.chordIndex === 0);
  if (graces.length === 0) return { ok: false, reason: 'graceTarget' };
  const slashed = (g: NoteInfo) => childOf(g.element, 'grace')?.getAttribute('slash') === 'yes';
  const all = graces.every(slashed);
  const touched: Touched = new Map();
  graces.forEach((g) => touch(touched, g));
  const command = commitEdit(
    doc,
    all ? 'Bỏ gạch chéo nốt hoa mỹ' : 'Thêm gạch chéo nốt hoa mỹ',
    touched,
    graces.map((g) => g.id),
    () => {
      for (const g of graces) {
        const mark = childOf(g.element, 'grace');
        if (!mark) continue;
        if (all) mark.removeAttribute('slash');
        else mark.setAttribute('slash', 'yes');
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

/**
 * Dựng <direction> chứa `content`. Khuông > 1 phải ghi rõ <staff>, nếu không MusicXML hiểu là khuông 1;
 * `sound` thêm thẻ <sound> với các thuộc tính cho trước.
 */
const makeDirection = (
  owner: Document,
  content: Element,
  staff: number,
  sound?: Record<string, string>,
  placement: 'above' | 'below' = 'below',
): Element => {
  const direction = owner.createElement('direction');
  direction.setAttribute('placement', placement);
  const type = owner.createElement('direction-type');
  type.appendChild(content);
  direction.appendChild(type);
  if (staff > 1) {
    const staffEl = owner.createElement('staff');
    staffEl.textContent = String(staff);
    direction.appendChild(staffEl);
  }
  if (sound) {
    const soundEl = owner.createElement('sound');
    for (const [k, v] of Object.entries(sound)) soundEl.setAttribute(k, v);
    direction.appendChild(soundEl);
  }
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
    const velocity = DYNAMIC_VELOCITY[dynamic];
    const sound = velocity === undefined ? undefined : { dynamics: String(velocity) };
    target.element.before(makeDirection(owner, dynamics, target.staff, sound));
  });
  return { ok: true, command };
}

/** Mô tả một ký hiệu kéo dài từ nốt đầu đến nốt cuối vùng chọn (vạch mở và vạch dừng cùng số hiệu). */
interface SpanDef {
  /** Thẻ trong <direction-type>. */
  tag: 'wedge' | 'pedal' | 'octave-shift';
  /** Giá trị `type` của vạch mở (wedge: crescendo/diminuendo, pedal: start, octave-shift: down/up). */
  openType: string;
  label: string;
  /** Thuộc tính thêm cho cả vạch mở và vạch dừng. */
  attrs?: Record<string, string>;
  placement?: 'above' | 'below';
  /** Thuộc tính <sound> của vạch mở và vạch dừng (pedal). */
  sound?: { open: Record<string, string>; close: Record<string, string> };
  /** Số nốt tối thiểu của vùng chọn. */
  minNotes: number;
}

const HAIRPINS: Record<'crescendo' | 'diminuendo', SpanDef> = {
  crescendo: { tag: 'wedge', openType: 'crescendo', label: 'cresc.', minNotes: 2 },
  diminuendo: { tag: 'wedge', openType: 'diminuendo', label: 'dim.', minNotes: 2 },
};
const PEDAL: SpanDef = {
  tag: 'pedal',
  openType: 'start',
  label: 'pedal',
  attrs: { line: 'yes' },
  sound: { open: { 'damper-pedal': 'yes' }, close: { 'damper-pedal': 'no' } },
  minNotes: 1,
};
const OTTAVA: Record<'ottava8va' | 'ottava8vb', SpanDef> = {
  // MusicXML: type="down" là 8va (vẽ thấp hơn một quãng tám so với âm nghe), type="up" là 8vb
  ottava8va: {
    tag: 'octave-shift',
    openType: 'down',
    label: '8va',
    attrs: { size: '8' },
    placement: 'above',
    minNotes: 1,
  },
  ottava8vb: {
    tag: 'octave-shift',
    openType: 'up',
    label: '8vb',
    attrs: { size: '8' },
    placement: 'below',
    minNotes: 1,
  },
};

const spanElements = (d: Element, def: SpanDef): Element[] => Array.from(d.getElementsByTagName(def.tag));

/** Bật/tắt một ký hiệu kéo dài (cresc./dim., pedal, 8va/8vb) từ nốt đầu đến nốt cuối của vùng chọn. */
function toggleSpan(doc: ScoreDocument, ids: readonly string[], def: SpanDef): EditResult {
  const heads = selectedHeads(doc, ids, true);
  if (heads.length === 0) return { ok: false, reason: 'empty' };
  if (heads.length < def.minNotes) return { ok: false, reason: 'hairpinTarget' };
  const first = heads[0];
  const last = heads[heads.length - 1];
  if (first.partIndex !== last.partIndex || first.staff !== last.staff) {
    return { ok: false, reason: def.tag === 'wedge' ? 'hairpinTarget' : 'spanTarget' };
  }

  const startDirs = directionsBefore(first.element, (d) =>
    spanElements(d, def).some((w) => w.getAttribute('type') === def.openType),
  );
  const touched: Touched = new Map();
  touch(touched, first);
  touch(touched, last);

  // Số hiệu `number` chưa dùng trong đoạn
  const used = new Set<string>();
  const part = doc.getMeasures(first.partIndex);
  for (let m = first.measureIndex; m <= last.measureIndex; m++) {
    part[m]?.querySelectorAll(def.tag).forEach((w) => used.add(w.getAttribute('number') ?? '1'));
  }
  let number = 1;
  while (used.has(String(number))) number += 1;

  const command = commitEdit(
    doc,
    `${startDirs.length > 0 ? 'Bỏ' : 'Thêm'} ${def.label}`,
    touched,
    [first.id, last.id],
    () => {
      const owner = first.element.ownerDocument;
      if (startDirs.length > 0) {
        // Gỡ vạch bắt đầu và vạch dừng cùng số hiệu
        const num = spanElements(startDirs[0], def)[0]?.getAttribute('number') ?? '1';
        startDirs.forEach((d) => d.remove());
        for (let m = first.measureIndex; m < part.length; m++) {
          const stop = Array.from(part[m].children).find(
            (c) =>
              c.tagName === 'direction' &&
              spanElements(c, def).some(
                (w) => w.getAttribute('type') === 'stop' && (w.getAttribute('number') ?? '1') === num,
              ),
          );
          if (stop) {
            stop.remove();
            break;
          }
        }
        return;
      }
      const make = (type: string): Element => {
        const el = owner.createElement(def.tag);
        el.setAttribute('type', type);
        el.setAttribute('number', String(number));
        for (const [k, v] of Object.entries(def.attrs ?? {})) el.setAttribute(k, v);
        return el;
      };
      first.element.before(makeDirection(owner, make(def.openType), first.staff, def.sound?.open, def.placement));
      // Dừng ngay sau mục cuối (sau mọi nốt thêm trong hợp âm của mục đó)
      let anchor: Element = last.element;
      while (
        anchor.nextElementSibling?.tagName === 'note' &&
        anchor.nextElementSibling.querySelector(':scope > chord')
      ) {
        anchor = anchor.nextElementSibling;
      }
      anchor.after(makeDirection(owner, make('stop'), last.staff, def.sound?.close, def.placement));
    },
  );
  return { ok: true, command };
}

/** Bật/tắt cresc. (crescendo) hoặc dim. (diminuendo) từ nốt đầu đến nốt cuối của vùng chọn. */
export function toggleHairpin(
  doc: ScoreDocument,
  ids: readonly string[],
  kind: 'crescendo' | 'diminuendo',
): EditResult {
  return toggleSpan(doc, ids, HAIRPINS[kind]);
}

/** Thêm một nốt hoa mỹ (nhỏ, không chiếm thời gian) ngay trước mỗi nốt đã chọn, cao hơn nốt đó một bậc. */
export function addGrace(doc: ScoreDocument, ids: readonly string[], slash: boolean): EditResult {
  const targets = selectedHeads(doc, ids)
    .map((head) => ({ head, pitch: readPitch(head.element) }))
    .filter((t): t is { head: NoteInfo; pitch: Pitch } => t.pitch !== null);
  if (targets.length === 0) return { ok: false, reason: 'empty' };
  const planned = targets.map(({ head, pitch }) => {
    const at = STEPS.indexOf(pitch.step);
    const step = STEPS[(at + 1) % STEPS.length];
    const octave = pitch.octave + (at === STEPS.length - 1 ? 1 : 0);
    const alter = keyAlter(doc.keyAtPart(head.partIndex, head.measureIndex), step);
    return { head, grace: { step, alter, octave } as Pitch };
  });
  if (planned.some((p) => !inRange(pitchToMidi(p.grace)))) return { ok: false, reason: 'range' };

  const touched: Touched = new Map();
  planned.forEach((p) => touch(touched, p.head));
  const created: Element[] = [];
  const command = commitEdit(
    doc,
    slash ? 'Thêm nốt hoa mỹ (có gạch)' : 'Thêm nốt hoa mỹ',
    touched,
    planned.map((p) => p.head.id),
    () => {
      for (const { head, grace } of planned) {
        const owner = head.element.ownerDocument;
        const make = (tag: string, text?: string): Element => {
          const el = owner.createElement(tag);
          if (text !== undefined) el.textContent = text;
          return el;
        };
        const note = make('note');
        const mark = make('grace');
        if (slash) mark.setAttribute('slash', 'yes');
        note.appendChild(mark);
        const pitch = make('pitch');
        pitch.appendChild(make('step', grace.step));
        if (grace.alter !== 0) pitch.appendChild(make('alter', String(grace.alter)));
        pitch.appendChild(make('octave', String(grace.octave)));
        note.appendChild(pitch);
        note.appendChild(make('voice', String(head.voice)));
        note.appendChild(make('type', 'eighth'));
        const staffEl = childOf(head.element, 'staff');
        if (staffEl) note.appendChild(make('staff', staffEl.textContent ?? '1'));
        // Đặt trước cả hợp âm (chord symbol) và chỉ dẫn đứng liền trước nốt, để chúng vẫn gắn với nốt chính
        let anchor: Element = head.element;
        while (
          anchor.previousElementSibling &&
          (anchor.previousElementSibling.tagName === 'direction' || anchor.previousElementSibling.tagName === 'harmony')
        ) {
          anchor = anchor.previousElementSibling;
        }
        anchor.before(note);
        created.push(note);
      }
    },
  );
  command.selectAfter = created
    .map((el) => doc.notes.find((n) => n.element === el)?.id)
    .filter((id): id is string => id !== undefined);
  return { ok: true, command };
}

/** Ô nhịp (chỉ số) mà vùng chọn nằm trong: ô đầu và ô cuối; null nếu chưa chọn gì. */
const measureRange = (doc: ScoreDocument, ids: readonly string[]): { from: number; to: number } | null => {
  const indexes = ids.map((id) => doc.getInfo(id)?.measureIndex).filter((m): m is number => m !== undefined);
  return indexes.length === 0 ? null : { from: Math.min(...indexes), to: Math.max(...indexes) };
};

/** Điều phối một thao tác ký hiệu lên vùng chọn. */
export function applyMark(doc: ScoreDocument, ids: readonly string[], op: MarkOp): EditResult {
  if (isNotationMark(op)) return toggleArticulation(doc, ids, op);
  if (op === 'trillSharp' || op === 'trillFlat' || op === 'trillNatural') return setTrillAccidental(doc, ids, op);
  if (op === 'arpeggio') return toggleArpeggio(doc, ids);
  if (op === 'arpeggioDown') return toggleArpeggio(doc, ids, 'down');
  if (op === 'glissando' || op === 'slide') return toggleLine(doc, ids, op);
  if (op === 'graceToggle') return toggleGraceSlash(doc, ids);
  if (op === 'pedal') return toggleSpan(doc, ids, PEDAL);
  if (op === 'ottava8va' || op === 'ottava8vb') return toggleSpan(doc, ids, OTTAVA[op]);
  if (op === 'graceSlash') return addGrace(doc, ids, true);
  if (op === 'gracePlain') return addGrace(doc, ids, false);
  if (op === 'cresc') return toggleHairpin(doc, ids, 'crescendo');
  if (op === 'dim') return toggleHairpin(doc, ids, 'diminuendo');
  if (op.startsWith('dyn:')) return setDynamic(doc, ids, op.slice(4) as Dynamic);
  const range = measureRange(doc, ids);
  if (!range) return { ok: false, reason: 'noMeasure' };
  if (op === 'repeatStart') return toggleRepeat(doc, range.from, 'start');
  if (op === 'repeatEnd') return toggleRepeat(doc, range.to, 'end');
  if (op === 'volta1') return toggleEnding(doc, range.from, range.to, '1', true);
  if (op === 'volta2') return toggleEnding(doc, range.from, range.to, '2', false);
  if (op === 'volta3') return toggleEnding(doc, range.from, range.to, '3', false);
  if (op.startsWith('repeatTimes:')) return setRepeatTimes(doc, range.to, Number(op.slice('repeatTimes:'.length)));
  if (op === 'sectionRemove') return setSectionLabel(doc, range.from, null);
  if (op.startsWith('section:')) return setSectionLabel(doc, range.from, op.slice('section:'.length));
  if (op === 'barDouble') return toggleDoubleBar(doc, range.to);
  if (op === 'lineBreak') return toggleBreak(doc, range.from, 'system');
  if (op === 'pageBreak') return toggleBreak(doc, range.from, 'page');
  // Segno/Coda ở ô đầu của vùng chọn; D.C./D.S./Fine/To Coda ở ô cuối
  const kind = op as NavKind;
  return toggleNavigation(doc, kind === 'segno' || kind === 'coda' ? range.from : range.to, kind);
}

export { NAV_LABELS };
