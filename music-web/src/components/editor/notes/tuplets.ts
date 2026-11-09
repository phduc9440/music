/**
 * Nhóm nốt đặc biệt (chùm ba, chùm năm...). Mỗi nốt trong chùm có `<time-modification>` (a nốt chiếm chỗ của n nốt);
 * nốt đầu mang `<tuplet type="start">`, nốt cuối mang `<tuplet type="stop">`. `<duration>` luôn là độ dài thật (đã
 * rút ngắn), còn `<type>` là hình nốt viết ra.
 */
import { childOf, commitEdit, hasTie, touch } from '../core/commands';
import type { EditCommand, EditResult, Touched } from '../core/commands';
import { divisionsFactor, scaleDivisions } from './divisions';
import {
  choiceQuarters,
  divisionsAt,
  dotCount,
  hasChild,
  headOf,
  idsOfEntry,
  makeRest,
  numberOf,
  placeAfter,
  scaledLength,
  splitRests,
  stripBeams,
  voiceEntries,
  writeDuration,
  writtenChoice,
} from './durationCore';
import type { Dots, DurationChoice, Entry, Plan, Ratio } from './durationCore';
import type { NoteInfo, ScoreDocument } from '../core/ScoreDocument';
import { runStructural } from '../structure/structure';
import { notationsOf, removeNotation } from './ties';

/** Các kiểu chùm có sẵn trên bảng công cụ. */
export const TUPLET_PRESETS: { actual: number; normal: number; label: string; name: string }[] = [
  { actual: 3, normal: 2, label: 'Chùm ba (3:2)', name: 'chùm ba' },
  { actual: 2, normal: 3, label: 'Chùm hai (2:3)', name: 'chùm hai' },
  { actual: 4, normal: 3, label: 'Chùm bốn (4:3)', name: 'chùm bốn' },
  { actual: 5, normal: 4, label: 'Chùm năm (5:4)', name: 'chùm năm' },
  { actual: 6, normal: 4, label: 'Chùm sáu (6:4)', name: 'chùm sáu' },
  { actual: 7, normal: 4, label: 'Chùm bảy (7:4)', name: 'chùm bảy' },
];

/** Tên tiếng Việt của chùm, ví dụ "chùm ba"; kiểu lạ thì ghi tỉ lệ "chùm 9:8". */
export const tupletName = (ratio: Ratio): string =>
  TUPLET_PRESETS.find((p) => p.actual === ratio.actual && p.normal === ratio.normal)?.name ??
  `chùm ${ratio.actual}:${ratio.normal}`;

/** Thao tác chùm trên bảng công cụ. */
export type TupletOp = { kind: 'make'; actual: number; normal: number } | { kind: 'remove' };

/** Tỉ lệ <time-modification> của một thẻ <note>; null nếu nốt không thuộc chùm. */
export const ratioOf = (note: Element): Ratio | null => {
  const tm = childOf(note, 'time-modification');
  if (!tm) return null;
  const actual = numberOf(tm, 'actual-notes');
  const normal = numberOf(tm, 'normal-notes');
  return actual && normal && actual > 0 && normal > 0 ? { actual, normal } : null;
};

const sameRatio = (a: Ratio | null, b: Ratio | null): boolean =>
  a !== null && b !== null && a.actual === b.actual && a.normal === b.normal;

/** Ghi <time-modification> đúng chỗ (sau <accidental>/<dot>/<type>, trước <stem>/<staff>/<beam>/<notations>). */
export const setTimeModification = (note: Element, ratio: Ratio): void => {
  childOf(note, 'time-modification')?.remove();
  const owner = note.ownerDocument;
  const tm = owner.createElement('time-modification');
  const actual = owner.createElement('actual-notes');
  actual.textContent = String(ratio.actual);
  const normal = owner.createElement('normal-notes');
  normal.textContent = String(ratio.normal);
  tm.append(actual, normal);
  placeAfter(note, tm, ['accidental', 'dot', 'type', 'voice', 'duration']);
};

