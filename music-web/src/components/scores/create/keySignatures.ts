import type { KeyMode } from '../../../types';
import { t } from '../../../i18n/core';

/** Hóa biểu theo số dấu hóa: 15 khóa từ 7 giáng (−7) đến 7 thăng (+7). */
export const KEY_FIFTHS = Array.from({ length: 15 }, (_, i) => i - 7);

/** Các nốt xếp theo vòng quãng năm, bắt đầu từ Fa (Fa → Đô → Sol → Rê → La → Mi → Si). */
const FIFTHS_LETTERS = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];

/**
 * Âm chủ của khóa. Khóa trưởng có số dấu hóa n thì âm chủ nằm ở vị trí n trên vòng quãng năm; khóa thứ cùng hóa biểu có
 * âm chủ thấp hơn một quãng ba thứ, tức vị trí n + 3.
 */
const tonic = (fifths: number, mode: KeyMode) => {
  const position = fifths + (mode === 'MINOR' ? 3 : 0) + 1; // Fa nằm ở vị trí 0 của vòng, ứng với −1 dấu hóa
  const letter = FIFTHS_LETTERS[((position % 7) + 7) % 7];
  return { letter, accidental: Math.floor(position / 7) };
};

/** Tên khóa theo ngôn ngữ đang dùng, ví dụ "Si giáng trưởng" hoặc "F sharp minor". */
export function keyName(fifths: number, mode: KeyMode): string {
  const { letter, accidental } = tonic(fifths, mode);
  const parts = [t(`upload.create.notes.${letter}`)];
  if (accidental > 0) parts.push(t('upload.create.sharp'));
  if (accidental < 0) parts.push(t('upload.create.flat'));
  parts.push(t(mode === 'MINOR' ? 'upload.create.minor' : 'upload.create.major'));
  return parts.join(' ');
}

/** Số dấu hóa ở hóa biểu: "không dấu", "2♯", "3♭". */
export function accidentalsLabel(fifths: number): string {
  if (fifths === 0) return t('upload.create.noAccidentals');
  return fifths > 0 ? `${fifths}♯` : `${-fifths}♭`;
}
