/**
 * Chuyển giọng: đọc khóa nhạc đầu bài, chọn cách viết giọng mới ít dấu hóa nhất và gọi tên giọng bằng tiếng Việt.
 * Chỉ chứa hàm thuần (phần Player dùng để hiện nhãn "G trưởng → A trưởng"; phần áp dụng vào bản nhạc dùng lại ở đây).
 */
import type { ScoreDocument } from './ScoreDocument';

/** Khóa nhạc: số dấu hóa (dương = thăng, âm = giáng) và thể trưởng / thứ. */
export interface KeySignature {
  fifths: number;
  minor: boolean;
}

export const MAX_FIFTHS = 7;

const MAJOR_TONICS = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
const MINOR_TONICS = ['Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#'];

/** Khóa nhạc khai báo đầu tiên của part đầu (mặc định Đô trưởng khi bản nhạc không khai báo). */
export function readStartingKey(doc: ScoreDocument): KeySignature {
  for (const measure of doc.getMeasures(0)) {
    const key = measure.getElementsByTagName('key')[0];
    if (!key) continue;
    const fifths = Number(key.getElementsByTagName('fifths')[0]?.textContent);
    const mode = key.getElementsByTagName('mode')[0]?.textContent?.trim().toLowerCase();
    return {
      fifths: Number.isInteger(fifths) ? Math.max(-MAX_FIFTHS, Math.min(MAX_FIFTHS, fifths)) : 0,
      minor: mode === 'minor',
    };
  }
  return { fifths: 0, minor: false };
}

/** Số dấu hóa của giọng trưởng có âm chủ ở cao độ `pitchClass` (0 = C … 11 = B): chọn cách viết ít dấu hóa nhất. */
export function fifthsOfMajorTonic(pitchClass: number): number {
  const sharpSide = (((pitchClass * 7) % 12) + 12) % 12; // 0…11 dấu thăng
  const flatSide = sharpSide - 12; // cùng âm chủ viết bằng dấu giáng
  const sharpOk = sharpSide <= MAX_FIFTHS;
  const flatOk = flatSide >= -MAX_FIFTHS;
  if (sharpOk && flatOk) return Math.abs(flatSide) < sharpSide ? flatSide : sharpSide; // hòa thì chọn dấu thăng
  return sharpOk ? sharpSide : flatSide;
}

/**
 * Số dấu hóa của giọng mới sau khi chuyển `semitones` nửa cung. Giọng thứ đi theo giọng trưởng song song của nó nên
 * cùng một công thức; hai cách viết bằng nhau (ví dụ F♯ và G♭) thì chọn dấu thăng.
 */
export function transposeFifths(fifths: number, semitones: number): number {
  const majorPitchClass = (((fifths * 7) % 12) + 12) % 12;
  return fifthsOfMajorTonic((((majorPitchClass + semitones) % 12) + 12) % 12);
}

export function transposeKey(key: KeySignature, semitones: number): KeySignature {
  return { fifths: transposeFifths(key.fifths, semitones), minor: key.minor };
}

const pretty = (tonic: string): string => tonic.replace('#', '♯').replace(/^([A-G])b$/, '$1♭');

/** Tên giọng tiếng Việt, ví dụ "G trưởng", "B♭ thứ". */
export function keyName(key: KeySignature): string {
  const index = Math.max(-MAX_FIFTHS, Math.min(MAX_FIFTHS, key.fifths)) + MAX_FIFTHS;
  return `${pretty((key.minor ? MINOR_TONICS : MAJOR_TONICS)[index])} ${key.minor ? 'thứ' : 'trưởng'}`;
}

/** "+2" / "-3" / "0" (dấu trừ là ký tự "−" cho dễ nhìn). */
export const signedSemitones = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

/** Nhãn mô tả giọng: "G trưởng → A trưởng"; chưa chuyển thì chỉ "G trưởng (giọng gốc)". */
export function describeTranspose(key: KeySignature, semitones: number): string {
  if (semitones === 0) return `${keyName(key)} (giọng gốc)`;
  return `${keyName(key)} → ${keyName(transposeKey(key, semitones))}`;
}
