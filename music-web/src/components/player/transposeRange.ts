/** Giới hạn chuyển giọng khi nghe và âm vực đàn piano (A0–C8). */
import type { Timeline } from './timeline';

export const MIN_TRANSPOSE = -12;
export const MAX_TRANSPOSE = 12;
export const PIANO_MIN_MIDI = 21;
export const PIANO_MAX_MIDI = 108;

/** Làm tròn và kẹp vào −12…+12; không phải số thì về 0. */
export const clampTranspose = (value: number): number =>
  Number.isFinite(value) ? Math.min(MAX_TRANSPOSE, Math.max(MIN_TRANSPOSE, Math.round(value))) : 0;

/** Nốt `midi` sau khi chuyển `semitones` nửa cung có còn trong âm vực piano không. */
export const inPianoRange = (midi: number, semitones: number): boolean => {
  const shifted = midi + semitones;
  return shifted >= PIANO_MIN_MIDI && shifted <= PIANO_MAX_MIDI;
};

/** Số nốt (sự kiện trong dòng thời gian) vượt âm vực piano sau khi chuyển `semitones` nửa cung; các nốt này bị bỏ khi phát. */
export function countOutOfRange(timeline: Timeline, semitones: number): number {
  if (semitones === 0) return 0;
  let count = 0;
  for (const event of timeline.events) if (!inPianoRange(event.midi, semitones)) count += 1;
  return count;
}
