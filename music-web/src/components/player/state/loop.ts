/**
 * Lặp đoạn A-B theo ô nhịp. Chỉ chứa hàm thuần để engine, hook và giao diện dùng chung một quy tắc.
 *
 * A và B là chỉ số ô nhịp trong bản nhạc (từ 0, như `PlayMeasure.index`), không phải thứ tự trong lượt phát. Dòng thời
 * gian đã mở lặp lại nên một ô có thể xuất hiện nhiều lần; mỗi lần xuất hiện của A cùng lần xuất hiện đầu tiên của B
 * sau nó tạo thành một "đoạn" (segment). Đang phát thì lặp đoạn đầu tiên mà chưa phát qua hết ô B (xem {@link pickSegment}).
 */
import type { Timeline } from '../engine/timeline';

export interface LoopSettings {
  /** Ô bắt đầu (từ 0), null nếu chưa đặt. */
  a: number | null;
  /** Ô kết thúc (từ 0, tính cả ô này), null nếu chưa đặt. */
  b: number | null;
  /** Bật lặp; chỉ có tác dụng khi đã đặt đủ A và B. */
  enabled: boolean;
  /** Đếm nhịp vào (một ô tiếng gõ) trước mỗi vòng. */
  countIn: boolean;
  /** Tăng tốc dần: mỗi vòng +5% tốc độ cho tới 100%. */
  speedUp: boolean;
}

export const NO_LOOP: LoopSettings = { a: null, b: null, enabled: false, countIn: false, speedUp: false };

/** Đoạn ngắn hơn thế (giây) bị bỏ qua để vòng lặp không quay vô hạn trong một lần hẹn giờ. */
export const MIN_LOOP_SECONDS = 0.05;

export interface LoopSegment {
  /** Thứ tự (trong lượt phát) của ô A và ô B. */
  startOrder: number;
  endOrder: number;
  /** Giây (ở tempo gốc): đầu ô A và cuối ô B. */
  start: number;
  end: number;
}

const fixIndex = (value: number | null, max: number): number | null =>
  value === null || !Number.isFinite(value) ? null : Math.min(max, Math.max(0, Math.trunc(value)));

/**
 * Kẹp A, B vào 0…measureCount-1, tự đổi chỗ nếu B < A, và chỉ giữ `enabled` khi đã có đủ cả hai. `measureCount` ≤ 0
 * (chưa có bản nhạc) thì không kẹp theo số ô.
 */
export function normalizeLoop(loop: LoopSettings, measureCount: number): LoopSettings {
  const max = measureCount > 0 ? measureCount - 1 : Number.MAX_SAFE_INTEGER;
  let a = fixIndex(loop.a, max);
  let b = fixIndex(loop.b, max);
  if (a !== null && b !== null && b < a) [a, b] = [b, a];
  return { a, b, enabled: loop.enabled && a !== null && b !== null, countIn: loop.countIn, speedUp: loop.speedUp };
}

export const sameLoop = (x: LoopSettings, y: LoopSettings): boolean =>
  x.a === y.a && x.b === y.b && x.enabled === y.enabled && x.countIn === y.countIn && x.speedUp === y.speedUp;

/** Đã đặt đủ A và B. */
export const isLoopComplete = (loop: LoopSettings): boolean => loop.a !== null && loop.b !== null;

/** Mọi đoạn của A-B trong lượt phát; rỗng nếu chưa đặt đủ hoặc B không bao giờ được phát sau A. */
export function loopSegments(timeline: Timeline, a: number | null, b: number | null): LoopSegment[] {
  if (a === null || b === null) return [];
  const measures = timeline.measures;
  const out: LoopSegment[] = [];
  for (let startOrder = 0; startOrder < measures.length; startOrder++) {
    if (measures[startOrder].index !== a) continue;
    let endOrder = -1;
    for (let o = startOrder; o < measures.length; o++) {
      if (measures[o].index === b) {
        endOrder = o;
        break;
      }
    }
    if (endOrder < 0) continue;
    const segment = {
      startOrder,
      endOrder,
      start: measures[startOrder].start,
      end: measures[endOrder].end,
    };
    if (segment.end - segment.start >= MIN_LOOP_SECONDS) out.push(segment);
  }
  return out;
}

/**
 * Đoạn đang áp dụng khi phát từ ô thứ `order` trong lượt phát: đoạn đầu tiên mà ô B của nó chưa bị phát qua. Đứng
 * trước A thì phát tiếp tới B rồi quay về A; đã qua hết các ô B thì không còn đoạn nào (phát tới hết bài).
 */
export function pickSegment(segments: readonly LoopSegment[], order: number): LoopSegment | null {
  return segments.find((s) => s.endOrder >= order) ?? null;
}

/** Đọc cài đặt từ dữ liệu không đáng tin (localStorage). */
export function sanitizeLoop(raw: unknown): LoopSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return NO_LOOP;
  const r = raw as Partial<Record<keyof LoopSettings, unknown>>;
  const index = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null);
  return normalizeLoop(
    {
      a: index(r.a),
      b: index(r.b),
      enabled: r.enabled === true,
      countIn: r.countIn === true,
      speedUp: r.speedUp === true,
    },
    0,
  );
}
