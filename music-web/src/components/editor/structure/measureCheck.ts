/**
 * Kiểm tra độ dài mỗi ô nhịp: tổng <duration> của từng bè (bỏ nốt hợp âm <chord/> và nốt trang trí <grace/>) phải
 * bằng số chỉ nhịp × divisions. Ô sai được vẽ viền đỏ và báo trên thanh trạng thái.
 */
import { commitEdit } from '../core/commands';
import type { EditResult, Touched } from '../core/commands';
import { durationLabel, splitRests } from '../notes/durationCore';
import { formatNumber } from '../../../i18n/core';
import type { ScoreDocument } from '../core/ScoreDocument';
import { t } from '../../../i18n/core';

/** Một ô nhịp có độ dài sai. */
export interface MeasureIssue {
  /** Chỉ số ô nhịp bắt đầu từ 0. */
  measureIndex: number;
  /** Chỉ số part chứa lỗi. */
  partIndex: number;
  /** Chênh lệch tính bằng phách (dương = thừa, âm = thiếu); nhịp kép tính phách là nốt chấm dôi. */
  diffBeats: number;
  /** Câu tiếng Việt, ví dụ "Ô 12 thiếu 1 phách", "Ô 3 thiếu 2 móc đơn". */
  message: string;
}

const numberOf = (parent: Element, tag: string): number => {
  const text = Array.from(parent.children)
    .find((c) => c.tagName === tag)
    ?.textContent?.trim();
  const value = Number(text);
  return text && Number.isFinite(value) ? value : 0;
};

/** Định dạng số phách theo ngôn ngữ hiện tại (tối đa 2 chữ số thập phân). */
const formatBeats = (value: number): string => formatNumber(Math.round(Math.abs(value) * 100) / 100);

/** Nhịp kép (6/8, 9/8, 12/8, 6/16...): phách là nốt chấm dôi, dài 3 đơn vị của loại phách. */
export const isCompound = (beats: number, beatType: number): boolean => beatType >= 8 && beats > 3 && beats % 3 === 0;

const WHOLE_NOTE_NAMES = new Set(['breve', 'whole', 'half', 'quarter']);

/**
 * Câu mô tả phần thừa/thiếu `diffQuarters` (số nốt đen, đã lấy trị tuyệt đối), ví dụ "1 phách", "2 móc đơn",
 * "1 nốt đen chấm". Trả về null nếu không diễn đạt được bằng hình nốt (ví dụ ô có chùm lẻ): khi đó dùng số phách.
 */
const describeGap = (diffQuarters: number, beatType: number, compound: boolean): string | null => {
  const unit = 4 / beatType;
  const beat = compound ? unit * 3 : unit;
  const near = (x: number) => Math.abs(x - Math.round(x)) < 1e-9;
  if (near(diffQuarters / beat)) return t('editor.check.beats', { count: Math.round(diffQuarters / beat) });
  // Nhịp kép: đếm theo đơn vị của loại phách (2 móc đơn) thay vì ghép thành nốt chấm dôi
  if (compound && near(diffQuarters / unit)) {
    const type = beatType === 8 ? 'eighth' : beatType === 16 ? '16th' : beatType === 32 ? '32nd' : null;
    if (type) return t('editor.check.group', { count: Math.round(diffQuarters / unit), text: durationLabel(type) });
  }
  const pieces = splitRests(Math.round(diffQuarters * 64), 64);
  if (!pieces) return null;
  const groups: { text: string; count: number }[] = [];
  for (const p of pieces) {
    const name = durationLabel(p.type);
    const dots = p.dots === 1 ? t('editor.check.dot') : p.dots === 2 ? t('editor.check.dotDouble') : '';
    const text = WHOLE_NOTE_NAMES.has(p.type) ? t('editor.check.noteOf', { name, dots }) : `${name}${dots}`;
    const last = groups[groups.length - 1];
    if (last && last.text === text) last.count += 1;
    else groups.push({ text, count: 1 });
  }
  return groups.map((g) => t('editor.check.group', { count: g.count, text: g.text })).join(t('editor.check.and'));
};

