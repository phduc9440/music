import { t } from '../../../i18n/core';

/** Một bè giai điệu có thể chọn cho gợi ý hợp âm: part (từ 0) và khuông trong part (từ 1). */
export interface MelodyChoice {
  partIndex: number;
  staff: number;
  label: string;
}

const childText = (el: Element | undefined, tag: string): string =>
  el?.getElementsByTagName(tag)[0]?.textContent?.trim() ?? '';

/**
 * Các bè giai điệu của bản nhạc (CH-04): mỗi khuông của mỗi part có nốt có cao độ. Thứ tự khớp mặc định của music-ai,
 * nên lựa chọn đầu tiên là cách AI tự chọn khi không truyền gì (part đầu có cao độ, khuông 1).
 */
export function melodyChoicesOf(root: Document | Element): MelodyChoice[] {
  const scoreParts = Array.from(root.getElementsByTagName('score-part'));
  const parts = Array.from(root.getElementsByTagName('part'));
  const choices: MelodyChoice[] = [];
  parts.forEach((part, partIndex) => {
    const notes = Array.from(part.getElementsByTagName('note')).filter((n) => n.getElementsByTagName('pitch').length);
    if (notes.length === 0) return;
    let staves = 1;
    for (const el of Array.from(part.getElementsByTagName('staves'))) {
      staves = Math.max(staves, Number(el.textContent) || 1);
    }
    const used = new Set(notes.map((n) => Number(childText(n, 'staff')) || 1));
    const name = childText(scoreParts[partIndex], 'part-name') || t('chords.melody.part', { n: partIndex + 1 });
    for (let staff = 1; staff <= Math.min(staves, 4); staff++) {
      if (!used.has(staff)) continue;
      choices.push({
        partIndex,
        staff,
        label: staves > 1 ? t('chords.melody.partStaff', { name, staff }) : name,
      });
    }
  });
  return choices;
}
