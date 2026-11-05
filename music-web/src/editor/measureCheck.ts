/**
 * Kiểm tra độ dài mỗi ô nhịp: tổng <duration> của từng bè (bỏ nốt hợp âm <chord/> và nốt trang trí <grace/>) phải
 * bằng số chỉ nhịp × divisions. Ô sai được vẽ viền đỏ và báo trên thanh trạng thái.
 */
import { commitEdit } from './commands';
import type { EditResult, Touched } from './commands';
import type { ScoreDocument } from './ScoreDocument';

/** Một ô nhịp có độ dài sai. */
export interface MeasureIssue {
  /** Chỉ số ô nhịp bắt đầu từ 0. */
  measureIndex: number;
  /** Chỉ số part chứa lỗi. */
  partIndex: number;
  /** Chênh lệch tính bằng phách (dương = thừa, âm = thiếu). */
  diffBeats: number;
  /** Câu tiếng Việt, ví dụ "Ô 12 thiếu 1 phách". */
  message: string;
}

const numberOf = (parent: Element, tag: string): number => {
  const text = Array.from(parent.children)
    .find((c) => c.tagName === tag)
    ?.textContent?.trim();
  const value = Number(text);
  return text && Number.isFinite(value) ? value : 0;
};

/** Định dạng số phách theo kiểu Việt (dấu phẩy thập phân, tối đa 2 chữ số). */
const formatBeats = (value: number): string => String(Math.round(Math.abs(value) * 100) / 100).replace('.', ',');

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
      const beatLength = (divisions * 4) / beatType;
      for (const total of totals.values()) {
        if (total === expected) continue;
        const diffBeats = (total - expected) / beatLength;
        const current = worst.get(measureIndex);
        if (current && Math.abs(current.diffBeats) >= Math.abs(diffBeats)) continue;
        worst.set(measureIndex, {
          measureIndex,
          partIndex,
          diffBeats,
          message: `Ô ${measureIndex + 1} ${diffBeats < 0 ? 'thiếu' : 'thừa'} ${formatBeats(diffBeats)} phách`,
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
  const command = commitEdit(doc, `Xác nhận ô ${measureIndex + 1} đúng`, touched, [], () => {
    targets.forEach((m) => m.setAttribute('implicit', 'yes'));
  });
  return { ok: true, command };
}
