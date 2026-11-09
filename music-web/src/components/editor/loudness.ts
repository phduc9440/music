/**
 * Mức to nhỏ → độ to nghe được. Chỉ chứa hàm thuần, dùng chung cho lịch phát (playback.ts), sampler piano và các giọng
 * tổng hợp (instruments.ts) để pp, mf, ff... cách nhau đúng bằng chừng ấy dB ở mọi nơi.
 *
 * Hai khái niệm:
 * - `gain` (0–1, mf = 0,8) là âm lượng LOGIC của một nốt, cũng là dữ liệu bàn giao cho phần chấm điểm.
 * - `drive` (dB so với mf) là độ lớn tín hiệu đưa vào chuỗi âm thanh chung (xem getMaster): pp nhỏ hơn mf chừng 12 dB,
 *   ff to hơn chừng 4 dB. Bộ nén của getMaster chỉ còn là bộ chống vỡ tiếng nên không làm phẳng các mức này nữa; các mốc
 *   dưới đây đã tính cả đường cong của bộ nén (nốt càng to càng được nén nhiều hơn một chút).
 */

/** Vận tốc MIDI và âm lượng của mức mf: nốt chưa ghi mức to nhỏ nào được phát ở mức này. */
export const DEFAULT_VELOCITY = 83;
export const DEFAULT_GAIN = 0.8;

/** Đổi vận tốc MIDI sang âm lượng 0–1 (mf = 0,8; tăng giảm dần chứ không tuyến tính hoàn toàn). */
export const velocityGain = (velocity: number): number =>
  Math.min(1, DEFAULT_GAIN * Math.pow(Math.max(velocity, 1) / DEFAULT_VELOCITY, 0.6));

/** Ngược lại của `velocityGain` (âm lượng 0–1 → vận tốc MIDI xấp xỉ). */
export const gainVelocity = (gain: number): number =>
  DEFAULT_VELOCITY * Math.pow(Math.max(gain, 1e-3) / DEFAULT_GAIN, 1 / 0.6);

/** Mốc (vận tốc MIDI, dB so với mf): ppp, pp, p, mp, mf, f, ff, fff. */
const DRIVE_DB: readonly (readonly [number, number])[] = [
  [1, -30],
  [10, -23],
  [20, -17],
  [36, -12.5],
  [54, -8.5],
  [69, -4.5],
  [83, 0],
  [98, 2.2],
  [112, 4.4],
  // gain tối đa 1 tương ứng vận tốc ≈ 120 (xem gainVelocity), nên fff nằm ở mốc này
  [120.4, 6.9],
  [127, 7.2],
];

/** Độ lớn tín hiệu (dB so với mf) của một nốt có âm lượng `level` (0–1, mf = 0,8). */
export function levelDriveDb(level: number): number {
  const velocity = gainVelocity(level);
  const first = DRIVE_DB[0];
  const last = DRIVE_DB[DRIVE_DB.length - 1];
  if (velocity <= first[0]) return first[1];
  if (velocity >= last[0]) return last[1];
  for (let i = 1; i < DRIVE_DB.length; i++) {
    const [v1, d1] = DRIVE_DB[i];
    if (velocity <= v1) {
      const [v0, d0] = DRIVE_DB[i - 1];
      return d0 + ((d1 - d0) * (velocity - v0)) / (v1 - v0);
    }
  }
  return last[1];
}

/** Hệ số biên độ tương ứng với `levelDriveDb` (mf = 1). */
export const levelAmplitude = (level: number): number => Math.pow(10, levelDriveDb(level) / 20);