const hasMark = (entry: Entry, type: 'start' | 'stop'): boolean =>
  entry.members.some((m) =>
    Array.from(childOf(m, 'notations')?.children ?? []).some(
      (c) => c.tagName === 'tuplet' && c.getAttribute('type') === type,
    ),
  );

/** Phạm vi một chùm trong danh sách mục của bè: từ mục `from` đến mục `to` (gồm cả hai đầu). */
export interface TupletRange extends Ratio {
  from: number;
  to: number;
  /** Tổng độ dài thật của cả chùm, đơn vị divisions. */
  span: number;
}

/**
 * Tìm chùm chứa mục `index`.
 * - Có <tuplet start/stop>: lấy theo dấu.
 * - Không có dấu (file OMR hay thiếu): chia chuỗi mục liên tiếp cùng tỉ lệ thành các chùm đủ độ dài, tức là cắt khi
 *   tổng độ dài thật thành một hình nốt trọn vẹn (từ hai mục trở lên).
 * @returns null nếu mục không thuộc chùm
 */
export const groupRange = (entries: Entry[], index: number, divisions: number): TupletRange | null => {
  const ratio = ratioOf(entries[index].members[0]);
  if (!ratio) return null;
  const same = (i: number) => i >= 0 && i < entries.length && sameRatio(ratio, ratioOf(entries[i].members[0]));
  let lo = index;
  while (same(lo - 1)) lo--;
  let hi = index;
  while (same(hi + 1)) hi++;

  let from = lo;
  let to = hi;
  const marked = entries.slice(lo, hi + 1).some((e) => hasMark(e, 'start') || hasMark(e, 'stop'));
  if (marked) {
    for (let i = index; i >= lo; i--) {
      if (hasMark(entries[i], 'start')) {
        from = i;
        break;
      }
      if (i < index && hasMark(entries[i], 'stop')) {
        from = i + 1;
        break;
      }
    }
    for (let i = index; i <= hi; i++) {
      if (hasMark(entries[i], 'stop')) {
        to = i;
        break;
      }
      if (i > index && hasMark(entries[i], 'start')) {
        to = i - 1;
        break;
      }
    }
  } else {
    let start = lo;
    let sum = 0;
    let found = false;
    for (let i = lo; i <= hi; i++) {
      sum += entries[i].duration;
      if (i - start + 1 >= 2 && writtenChoice(sum / divisions) !== null) {
        if (index >= start && index <= i) {
          from = start;
          to = i;
          found = true;
          break;
        }
        start = i + 1;
        sum = 0;
      }
    }
    if (!found) {
      from = Math.min(start, index);
      to = hi;
    }
  }
  const span = entries.slice(from, to + 1).reduce((sum, e) => sum + e.duration, 0);
  return { ...ratio, from, to, span };
};

/** Chùm chứa nốt `id`: các mục (nốt đầu mỗi mục, theo thứ tự), tỉ lệ và độ dài thật; null nếu không thuộc chùm. */
export function tupletGroupOf(
  doc: ScoreDocument,
  id: string,
): { members: NoteInfo[]; actual: number; normal: number; span: number } | null {
  const info = doc.getInfo(id);
  if (!info || info.isGrace) return null;
  const head = headOf(doc, info).element;
  const measure = head.parentElement;
  if (!measure) return null;
  const entries = voiceEntries(measure, info.staff, info.voice);
  const index = entries?.findIndex((e) => e.members.includes(head)) ?? -1;
  if (!entries || index < 0) return null;
  const range = groupRange(entries, index, divisionsAt(measure.parentElement, measure));
  if (!range) return null;
  const members = entries
    .slice(range.from, range.to + 1)
    .map((e) => doc.notes.find((n) => n.element === e.members[0]))
    .filter((n): n is NoteInfo => n !== undefined);
  return { members, actual: range.actual, normal: range.normal, span: range.span };
}

const addMark = (note: Element, type: 'start' | 'stop'): void => {
  const mark = note.ownerDocument.createElement('tuplet');
  mark.setAttribute('type', type);
  if (type === 'start') mark.setAttribute('bracket', 'yes');
  notationsOf(note).appendChild(mark);
};

