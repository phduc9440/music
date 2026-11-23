/**
 * Ký hiệu gắn với một nốt (dấu thể hiện, nốt láy, fermata, dấu luyến, dấu nối, lời, hợp âm, sắc thái, cresc./dim.,
 * pedal, 8va, chữ chỉ dẫn...). Dùng cho menu chuột phải: liệt kê từng ký hiệu đang gắn ở nốt để xoá RIÊNG từng cái mà
 * không phải xoá cả nốt hay bấm lại nút trên bảng công cụ.
 */
import { childOf, commitEdit, touch } from '../core/commands';
import type { EditResult, Touched } from '../core/commands';
import type { NoteInfo, ScoreDocument } from '../core/ScoreDocument';
import { headOf } from '../notes/durationCore';
import { toggleTie } from '../notes/ties';
import { chordText } from './harmony';
import { articulationLabel } from './marks';
import type { NotationMark } from './marks';
import { t } from '../../../i18n/core';

/** Một ký hiệu xoá được, hiện trong menu. `key` ổn định giữa lần liệt kê và lần xoá (nếu bản nhạc chưa đổi). */
export interface Attachment {
  key: string;
  label: string;
  /** Nhóm để menu sắp xếp và chọn biểu tượng. */
  kind: 'mark' | 'line' | 'lyric' | 'chord' | 'dynamic' | 'text';
}

interface Found extends Attachment {
  /** Sửa DOM để gỡ ký hiệu. `touched` đã gồm ô của nốt; thêm ô khác (đầu kia của dấu luyến...) vào `extra`. */
  apply: () => void;
  extra: Array<{ partIndex: number; measureIndex: number }>;
  /** Ký hiệu cần lệnh riêng (dấu nối: gỡ cả hai đầu theo đúng quy tắc của nút Nối). */
  command?: () => EditResult;
}

/** Thẻ MusicXML → tên ký hiệu đã dịch sẵn của bảng công cụ. */
const MARK_OF_TAG: Record<string, NotationMark> = {
  staccato: 'staccato',
  accent: 'accent',
  tenuto: 'tenuto',
  'strong-accent': 'marcato',
  staccatissimo: 'staccatissimo',
  'breath-mark': 'breath',
  caesura: 'caesura',
  'trill-mark': 'trill',
  mordent: 'mordent',
  'inverted-mordent': 'invMordent',
  turn: 'turn',
};

const numberOf = (el: Element): string => el.getAttribute('number') ?? '1';

/** Gỡ `el`, rồi gỡ luôn các thẻ cha trống (ví dụ <articulations>, <notations>, <direction-type>, <direction>). */
const removeUp = (el: Element, stopAt: Element): void => {
  let parent = el.parentElement;
  el.remove();
  while (parent && parent !== stopAt && parent.children.length === 0) {
    const next = parent.parentElement;
    parent.remove();
    parent = next;
  }
};

/** Ô nhịp (chỉ số) chứa phần tử `el` của part `partIndex`. */
const measureOf = (doc: ScoreDocument, partIndex: number, el: Element) => {
  const measure = el.closest('measure');
  const measureIndex = measure ? doc.getMeasures(partIndex).indexOf(measure) : -1;
  return measureIndex < 0 ? null : { partIndex, measureIndex };
};

/** Khuông của một <direction>/<harmony> (thiếu thẻ <staff> là khuông 1). */
const staffOf = (el: Element): number => Number(childOf(el, 'staff')?.textContent ?? '1') || 1;

/** Tìm thẻ đóng của một ký hiệu nối hai nốt (slur, glissando, slide) trong các nốt khác cùng part. */
const findNotePartner = (
  doc: ScoreDocument,
  from: NoteInfo,
  tag: string,
  wantType: 'start' | 'stop',
  number: string,
): { el: Element; info: NoteInfo } | null => {
  const notes = doc.notes.filter((n) => n.partIndex === from.partIndex);
  const at = notes.indexOf(from);
  const order = wantType === 'stop' ? notes.slice(at + 1) : notes.slice(0, Math.max(0, at)).reverse();
  for (const n of order) {
    const notations = childOf(n.element, 'notations');
    const el =
      notations &&
      Array.from(notations.children).find(
        (c) => c.tagName === tag && c.getAttribute('type') === wantType && numberOf(c) === number,
      );
    if (el) return { el, info: n };
  }
  return null;
};

/** Thẻ đóng (type="stop") của ký hiệu kéo dài trong <direction>, tìm từ `start` trở đi trong cùng part. */
const findDirectionStop = (doc: ScoreDocument, partIndex: number, start: Element, tag: string): Element | null => {
  const number = numberOf(start);
  const measures = doc.getMeasures(partIndex);
  const from = measures.indexOf(start.closest('measure') as Element);
  if (from < 0) return null;
  let passed = false;
  for (let m = from; m < measures.length; m++) {
    for (const el of Array.from(measures[m].getElementsByTagName(tag))) {
      if (el === start) {
        passed = true;
        continue;
      }
      if (passed && el.getAttribute('type') === 'stop' && numberOf(el) === number) return el;
    }
    passed = true;
  }
  return null;
};

