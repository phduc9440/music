/** Mô tả vùng chọn cho thanh trạng thái, ví dụ "G4 · nốt đen · ô 5 · tay phải". */
import { readPitch } from './commands';
import type { ScoreDocument } from './ScoreDocument';
import { dotCount, dotsLabel } from './durationCore';
import { ratioOf, tupletName } from './tuplets';
import { pitchName, spellMidi } from './pitch';

/** Tên trường độ theo giá trị <type> của MusicXML. */
const TYPE_LABELS: Record<string, string> = {
  whole: 'tròn',
  half: 'trắng',
  quarter: 'đen',
  eighth: 'móc đơn',
  '16th': 'móc kép',
  '32nd': 'móc ba',
  '64th': 'móc tứ',
  breve: 'tròn đôi',
};

/**
 * Mô tả các nốt đang chọn.
 * @returns chuỗi rỗng nếu chưa chọn gì; "N nốt đã chọn" nếu chọn nhiều; còn lại là mô tả chi tiết một nốt
 */
export function describeSelection(doc: ScoreDocument, selection: ReadonlySet<string>): string {
  const infos = [...selection].map((id) => doc.getInfo(id)).filter((n) => n !== undefined);
  if (infos.length === 0) return '';
  if (infos.length > 1) return `${infos.length} nốt đã chọn`;
  const info = infos[0];
  const typeText =
    Array.from(info.element.children)
      .find((c) => c.tagName === 'type')
      ?.textContent?.trim() ?? '';
  const duration = TYPE_LABELS[typeText];
  const pitch = readPitch(info.element);
  const ratio = ratioOf(info.element);
  // Nhạc cụ chuyển âm: ghi thêm cao độ nghe thấy, ví dụ "C5 (nghe là Bb4)"
  const written = info.midi;
  const sounding = info.soundingMidi;
  const heard =
    pitch && written !== null && sounding !== null && sounding !== written && Number.isInteger(sounding)
      ? ` (nghe là ${pitchName(spellMidi(sounding, doc.keyAtPart(info.partIndex, info.measureIndex), sounding < written ? -1 : 1))})`
      : '';
  const parts = [
    pitch ? `${pitchName(pitch)}${heard}` : 'Dấu lặng',
    duration
      ? `${info.isRest ? 'lặng' : 'nốt'} ${duration}${dotsLabel(dotCount(info.element))}${ratio ? ` (${tupletName(ratio)})` : ''}`
      : '',
    `ô ${info.measureIndex + 1}`,
    doc.staffCountOfPart(info.partIndex) >= 2 ? (info.staff === 1 ? 'tay phải' : 'tay trái') : '',
  ];
  return parts.filter(Boolean).join(' · ');
}
