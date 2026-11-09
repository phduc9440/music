/**
 * Dấu 8va/8vb (`<octave-shift>`): nốt trong đoạn được VẼ cao hơn hoặc thấp hơn cao độ thật đúng một (hoặc hai, ba)
 * quãng tám. `<pitch>` luôn là cao độ nghe thấy, nên khi bấm lên khuông để chèn nốt trong đoạn 8va thì cao độ thật
 * phải cộng thêm phần lệch này.
 */
import { toOnsetKey } from './ScoreDocument';
import type { ScoreDocument } from './ScoreDocument';

const numberIn = (parent: Element, tag: string): number | null => {
  const text = Array.from(parent.children)
    .find((c) => c.tagName === tag)
    ?.textContent?.trim();
  const value = Number(text);
  return text && Number.isFinite(value) ? value : null;
};

/** Số quãng tám ứng với `size` của <octave-shift>: 8 → 1, 15 → 2, 22 → 3. */
export const octavesOfSize = (size: number): number => Math.max(1, Math.round((size - 1) / 7));

/**
 * Phần lệch quãng tám (cao độ thật − cao độ vẽ) của khuông `staff` tại thời điểm `onsetKey` (cùng đơn vị với
 * `NoteInfo.onsetKey`) trong ô `measureIndex`: +1 trong đoạn 8va (vẽ thấp hơn nghe một quãng tám), −1 trong đoạn 8vb,
 * 0 nếu không có đoạn nào. Vạch dừng nằm đúng ở `onsetKey` đã hết hiệu lực; truyền `Infinity` để hỏi trạng thái cuối ô.
 */
export function octaveShiftAt(
  doc: ScoreDocument,
  partIndex: number,
  staff: number,
  measureIndex: number,
  onsetKey: number,
): number {
  const measures = doc.getMeasures(partIndex);
  let shift = 0;
  for (let m = 0; m <= measureIndex && m < measures.length; m++) {
    const divisions = doc.divisionsAtPart(partIndex, m) || 1;
    let cursor = 0;
    for (const child of Array.from(measures[m].children)) {
      if (child.tagName === 'note') {
        const isChord = Array.from(child.children).some((c) => c.tagName === 'chord');
        const isGrace = Array.from(child.children).some((c) => c.tagName === 'grace');
        if (!isChord && !isGrace) cursor += numberIn(child, 'duration') ?? 0;
      } else if (child.tagName === 'backup') {
        cursor -= numberIn(child, 'duration') ?? 0;
      } else if (child.tagName === 'forward') {
        cursor += numberIn(child, 'duration') ?? 0;
      } else if (child.tagName === 'direction') {
        if ((numberIn(child, 'staff') ?? 1) !== staff) continue;
        // Hướng đặt ở vị trí con trỏ trước phần tử này, nên dùng cursor hiện tại (chưa tính offset)
        const at = toOnsetKey(cursor / (4 * divisions));
        if (m === measureIndex && at > onsetKey) continue;
        for (const el of Array.from(child.getElementsByTagName('octave-shift'))) {
          const type = el.getAttribute('type');
          const octaves = octavesOfSize(Number(el.getAttribute('size') ?? 8) || 8);
          if (type === 'down') shift = octaves;
          else if (type === 'up') shift = -octaves;
          else if (type === 'stop') shift = 0;
        }
      }
    }
  }
  return shift;
}
