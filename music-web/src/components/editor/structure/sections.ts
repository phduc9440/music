/**
 * Nhãn đoạn của bài (Phiên khúc, Điệp khúc, Cầu...): ghi bằng `<rehearsal>` trong một <direction> đặt phía trên ô nhịp,
 * ở part đầu tiên. Mỗi ô có tối đa một nhãn: đặt nhãn khác thì thay nhãn cũ, đặt lại đúng nhãn đó thì gỡ.
 */
import { commitEdit } from '../core/commands';
import type { EditResult, Touched } from '../core/commands';
import type { ScoreDocument } from '../core/ScoreDocument';

/** Các <direction> có <rehearsal> của ô nhịp. */
const rehearsalDirections = (measure: Element): Element[] =>
  Array.from(measure.children).filter(
    (c) => c.tagName === 'direction' && c.getElementsByTagName('rehearsal').length > 0,
  );

/**
 * Đặt nhãn đoạn `text` ở đầu ô `measureIndex`; `text = null` là gỡ nhãn của ô đó. Đặt lại đúng nhãn đang có thì gỡ
 * (bấm lần nữa để bỏ, giống các ký hiệu khác).
 */
export function setSectionLabel(doc: ScoreDocument, measureIndex: number, text: string | null): EditResult {
  const measure = doc.getMeasure(0, measureIndex);
  if (!measure) return { ok: false, reason: 'noMeasure' };
  const label = text === null ? null : text.trim();
  if (label === '') return { ok: false, reason: 'badValue' };
  const existing = rehearsalDirections(measure);
  if (label === null && existing.length === 0) return { ok: false, reason: 'noSection' };
  const same = label !== null && existing.some((d) => d.getElementsByTagName('rehearsal')[0]?.textContent === label);

  const touched: Touched = new Map([[`0|${measureIndex}`, { partIndex: 0, measureIndex }]]);
  const name = label === null ? 'Bỏ nhãn đoạn' : same ? `Bỏ nhãn "${label}"` : `Đặt nhãn "${label}"`;
  const command = commitEdit(doc, name, touched, [], () => {
    existing.forEach((d) => d.remove());
    if (label === null || same) return;
    const owner = measure.ownerDocument;
    const rehearsal = owner.createElement('rehearsal');
    rehearsal.setAttribute('enclosure', 'rectangle');
    rehearsal.setAttribute('font-weight', 'bold');
    rehearsal.textContent = label;
    const type = owner.createElement('direction-type');
    type.appendChild(rehearsal);
    const direction = owner.createElement('direction');
    direction.setAttribute('placement', 'above');
    direction.appendChild(type);
    const firstNote = Array.from(measure.children).find((c) => c.tagName === 'note');
    if (firstNote) firstNote.before(direction);
    else measure.appendChild(direction);
  });
  return { ok: true, command };
}