/** Nhãn ngắn cho một <direction>: sắc thái, cresc./dim., pedal, 8va/8vb, chữ, tempo... */
const directionItems = (doc: ScoreDocument, info: NoteInfo, direction: Element, index: number): Found[] => {
  const out: Found[] = [];
  const types = Array.from(direction.children).filter((c) => c.tagName === 'direction-type');
  types.forEach((type, ti) => {
    for (const content of Array.from(type.children)) {
      const key = `dir:${index}:${ti}:${content.tagName}`;
      const base = { extra: [] as Array<{ partIndex: number; measureIndex: number }> };
      const removeContent = () => {
        removeUp(content, direction.parentElement as Element);
        // <direction> chỉ còn <sound>/<staff>/<offset> thì bỏ luôn
        if (!direction.querySelector('direction-type')) direction.remove();
      };
      if (content.tagName === 'dynamics') {
        const name = content.firstElementChild?.tagName ?? '';
        out.push({
          ...base,
          key,
          kind: 'dynamic',
          label: t('editor.attach.dynamic', { name }),
          apply: () => direction.remove(),
        });
      } else if (content.tagName === 'wedge' || content.tagName === 'pedal' || content.tagName === 'octave-shift') {
        const type = content.getAttribute('type') ?? '';
        if (type === 'stop' || type === 'continue' || type === 'change') continue;
        const label =
          content.tagName === 'wedge'
            ? type === 'diminuendo'
              ? 'dim.'
              : 'cresc.'
            : content.tagName === 'pedal'
              ? t('editor.attach.pedal')
              : type === 'up'
                ? '8vb'
                : '8va';
        const stop = findDirectionStop(doc, info.partIndex, content, content.tagName);
        const stopAt = stop ? measureOf(doc, info.partIndex, stop) : null;
        out.push({
          key,
          kind: 'line',
          label,
          extra: stopAt ? [stopAt] : [],
          apply: () => {
            if (stop) {
              const stopDirection = stop.closest('direction');
              if (stopDirection) {
                removeUp(stop, stopDirection.parentElement as Element);
                if (!stopDirection.querySelector('direction-type')) stopDirection.remove();
              }
            }
            removeContent();
          },
        });
      } else if (content.tagName === 'words') {
        const text = (content.textContent ?? '').trim();
        if (!text) continue;
        out.push({ ...base, key, kind: 'text', label: t('editor.attach.words', { text }), apply: removeContent });
      } else if (content.tagName === 'metronome') {
        out.push({ ...base, key, kind: 'text', label: t('editor.attach.tempo'), apply: removeContent });
      } else if (content.tagName === 'rehearsal') {
        const text = (content.textContent ?? '').trim();
        out.push({ ...base, key, kind: 'text', label: t('editor.attach.section', { text }), apply: removeContent });
      } else if (content.tagName === 'segno' || content.tagName === 'coda') {
        out.push({
          ...base,
          key,
          kind: 'mark',
          label: content.tagName === 'segno' ? 'Segno' : 'Coda',
          apply: removeContent,
        });
      }
    }
  });
  return out;
};