/**
 * Tìm các ô nhịp có độ dài sai. Bỏ qua ô nhịp ngắn đánh dấu `implicit="yes"` (ô lấy đà) và ô không có nốt.
 * @returns mỗi ô nhịp tối đa một lỗi (lỗi lệch nhiều nhất), sắp theo thứ tự ô
 */
export function checkMeasures(doc: ScoreDocument): MeasureIssue[] {
  const worst = new Map<number, MeasureIssue>();
  for (let partIndex = 0; partIndex < doc.partCount; partIndex++) {
    doc.getMeasures(partIndex).forEach((measure, measureIndex) => {
      if (measure.getAttribute('implicit') === 'yes') return;
      const totals = new Map<number, number>();
      for (const child of Array.from(measure.children)) {
        if (child.tagName === 'note') {
          const skip = Array.from(child.children).some((c) => c.tagName === 'chord' || c.tagName === 'grace');
          if (skip) continue;
          const voice = numberOf(child, 'voice') || 1;
          totals.set(voice, (totals.get(voice) ?? 0) + numberOf(child, 'duration'));
        } else if (child.tagName === 'forward') {
          const voice = numberOf(child, 'voice') || 1;
          totals.set(voice, (totals.get(voice) ?? 0) + numberOf(child, 'duration'));
        }
      }
      if (totals.size === 0) return;
      const { beats, beatType, free } = doc.timeAt(measureIndex);
      if (free) return; // nhịp tự do: ô nhịp dài tùy ý
      const divisions = doc.divisionsAtPart(partIndex, measureIndex);
      const expected = (beats * divisions * 4) / beatType;
      const compound = isCompound(beats, beatType);
      // Nhịp kép: một phách là nốt chấm dôi (3 đơn vị của loại phách)
      const beatLength = ((divisions * 4) / beatType) * (compound ? 3 : 1);
      for (const total of totals.values()) {
        if (total === expected) continue;
        const diffBeats = (total - expected) / beatLength;
        const current = worst.get(measureIndex);
        if (current && Math.abs(current.diffBeats) >= Math.abs(diffBeats)) continue;
        worst.set(measureIndex, {
          measureIndex,
          partIndex,
          diffBeats,
          message: t(diffBeats < 0 ? 'editor.check.short' : 'editor.check.long', {
            n: measureIndex + 1,
            gap:
              describeGap(Math.abs(total - expected) / divisions, beatType, compound) ??
              t('editor.check.beatsDecimal', { value: formatBeats(diffBeats) }),
          }),
        });
      }
    });
  }
  return [...worst.values()].sort((a, b) => a.measureIndex - b.measureIndex);
}

/**
 * Xác nhận ô nhịp có độ dài "sai" thực ra là đúng (ví dụ ô lấy đà, ô cuối ngắn): đánh dấu `implicit="yes"` theo
 * chuẩn MusicXML ở ô đó của mọi part, nên được lưu cùng bản nhạc và hoàn tác được.
 */
export function confirmMeasure(doc: ScoreDocument, measureIndex: number): EditResult {
  const touched: Touched = new Map();
  const targets: Element[] = [];
  for (let partIndex = 0; partIndex < doc.partCount; partIndex++) {
    const measure = doc.getMeasure(partIndex, measureIndex);
    if (!measure || measure.getAttribute('implicit') === 'yes') continue;
    targets.push(measure);
    touched.set(`${partIndex}|${measureIndex}`, { partIndex, measureIndex });
  }
  if (targets.length === 0) return { ok: false, reason: 'unchanged' };
  const command = commitEdit(doc, t('editor.cmd.measure.confirm', { n: measureIndex + 1 }), touched, [], () => {
    targets.forEach((m) => m.setAttribute('implicit', 'yes'));
  });
  return { ok: true, command };
}
