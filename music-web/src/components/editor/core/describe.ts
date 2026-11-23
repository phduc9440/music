/** Mô tả vùng chọn cho thanh trạng thái, ví dụ "G4 · nốt đen · ô 5 · tay phải". */
import { hasKey, t } from '../../../i18n/core';
import { readPitch } from './commands';
import type { ScoreDocument } from './ScoreDocument';
import { dotCount, dotsLabel } from '../notes/durationCore';
import { ratioOf, tupletName } from '../notes/tuplets';
import { pitchName, spellMidi } from '../notes/pitch';

/** Tên trường độ theo giá trị <type> của MusicXML; không có bản dịch thì trả về chuỗi rỗng. */
const typeLabel = (type: string): string =>
  hasKey(`editor.describe.type.${type}`) ? t(`editor.describe.type.${type}`) : '';

/**
 * Mô tả các nốt đang chọn.
 * @returns chuỗi rỗng nếu chưa chọn gì; "N nốt đã chọn" nếu chọn nhiều; còn lại là mô tả chi tiết một nốt
 */
export function describeSelection(doc: ScoreDocument, selection: ReadonlySet<string>): string {
  const infos = [...selection].map((id) => doc.getInfo(id)).filter((n) => n !== undefined);
  if (infos.length === 0) return '';
  if (infos.length > 1) return t('editor.describe.selected', { count: infos.length });
  const info = infos[0];
  const typeText =
    Array.from(info.element.children)
      .find((c) => c.tagName === 'type')
      ?.textContent?.trim() ?? '';
  const duration = typeLabel(typeText);
  const pitch = readPitch(info.element);
  const ratio = ratioOf(info.element);
  // Nhạc cụ chuyển âm: ghi thêm cao độ nghe thấy, ví dụ "C5 (nghe là Bb4)"
  const written = info.midi;
  const sounding = info.soundingMidi;
  const heard =
    pitch && written !== null && sounding !== null && sounding !== written && Number.isInteger(sounding)
      ? ` (${t('editor.describe.heard', { pitch: pitchName(spellMidi(sounding, doc.keyAtPart(info.partIndex, info.measureIndex), sounding < written ? -1 : 1)) })})`
      : '';
  const parts = [
    pitch ? `${pitchName(pitch)}${heard}` : t('editor.describe.rest'),
    duration
      ? `${t(info.isRest ? 'editor.describe.restOf' : 'editor.describe.noteOf', { duration: `${duration}${dotsLabel(dotCount(info.element))}` })}${ratio ? ` (${tupletName(ratio)})` : ''}`
      : '',
    t('editor.describe.measure', { n: info.measureIndex + 1 }),
    doc.staffCountOfPart(info.partIndex) >= 2
      ? t(info.staff === 1 ? 'editor.describe.rightHand' : 'editor.describe.leftHand')
      : '',
  ];
  return parts.filter(Boolean).join(' · ');
}