/**
 * Đặt lại dấu <tuplet start/stop> cho chùm bắt đầu tại thẻ `first` và dài `span` (divisions): dấu start ở nốt đầu,
 * stop ở nốt cuối. Gọi sau khi sửa chùm (ghi đè, chia thêm dấu lặng) vì nốt cuối có thể đã đổi.
 */
const refreshMarks = (first: Element, span: number): void => {
  const voice = numberOf(first, 'voice') ?? 1;
  const heads: Element[] = [];
  const all: Element[] = [];
  let total = 0;
  for (let el: Element | null = first; el && total < span; el = el.nextElementSibling) {
    if (el.tagName === 'backup' || el.tagName === 'forward') break;
    if (el.tagName !== 'note' || hasChild(el, 'grace') || (numberOf(el, 'voice') ?? 1) !== voice) continue;
    all.push(el);
    if (hasChild(el, 'chord')) continue;
    heads.push(el);
    total += numberOf(el, 'duration') ?? 0;
  }
  all.forEach((n) => removeNotation(n, 'tuplet', () => true));
  if (heads.length < 2) return;
  addMark(heads[0], 'start');
  addMark(heads[heads.length - 1], 'stop');
};

/**
 * Lập kế hoạch đổi trường độ của mục `index` đang nằm trong chùm. Chùm luôn giữ nguyên tổng độ dài: ngắn đi thì phần
 * trống thành dấu lặng trong chùm, dài ra thì ghi đè các mục sau trong cùng chùm; vượt khỏi chùm thì từ chối.
 * `choice` là hình nốt viết ra (ví dụ "móc đơn" trong chùm ba thật ra dài 1/3 phách).
 */
export function planTupletDuration(entries: Entry[], index: number, choice: DurationChoice, divisions: number): Plan {
  const entry = entries[index];
  const group = groupRange(entries, index, divisions);
  if (!group) return { error: 'unsupported' };
  const ratio: Ratio = { actual: group.actual, normal: group.normal };

  const target = scaledLength(choiceQuarters(choice), divisions, ratio);
  if (target === null) return { error: 'divisions' };

  const tied = (e: Entry) => e.members.some((m) => hasTie(m, 'start') || hasTie(m, 'stop'));
  const head = entry.members[0];
  const sameLook = childOf(head, 'type')?.textContent?.trim() === choice.type && dotCount(head) === choice.dots;
  const delta = target - entry.duration;
  if (delta === 0 && sameLook) return { error: 'unchanged' };
  if (tied(entry)) return { error: 'tie' };

  const first = entries[group.from].members[0];
  const apply = (): void => entry.members.forEach((m) => writeDuration(m, target, choice.type, choice.dots));
  const addRests = (rests: { d: number; type: DurationChoice['type']; dots: Dots }[]): void => {
    let anchor = entry.members[entry.members.length - 1];
    for (const r of rests) {
      const rest = makeRest(head, r.d, r.type, r.dots);
      setTimeModification(rest, ratio);
      anchor.after(rest);
      anchor = rest;
    }
  };

  if (delta === 0) {
    return {
      run: () => {
        apply();
        stripBeams(entries);
      },
    };
  }

  if (delta < 0) {
    const rests = splitRests(-delta, divisions, ratio);
    if (!rests) return { error: 'divisions' };
    return {
      run: () => {
        apply();
        stripBeams(entries);
        addRests(rests);
        refreshMarks(first, group.span);
      },
    };
  }

  let remaining = delta;
  const consumed: Entry[] = [];
  let leftover = 0;
  for (let j = index + 1; j <= group.to && remaining > 0; j++) {
    const next = entries[j];
    if (tied(next)) return { error: 'tie' };
    consumed.push(next);
    if (next.duration <= remaining) remaining -= next.duration;
    else {
      leftover = next.duration - remaining;
      remaining = 0;
    }
  }
  if (remaining > 0) return { error: 'tupletFit' };
  const leftoverRests = leftover > 0 ? splitRests(leftover, divisions, ratio) : [];
  if (!leftoverRests) return { error: 'divisions' };
  return {
    run: () => {
      apply();
      stripBeams(entries);
      consumed.forEach((e) => e.members.forEach((m) => m.remove()));
      addRests(leftoverRests);
      refreshMarks(first, group.span);
    },
  };
}

