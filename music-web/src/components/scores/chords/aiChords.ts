/**
 * Hợp âm AI gợi ý được nạp làm bản nháp trong trình chỉnh sửa: tìm các nốt mà bản đề xuất đổi hợp âm so với bản đang
 * mở, và theo dõi người dùng đã giữ, sửa hay xóa từng hợp âm đó. Id nốt (`m{ô}-s{khuông}-v{bè}-{thứ tự}`) giống nhau
 * giữa hai bản vì gợi ý hợp âm không thêm/bớt nốt.
 */
import type { ScoreDocument } from '../../editor/core/ScoreDocument';
import { harmoniesOf, readChord } from '../../editor/notation/harmony';

export interface AiChordItem {
  /** Id nốt mang hợp âm. */
  id: string;
  partIndex: number;
  /** Chỉ số ô nhịp, từ 0. */
  measureIndex: number;
  /** Hợp âm AI đề xuất (chữ hiển thị). */
  ai: string;
  /** Hợp âm trước khi nạp gợi ý ("" nếu chưa có). */
  before: string;
  /** Thẻ <harmony> của bản đề xuất (bản sao), để nạp vào bản đang mở. */
  aiHarmonies: Element[];
  /** Thẻ <harmony> lúc trước (bản sao), để "Bỏ gợi ý" trả lại đúng như cũ. */
  beforeHarmonies: Element[];
}

/** `ai`: còn nguyên như AI gợi ý · `edited`: người dùng đã đổi thành hợp âm khác · `removed`: đã xóa. */
export type AiChordStatus = 'ai' | 'edited' | 'removed';

/** Các nốt mà bản đề xuất có hợp âm khác bản đang mở (theo thứ tự trong bản nhạc). */
export function diffChords(current: ScoreDocument, proposed: ScoreDocument): AiChordItem[] {
  const items: AiChordItem[] = [];
  for (const note of proposed.notes) {
    const ai = readChord(proposed, note.id);
    if (!ai || !current.getInfo(note.id)) continue;
    const before = readChord(current, note.id);
    if (before === ai) continue;
    items.push({
      id: note.id,
      partIndex: note.partIndex,
      measureIndex: note.measureIndex,
      ai,
      before,
      aiHarmonies: harmoniesOf(proposed, note.id),
      beforeHarmonies: harmoniesOf(current, note.id),
    });
  }
  return items;
}

/** Hợp âm đang ghi ở nốt của `item` so với gợi ý. */
export function chordStatus(doc: ScoreDocument, item: AiChordItem): { status: AiChordStatus; now: string } {
  const now = doc.getInfo(item.id) ? readChord(doc, item.id) : '';
  if (now === item.ai) return { status: 'ai', now };
  return { status: now ? 'edited' : 'removed', now };
}

/**
 * Các nốt đang có hợp âm ở bản đang mở nhưng không còn ở bản đề xuất (gợi ý lại thay hợp âm cũ: hợp âm mới có thể gắn
 * vào nốt khác), kèm thẻ <harmony> cũ để "Bỏ gợi ý" trả lại.
 */
export function clearedChords(
  current: ScoreDocument,
  proposed: ScoreDocument,
): { id: string; beforeHarmonies: Element[] }[] {
  return chordNoteIds(current)
    .filter((id) => proposed.getInfo(id) && !readChord(proposed, id))
    .map((id) => ({ id, beforeHarmonies: harmoniesOf(current, id) }));
}

/** Id các nốt đang mang hợp âm (theo thứ tự trong bản nhạc). */
export function chordNoteIds(doc: ScoreDocument): string[] {
  return doc.notes.filter((note) => readChord(doc, note.id)).map((note) => note.id);
}

/**
 * Mọi ô nhịp có nốt của phần nhạc đầu tiên đều đã có hợp âm (giống điều kiện AI báo "đã có hợp âm hết"), để hỏi người
 * dùng có muốn thay hợp âm cũ không trước khi tạo gợi ý.
 */
export function allMeasuresHaveChords(doc: ScoreDocument): boolean {
  const measures = new Map<number, boolean>();
  for (const note of doc.notes) {
    if (note.partIndex !== 0) continue;
    measures.set(note.measureIndex, (measures.get(note.measureIndex) ?? false) || !!readChord(doc, note.id));
  }
  return measures.size > 0 && [...measures.values()].every(Boolean);
}
