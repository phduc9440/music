/** Tô nốt đang vang và cuộn theo bản nhạc khi phát, chỉ đổi class CSS trên SVG của OSMD (không vẽ lại). */
import { NOTE_ID_ATTR, NOTE_IDS_ATTR } from '../editor/osmdBridge';

export const PLAYING_CLASS = 'pl-note--playing';

/** Tô các nhóm SVG có chứa ít nhất một id đang vang; tập rỗng thì bỏ tô hết. */
export function applyPlaying(host: HTMLElement, ids: ReadonlySet<string>): void {
  host.querySelectorAll(`[${NOTE_ID_ATTR}]`).forEach((el) => {
    const on =
      ids.size > 0 &&
      (el.getAttribute(NOTE_IDS_ATTR) ?? el.getAttribute(NOTE_ID_ATTR) ?? '').split(' ').some((id) => ids.has(id));
    el.classList.toggle(PLAYING_CLASS, on);
  });
}

export const MUTED_CLASS = 'pl-note--muted';

const TRACK_OF_ID = /^(?:p(\d+)-)?m\d+-s(\d+)-/;

/** Id track ("part:khuông", khuông từ 1) của một id nốt như "p1-m3-s2-v1-0", hoặc null nếu không đúng dạng. */
export function trackOfNoteId(noteId: string): string | null {
  const match = TRACK_OF_ID.exec(noteId);
  return match ? `${match[1] ?? '0'}:${match[2]}` : null;
}

/** Làm mờ các nốt thuộc track đang tắt tiếng; tập rỗng thì bỏ làm mờ hết. */
export function applyMutedTracks(host: HTMLElement, muted: ReadonlySet<string>): void {
  host.querySelectorAll(`[${NOTE_ID_ATTR}]`).forEach((el) => {
    const track = muted.size > 0 ? trackOfNoteId(el.getAttribute(NOTE_ID_ATTR) ?? '') : null;
    el.classList.toggle(MUTED_CLASS, track !== null && muted.has(track));
  });
}

const MEASURE_OF_ID = /^(?:p\d+-)?m(\d+)-/;

/** Phần tử SVG đầu tiên của ô nhịp `measureIndex` (từ 0), hoặc null nếu chưa vẽ. */
export function firstElementOfMeasure(host: HTMLElement, measureIndex: number): Element | null {
  for (const el of Array.from(host.querySelectorAll(`[${NOTE_ID_ATTR}]`))) {
    if (Number(MEASURE_OF_ID.exec(el.getAttribute(NOTE_ID_ATTR) ?? '')?.[1]) === measureIndex) return el;
  }
  return null;
}

/** Chỉ số ô nhịp (từ 0) của nốt được bấm, hoặc null nếu bấm ra ngoài nốt. */
export function measureOfEvent(event: Event): number | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const id = target.closest(`[${NOTE_ID_ATTR}]`)?.getAttribute(NOTE_ID_ATTR);
  const match = id ? MEASURE_OF_ID.exec(id) : null;
  return match ? Number(match[1]) : null;
}

/**
 * Cuộn `scroller` để ô nhịp `measureIndex` nằm trong khung nhìn, chỉ khi nó đang ở ngoài (hoặc sát mép) để trang
 * không giật mỗi ô. Tôn trọng "giảm chuyển động" của hệ điều hành.
 */
export function keepMeasureVisible(scroller: HTMLElement, host: HTMLElement, measureIndex: number): void {
  const target = firstElementOfMeasure(host, measureIndex);
  if (!target) return;
  const box = scroller.getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return;
  const marginX = Math.min(64, box.width * 0.1);
  const marginY = Math.min(80, box.height * 0.12);
  const inside =
    rect.left >= box.left + marginX &&
    rect.right <= box.right - marginX &&
    rect.top >= box.top + marginY &&
    rect.bottom <= box.bottom - marginY;
  if (inside) return;
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ block: 'center', inline: 'center', behavior: reduce ? 'auto' : 'smooth' });
}