/** Các id của mục `entryIndex` đến `entryIndex + count - 1` trong cùng bè với `info`. */
const idsOfEntries = (doc: ScoreDocument, info: NoteInfo, count: number): string[] =>
  doc.notes
    .filter(
      (n) =>
        n.partIndex === info.partIndex &&
        n.measureIndex === info.measureIndex &&
        n.staff === info.staff &&
        n.voice === info.voice &&
        n.entryIndex >= info.entryIndex &&
        n.entryIndex < info.entryIndex + count,
    )
    .map((n) => n.id);

/**
 * Biến nốt/hợp âm/dấu lặng `id` thành một chùm `actual:normal` chiếm đúng chỗ cũ. Mục đầu giữ cao độ, các mục sau là
 * dấu lặng để người dùng bấm vào nhập nốt. Nếu divisions quá thô (ví dụ divisions = 1 mà cần chia ba) thì chia nhỏ
 * divisions của cả part và lệnh là lệnh cấu trúc (một bản chụp toàn bài để hoàn tác).
 */
export function makeTuplet(doc: ScoreDocument, id: string, actual: number, normal: number): EditResult {
  const info = doc.getInfo(id);
  if (!info || info.isGrace) return { ok: false, reason: 'empty' };
  const headInfo = headOf(doc, info);
  const head = headInfo.element;
  const measure = head.parentElement;
  const part = measure?.parentElement ?? null;
  if (!measure || !part) return { ok: false, reason: 'unsupported' };
  const entries = voiceEntries(measure, headInfo.staff, headInfo.voice);
  const index = entries?.findIndex((e) => e.members.includes(head)) ?? -1;
  if (!entries || index < 0) return { ok: false, reason: 'unsupported' };
  const entry = entries[index];
  if (entry.duration <= 0) return { ok: false, reason: 'unsupported' };
  if (entry.members.some((m) => ratioOf(m))) return { ok: false, reason: 'tuplet' };
  if (entry.members.some((m) => hasTie(m, 'start') || hasTie(m, 'stop'))) return { ok: false, reason: 'tie' };

  const divisions = divisionsAt(part, measure);
  // Hình nốt viết ra = độ dài cả chùm chia cho `normal` (một phách đen, 3:2 → móc đơn)
  const written = writtenChoice(entry.duration / divisions / normal);
  if (!written) return { ok: false, reason: 'tupletType' };
  const factor = divisionsFactor(entry.duration, actual);
  const ratio: Ratio = { actual, normal };

  const build = (): void => {
    const each = (entry.duration * factor) / actual;
    stripBeams(entries);
    entry.members.forEach((m) => {
      writeDuration(m, each, written.type, written.dots);
      setTimeModification(m, ratio);
    });
    childOf(head, 'rest')?.removeAttribute('measure');
    let anchor = entry.members[entry.members.length - 1];
    for (let k = 1; k < actual; k++) {
      const rest = makeRest(head, each, written.type, written.dots);
      setTimeModification(rest, ratio);
      anchor.after(rest);
      anchor = rest;
    }
    addMark(head, 'start');
    addMark(anchor, 'stop');
  };

  const label = `Tạo ${tupletName(ratio)}`;
  let command: EditCommand;
  if (factor > 1) {
    const result = runStructural(doc, label, () => {
      scaleDivisions(doc, headInfo.partIndex, factor);
      build();
      return headInfo.measureIndex;
    });
    if (!result.ok) return result;
    command = result.command;
  } else {
    const touched: Touched = new Map();
    touch(touched, headInfo);
    command = commitEdit(doc, label, touched, [], build);
  }
  command.selectAfter = idsOfEntry(doc, head);
  command.changedIds = idsOfEntries(doc, headInfo, actual);
  return { ok: true, command };
}