/** Mọi ký hiệu gắn ở nốt `id` (kèm cách gỡ). */
function collect(doc: ScoreDocument, id: string): Found[] {
  const info = doc.getInfo(id);
  if (!info) return [];
  const head = headOf(doc, info);
  const out: Found[] = [];
  const none: Array<{ partIndex: number; measureIndex: number }> = [];

  // 1. Trong <notations> của nốt được bấm, và của đầu hợp âm (dấu thể hiện thường ghi ở đầu hợp âm)
  const owners = head === info ? [info] : [info, head];
  owners.forEach((owner, oi) => {
    const notations = childOf(owner.element, 'notations');
    if (!notations) return;
    Array.from(notations.children).forEach((child, ci) => {
      const key = `n:${oi}:${ci}:${child.tagName}`;
      const note = owner.element;
      if (child.tagName === 'articulations' || child.tagName === 'ornaments' || child.tagName === 'technical') {
        Array.from(child.children).forEach((mark, mi) => {
          if (mark.tagName === 'accidental-mark') return; // đi theo láy rền
          const kind = MARK_OF_TAG[mark.tagName];
          out.push({
            key: `${key}:${mi}:${mark.tagName}`,
            kind: 'mark',
            label: kind ? articulationLabel(kind) : mark.tagName,
            extra: none,
            apply: () => {
              if (mark.tagName === 'trill-mark') {
                Array.from(child.children)
                  .filter((c) => c.tagName === 'accidental-mark')
                  .forEach((c) => c.remove());
              }
              removeUp(mark, note);
            },
          });
        });
      } else if (child.tagName === 'fermata') {
        const kind: NotationMark = child.getAttribute('type') === 'inverted' ? 'fermataBelow' : 'fermata';
        out.push({
          key,
          kind: 'mark',
          label: articulationLabel(kind),
          extra: none,
          apply: () => removeUp(child, note),
        });
      } else if (child.tagName === 'arpeggiate') {
        // Dấu rải ghi ở mọi nốt của hợp âm: gỡ hết
        const members = doc.notes.filter((n) => headOf(doc, n) === head);
        out.push({
          key,
          kind: 'mark',
          label: articulationLabel('arpeggio'),
          extra: none,
          apply: () =>
            members.forEach((m) => {
              const ns = childOf(m.element, 'notations');
              if (!ns) return;
              Array.from(ns.children)
                .filter((c) => c.tagName === 'arpeggiate')
                .forEach((c) => removeUp(c, m.element));
            }),
        });
      } else if (child.tagName === 'tied' && child.getAttribute('type') === 'start') {
        out.push({
          key,
          kind: 'line',
          label: t('editor.attach.tie'),
          extra: none,
          apply: () => undefined,
          command: () => toggleTie(doc, [owner.id]),
        });
      } else if (child.tagName === 'slur' || child.tagName === 'glissando' || child.tagName === 'slide') {
        const type = child.getAttribute('type');
        if (type !== 'start' && type !== 'stop') return;
        const partner = findNotePartner(
          doc,
          owner,
          child.tagName,
          type === 'start' ? 'stop' : 'start',
          numberOf(child),
        );
        const label =
          child.tagName === 'slur'
            ? t('editor.attach.slur')
            : child.tagName === 'glissando'
              ? t('editor.attach.glissando')
              : t('editor.attach.slide');
        // Dấu luyến hiện ở cả nốt đầu và nốt cuối: chỉ liệt kê một lần cho mỗi nốt là đủ
        out.push({
          key,
          kind: 'line',
          label,
          extra: partner ? [{ partIndex: partner.info.partIndex, measureIndex: partner.info.measureIndex }] : none,
          apply: () => {
            removeUp(child, note);
            if (partner) removeUp(partner.el, partner.info.element);
          },
        });
      }
    });
  });

  // 2. Lời bài hát của nốt được bấm
  Array.from(info.element.children)
    .filter((c) => c.tagName === 'lyric')
    .forEach((lyric, li) => {
      const text = Array.from(lyric.getElementsByTagName('text'))
        .map((x) => x.textContent ?? '')
        .join('');
      out.push({
        key: `lyric:${li}`,
        kind: 'lyric',
        label: t('editor.attach.lyric', { verse: lyric.getAttribute('number') ?? '1', text }),
        extra: none,
        apply: () => lyric.remove(),
      });
    });

  // 3. Hợp âm và chỉ dẫn đứng liền trước đầu hợp âm, cùng khuông
  let prev = head.element.previousElementSibling;
  let di = 0;
  while (prev && (prev.tagName === 'direction' || prev.tagName === 'harmony')) {
    const el = prev;
    prev = prev.previousElementSibling;
    if (staffOf(el) !== head.staff) continue;
    if (el.tagName === 'harmony') {
      out.push({
        key: `harmony:${di++}`,
        kind: 'chord',
        label: t('editor.attach.chord', { name: chordText(el) }),
        extra: none,
        apply: () => el.remove(),
      });
    } else {
      out.push(...directionItems(doc, head, el, di++));
    }
  }
  return out;
}

/** Ký hiệu đang gắn ở nốt `id`, theo thứ tự hiển thị trong menu. */
export function listAttachments(doc: ScoreDocument, id: string): Attachment[] {
  return collect(doc, id).map(({ key, label, kind }) => ({ key, label, kind }));
}

/** Gỡ riêng một ký hiệu (theo `key` từ {@link listAttachments}) khỏi nốt `id`; nốt và các ký hiệu khác giữ nguyên. */
export function removeAttachment(doc: ScoreDocument, id: string, key: string): EditResult {
  const info = doc.getInfo(id);
  const found = collect(doc, id).find((f) => f.key === key);
  if (!info || !found) return { ok: false, reason: 'unchanged' };
  if (found.command) return found.command();
  const touched: Touched = new Map();
  touch(touched, info);
  for (const m of found.extra) touched.set(`${m.partIndex}|${m.measureIndex}`, m);
  const command = commitEdit(doc, t('editor.cmd.mark.remove', { name: found.label }), touched, [id], found.apply);
  command.selectAfter = [id];
  return { ok: true, command };
}
