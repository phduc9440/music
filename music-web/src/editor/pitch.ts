/**
 * Hàm thuần xử lý cao độ cho trình chỉnh sửa: đổi bậc theo điệu thức, nửa cung, quãng tám, giới hạn A0–C8 và
 * tính dấu hóa hiển thị theo trạng thái trong ô nhịp. Không phụ thuộc DOM nên dễ kiểm thử.
 */

/** Tên bậc theo thứ tự trong gam C. */
export const STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
export type Step = (typeof STEPS)[number];

/** Cao độ ở dạng MusicXML: bậc, dấu hóa thực (−1 giáng, 0, +1 thăng) và quãng tám. */
export interface Pitch {
  step: Step;
  alter: number;
  octave: number;
}

/** Cao độ MIDI thấp nhất / cao nhất cho phép: A0 và C8. */
export const MIDI_MIN = 21;
export const MIDI_MAX = 108;

const STEP_SEMITONE: Record<Step, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** Thứ tự dấu thăng / dấu giáng thêm vào khóa nhạc. */
const SHARP_ORDER: Step[] = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER: Step[] = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

/** Cách đổi cao độ. */
export type PitchOp = 'stepUp' | 'stepDown' | 'semitoneUp' | 'semitoneDown' | 'octaveUp' | 'octaveDown';

/** Lý do không đổi được. */
export type PitchFailure = 'range' | 'rest';

export const isStep = (value: string): value is Step => (STEPS as readonly string[]).includes(value);

/** Cao độ MIDI của một cao độ MusicXML (C4 = 60). */
export const pitchToMidi = (pitch: Pitch): number => (pitch.octave + 1) * 12 + STEP_SEMITONE[pitch.step] + pitch.alter;

/** Dấu hóa của một bậc theo khóa nhạc có `fifths` dấu thăng (dương) hoặc giáng (âm). */
export const keyAlter = (fifths: number, step: Step): number => {
  if (fifths > 0) return SHARP_ORDER.slice(0, Math.min(7, fifths)).includes(step) ? 1 : 0;
  if (fifths < 0) return FLAT_ORDER.slice(0, Math.min(7, -fifths)).includes(step) ? -1 : 0;
  return 0;
};

/** Mọi cách viết (bậc, dấu hóa −1..+1, quãng tám) của một cao độ MIDI. */
const spellings = (midi: number): Pitch[] => {
  const list: Pitch[] = [];
  for (const step of STEPS) {
    for (const alter of [0, 1, -1]) {
      const rest = midi - alter - STEP_SEMITONE[step];
      if (rest % 12 === 0) list.push({ step, alter, octave: rest / 12 - 1 });
    }
  }
  return list;
};

/**
 * Chọn cách viết một cao độ MIDI. Ưu tiên: khớp khóa nhạc, rồi nốt tự nhiên, rồi theo hướng di chuyển
 * (đi lên ưu tiên thăng, đi xuống ưu tiên giáng).
 */
export const spellMidi = (midi: number, fifths: number, direction: 1 | -1): Pitch => {
  const rank = (p: Pitch): number => {
    if (p.alter === keyAlter(fifths, p.step)) return 0;
    if (p.alter === 0) return 1;
    return p.alter === direction ? 2 : 3;
  };
  return spellings(midi).sort((a, b) => rank(a) - rank(b))[0];
};

/** Có nằm trong khoảng A0–C8 không. */
export const inRange = (midi: number): boolean => midi >= MIDI_MIN && midi <= MIDI_MAX;

/**
 * Tính cao độ mới sau một thao tác.
 * @param pitch cao độ hiện tại
 * @param op thao tác
 * @param fifths số dấu hóa của khóa nhạc tại ô đang sửa
 * @returns cao độ mới, hoặc 'range' nếu vượt A0–C8
 */
export const movePitch = (pitch: Pitch, op: PitchOp, fifths: number): Pitch | 'range' => {
  let next: Pitch;
  if (op === 'octaveUp' || op === 'octaveDown') {
    next = { ...pitch, octave: pitch.octave + (op === 'octaveUp' ? 1 : -1) };
  } else if (op === 'semitoneUp' || op === 'semitoneDown') {
    const direction = op === 'semitoneUp' ? 1 : -1;
    next = spellMidi(pitchToMidi(pitch) + direction, fifths, direction);
  } else {
    const direction = op === 'stepUp' ? 1 : -1;
    const index = STEPS.indexOf(pitch.step) + direction;
    const step = STEPS[(index + 7) % 7];
    const octave = pitch.octave + (index > 6 ? 1 : index < 0 ? -1 : 0);
    next = { step, alter: keyAlter(fifths, step), octave };
  }
  return inRange(pitchToMidi(next)) ? next : 'range';
};

/** Tên cao độ để hiển thị, ví dụ `F#4`, `Bb3`. */
export const pitchName = (pitch: Pitch): string =>
  `${pitch.step}${pitch.alter > 0 ? '#'.repeat(pitch.alter) : pitch.alter < 0 ? 'b'.repeat(-pitch.alter) : ''}${pitch.octave}`;

/** Tần số (Hz) của một cao độ MIDI, A4 = 440Hz. */
export const midiToFrequency = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

/** Tên dấu hóa hiển thị trong MusicXML (`<accidental>`) cho một giá trị alter. */
export const accidentalName = (alter: number): string =>
  alter >= 2 ? 'double-sharp' : alter > 0 ? 'sharp' : alter <= -2 ? 'flat-flat' : alter < 0 ? 'flat' : 'natural';

/**
 * Trạng thái dấu hóa trong một ô nhịp (theo khuông): nốt đã ghi dấu hóa thì các nốt sau cùng bậc và cùng quãng
 * tám trong ô không cần ghi lại; hết ô thì trở về khóa nhạc.
 */
export class AccidentalState {
  private readonly fifths: number;
  private readonly state = new Map<string, number>();

  constructor(fifths: number) {
    this.fifths = fifths;
  }

  /**
   * Ghi nhận một nốt và cho biết có cần vẽ dấu hóa không.
   * @returns alter cần hiển thị, hoặc null nếu không cần vẽ dấu hóa
   */
  visit(pitch: Pitch): number | null {
    const key = `${pitch.step}${pitch.octave}`;
    const current = this.state.get(key) ?? keyAlter(this.fifths, pitch.step);
    this.state.set(key, pitch.alter);
    return current === pitch.alter ? null : pitch.alter;
  }
}
