/**
 * Tô các hợp âm AI gợi ý trên SVG của OSMD: nốt mang hợp âm (nhóm có `data-note-id`) và chữ hợp âm phía trên nó
 * (OSMD vẽ mỗi ký hiệu hợp âm thành một nhóm `g.vf-text`, đặt ngay trên nốt). Chỉ đổi class CSS, không vẽ lại.
 */
import { NOTE_ID_ATTR } from '../../editor/core/osmdBridge';

export const AI_NOTE_CLASS = 'ed-note--ai';
export const AI_LABEL_CLASS = 'ed-chord--ai';
/** Đang được chọn từ bảng Hợp âm AI: nhấp sáng một lúc. */
export const AI_FLASH_CLASS = 'ed-ai-flash';
const FLASH_MS = 1800;

export interface AiChordMark {
  /** Id nốt mang hợp âm. */
  id: string;
  /** Chữ hợp âm đang ghi, để nhận đúng nhãn khi gần đó có chữ khác (tempo, chú thích). */
  text: string;
}

const squash = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, '');

const noteGroup = (host: HTMLElement, id: string): SVGGElement | null =>
  host.querySelector<SVGGElement>(`[${NOTE_ID_ATTR}="${CSS.escape(id)}"]`);

/**
 * Nhãn hợp âm của một nốt: nhóm `g.vf-text` nằm phía trên nốt, lệch ngang không quá bề rộng nốt. Ưu tiên nhãn có đúng
 * chữ `text`, không có thì lấy nhãn gần nhất phía trên.
 */
export function chordLabelOf(note: SVGGElement, text: string): SVGGElement | null {
  const svg = note.ownerSVGElement;
  if (!svg) return null;
  const box = note.getBoundingClientRect();
  const reach = Math.max(box.width * 1.5, 12);
  const wanted = squash(text);
  let best: { el: SVGGElement; score: number } | null = null;
  for (const el of Array.from(svg.querySelectorAll<SVGGElement>('g.vf-text'))) {
    const r = el.getBoundingClientRect();
    if (r.bottom > box.top + 2 || Math.abs(r.left - box.left) > reach) continue;
    // khoảng cách dọc là chính; chữ khớp được ưu tiên hẳn
    const score = box.top - r.bottom + (squash(el.textContent) === wanted ? 0 : 10_000);
    if (!best || score < best.score) best = { el, score };
  }
  return best?.el ?? null;
}

/** Gỡ dấu cũ rồi tô lại các hợp âm AI còn trên bản nhạc. */
export function applyAiChords(host: HTMLElement, marks: readonly AiChordMark[]): void {
  host.querySelectorAll(`.${AI_NOTE_CLASS}, .${AI_LABEL_CLASS}`).forEach((el) => {
    el.classList.remove(AI_NOTE_CLASS, AI_LABEL_CLASS);
  });
  for (const mark of marks) {
    const note = noteGroup(host, mark.id);
    if (!note) continue;
    note.classList.add(AI_NOTE_CLASS);
    chordLabelOf(note, mark.text)?.classList.add(AI_LABEL_CLASS);
  }
}

/** Cuộn tới hợp âm của nốt `id` (giữa màn hình) và cho nó nhấp sáng. */
export function flashAiChord(host: HTMLElement, mark: AiChordMark): void {
  const note = noteGroup(host, mark.id);
  if (!note) return;
  const label = chordLabelOf(note, mark.text);
  const targets = [note, label].filter((el): el is SVGGElement => el !== null);
  host.querySelectorAll(`.${AI_FLASH_CLASS}`).forEach((el) => el.classList.remove(AI_FLASH_CLASS));
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  (label ?? note).scrollIntoView({ block: 'center', inline: 'center', behavior: reduce ? 'auto' : 'smooth' });
  targets.forEach((el) => {
    // bỏ rồi gắn lại để bấm lần nữa vẫn chạy lại hiệu ứng
    el.classList.remove(AI_FLASH_CLASS);
    void el.getBoundingClientRect();
    el.classList.add(AI_FLASH_CLASS);
  });
  window.setTimeout(() => targets.forEach((el) => el.classList.remove(AI_FLASH_CLASS)), FLASH_MS);
}