/** Chuyển các <slur> của những thẻ bị xóa sang `keeper` (bỏ cặp start-stop cùng số nằm trọn trên một nốt). */
const carrySlurs = (removed: Element[], keeper: Element): void => {
  const slurs = removed
    .flatMap((n) => Array.from(childOf(n, 'notations')?.children ?? []))
    .filter((c) => c.tagName === 'slur');
  if (slurs.length === 0) return;
  const notations = notationsOf(keeper);
  const key = (s: Element) => `${s.getAttribute('number') ?? '1'}|${s.getAttribute('type')}`;
  const have = new Set(
    Array.from(notations.children)
      .filter((c) => c.tagName === 'slur')
      .map(key),
  );
  for (const s of slurs) {
    if (have.has(key(s))) continue;
    have.add(key(s));
    notations.appendChild(s.cloneNode(true));
  }
  for (const s of Array.from(notations.children).filter(
    (c) => c.tagName === 'slur' && c.getAttribute('type') === 'start',
  )) {
    const stop = Array.from(notations.children).find(
      (c) =>
        c.tagName === 'slur' &&
        c.getAttribute('type') === 'stop' &&
        (c.getAttribute('number') ?? '1') === (s.getAttribute('number') ?? '1'),
    );
    if (stop) {
      s.remove();
      stop.remove();
    }
  }
};

/**
 * Gộp cả chùm chứa nốt `id` về một mục dài bằng cả chùm: giữ cao độ của mục có nốt đầu tiên (không có thì là dấu
 * lặng), bỏ <time-modification> và dấu chùm. Chùm có dấu nối thì từ chối (gỡ nối trước).
 */
export function removeTuplet(doc: ScoreDocument, id: string): EditResult {
  const info = doc.getInfo(id);
  if (!info || info.isGrace) return { ok: false, reason: 'empty' };
  const headInfo = headOf(doc, info);
  const head = headInfo.element;
  const measure = head.parentElement;
  if (!measure) return { ok: false, reason: 'unsupported' };
  const entries = voiceEntries(measure, headInfo.staff, headInfo.voice);
  const index = entries?.findIndex((e) => e.members.includes(head)) ?? -1;
  if (!entries || index < 0) return { ok: false, reason: 'unsupported' };
  const divisions = divisionsAt(measure.parentElement, measure);
  const range = groupRange(entries, index, divisions);
  if (!range) return { ok: false, reason: 'noTuplet' };

  const group = entries.slice(range.from, range.to + 1);
  if (group.some((e) => e.members.some((m) => hasTie(m, 'start') || hasTie(m, 'stop')))) {
    return { ok: false, reason: 'tie' };
  }
  const keeper = group.find((e) => !e.isRest) ?? group[0];
  const written = writtenChoice(range.span / divisions);
  const restPieces = written || !keeper.isRest ? null : splitRests(range.span, divisions);
  if (!written && !restPieces) return { ok: false, reason: 'tupletType' };

  const touched: Touched = new Map();
  touch(touched, headInfo);
  const keeperHead = keeper.members[0];
  const command = commitEdit(doc, `Bỏ ${tupletName(range)}`, touched, [], () => {
    const removed = group.filter((e) => e !== keeper).flatMap((e) => e.members);
    carrySlurs(removed, keeperHead);
    removed.forEach((m) => m.remove());
    stripBeams([keeper]);
    keeper.members.forEach((m) => {
      childOf(m, 'time-modification')?.remove();
      removeNotation(m, 'tuplet', () => true);
    });
    if (written) {
      keeper.members.forEach((m) => writeDuration(m, range.span, written.type, written.dots));
    } else if (restPieces) {
      const [firstPiece, ...others] = restPieces;
      keeper.members.forEach((m) => writeDuration(m, firstPiece.d, firstPiece.type, firstPiece.dots));
      let anchor = keeperHead;
      for (const r of others) {
        const rest = makeRest(keeperHead, r.d, r.type, r.dots);
        anchor.after(rest);
        anchor = rest;
      }
    }
    childOf(keeperHead, 'rest')?.removeAttribute('measure');
  });
  command.selectAfter = idsOfEntry(doc, keeperHead);
  command.changedIds = command.selectAfter;
  return { ok: true, command };
}
