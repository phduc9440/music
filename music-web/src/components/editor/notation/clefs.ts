/**
 * Khóa nhạc đang có hiệu lực tại một ô nhịp. Đây là nguồn duy nhất cho mọi nơi cần biết khóa: bấm khuông ra cao độ
 * (`staffHit`), cao độ mặc định khi nhập nốt (`durations`) và hộp thoại đổi khóa (`staves`). Tính cả
 * `<clef-octave-change>` (khóa Sol 8 dưới của bè Tenor).
 */
import { childOf } from '../core/commands';
import { STEPS, pitchToMidi } from '../notes/pitch';
import type { Step } from '../notes/pitch';
import type { ScoreDocument } from '../core/ScoreDocument';

export interface ClefInfo {
  /** 'G' | 'F' | 'C' (hoặc dấu khóa lạ như 'percussion'). */
  sign: string;
  /** Dòng kẻ (1 = dưới cùng) mà khóa chỉ vào. */
  line: number;
  /** Số quãng tám khóa dời cao độ: −1 cho Sol 8 dưới, +1 cho Fa 8 trên. */
  octaveChange: number;
}

/** Dòng mặc định của từng dấu khóa khi file không ghi <line>. */
const DEFAULT_LINE: Record<string, number> = { G: 2, F: 4, C: 3 };

/**
 * Khóa của khuông `staff` (bắt đầu từ 1) tại ô `measureIndex` của part: khai báo gần nhất từ đầu bài đến ô đó; chưa có
 * thì mặc định khóa Sol.
 */
export const clefAt = (doc: ScoreDocument, partIndex: number, staff: number, measureIndex: number): ClefInfo => {
  let found: ClefInfo = { sign: 'G', line: 2, octaveChange: 0 };
  doc.getMeasures(partIndex).forEach((measure, index) => {
    if (index > measureIndex) return;
    for (const attributes of Array.from(measure.children).filter((c) => c.tagName === 'attributes')) {
      for (const clef of Array.from(attributes.children).filter((c) => c.tagName === 'clef')) {
        if (Number(clef.getAttribute('number') ?? 1) !== staff) continue;
        const sign = childOf(clef, 'sign')?.textContent?.trim() || found.sign;
        const line = Number(childOf(clef, 'line')?.textContent);
        found = {
          sign,
          line: Number.isFinite(line) && line > 0 ? line : (DEFAULT_LINE[sign] ?? found.line),
          octaveChange: Number(childOf(clef, 'clef-octave-change')?.textContent ?? 0) || 0,
        };
      }
    }
  });
  return found;
};

/** Chỉ số bậc (C=0 … B=6, mỗi quãng tám 7) của nốt tự nhiên mà dòng kẻ chỉ vào ở khóa Sol/Fa/Đô (chưa tính quãng tám dời). */
const CLEF_ANCHOR: Record<string, number> = { G: 4 * 7 + 4, F: 3 * 7 + 3, C: 4 * 7 };

/** Chỉ số bậc của dòng kẻ trên cùng theo khóa `clef` (có tính quãng tám dời); null nếu không phải khóa Sol/Fa/Đô. */
export const topLineIndex = (clef: ClefInfo): number | null => {
  const anchor = CLEF_ANCHOR[clef.sign];
  return anchor === undefined ? null : anchor + (5 - clef.line) * 2 + clef.octaveChange * 7;
};

/** Cao độ tự nhiên (bậc + quãng tám) ở `line` bậc dưới dòng kẻ trên cùng có chỉ số `topIndex`. */
export const naturalAt = (topIndex: number, line: number): { step: Step; octave: number } => {
  const d = topIndex - line;
  return { step: STEPS[((d % 7) + 7) % 7], octave: Math.floor(d / 7) };
};

/**
 * Nốt tự nhiên ở dòng giữa của khuông (khóa Sol: Si4, khóa Fa: Rê3, khóa Sol 8 dưới: Si3). Dùng làm cao độ mặc định
 * khi biến dấu lặng thành nốt mà bè chưa có nốt nào trước đó.
 */
export const middleLinePitch = (
  doc: ScoreDocument,
  partIndex: number,
  staff: number,
  measureIndex: number,
): { step: Step; octave: number } => {
  const top = topLineIndex(clefAt(doc, partIndex, staff, measureIndex));
  // Dấu khóa lạ (gõ trống, tab...): coi như khóa Sol
  return naturalAt(top ?? CLEF_ANCHOR.G + 6, 4);
};

/** Cao độ MIDI của nốt ở dòng giữa khuông (xem {@link middleLinePitch}). */
export const middleLineMidi = (doc: ScoreDocument, partIndex: number, staff: number, measureIndex: number): number =>
  pitchToMidi({ ...middleLinePitch(doc, partIndex, staff, measureIndex), alter: 0 });
