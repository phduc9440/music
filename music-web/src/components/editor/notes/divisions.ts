/**
 * Chia nhỏ divisions của một part khi cần một độ dài không chia hết (ví dụ nốt móc đơn của chùm ba trong bản nhạc
 * divisions = 1). Việc này sửa MỌI <divisions>, <duration> và <offset> của part nên phải chạy bên trong
 * `runStructural` để hoàn tác khôi phục lại đủ.
 */
import type { ScoreDocument } from '../core/ScoreDocument';

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/**
 * Hệ số nguyên nhỏ nhất `f` để `value × f` chia hết cho `denominator`.
 * Ví dụ chia một nốt đen (value = divisions = 1) làm 3 phần: `divisionsFactor(1, 3)` = 3.
 */
export const divisionsFactor = (value: number, denominator: number): number =>
  denominator / gcd(Math.abs(value), denominator);

/** Nhân divisions của part `partIndex` (và mọi độ dài tính theo divisions) lên `factor` lần. */
export function scaleDivisions(doc: ScoreDocument, partIndex: number, factor: number): void {
  if (factor === 1) return;
  for (const measure of doc.getMeasures(partIndex)) {
    for (const tag of ['divisions', 'duration', 'offset']) {
      for (const el of Array.from(measure.getElementsByTagName(tag))) {
        const value = Number(el.textContent);
        if (el.textContent?.trim() && Number.isFinite(value)) el.textContent = String(value * factor);
      }
    }
  }
}

/**
 * Bảo đảm mọi độ dài `divisions / denominator` ở ô `measureIndex` của part là số nguyên: nếu chưa thì nhân cả part
 * lên hệ số nhỏ nhất đủ dùng.
 * @returns hệ số đã nhân (1 = không phải đổi gì)
 */
export function ensureDivisible(
  doc: ScoreDocument,
  partIndex: number,
  measureIndex: number,
  denominator: number,
): number {
  const factor = divisionsFactor(doc.divisionsAtPart(partIndex, measureIndex), denominator);
  scaleDivisions(doc, partIndex, factor);
  return factor;
}
