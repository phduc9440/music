/**
 * Lịch sử hoàn tác / làm lại (tối đa 100 bước). Mỗi bước là một {@link EditCommand} chứa bản sao ô nhịp trước và
 * sau, nên hoàn tác chỉ việc thay ô nhịp về bản cũ. Nhiều nốt đổi cùng lúc là một lệnh nên là một bước.
 */
import { resolveLabel, type EditCommand } from './commands';
import type { ScoreDocument } from './ScoreDocument';

/** Số bước hoàn tác tối đa. */
export const HISTORY_LIMIT = 100;

export class History {
  private stack: EditCommand[] = [];
  /** Số lệnh đang có hiệu lực; lệnh ở chỉ số ≥ cursor là các bước "làm lại". */
  private cursor = 0;
  /** Giá trị cursor lúc lưu gần nhất; −1 nghĩa là trạng thái đã lưu không còn quay về được. */
  private savedCursor = 0;

  /** Ghi một lệnh vừa áp dụng; xóa các bước làm lại phía sau. */
  push(command: EditCommand): void {
    this.stack = this.stack.slice(0, this.cursor);
    if (this.savedCursor > this.cursor) this.savedCursor = -1;
    this.stack.push(command);
    this.cursor += 1;
    if (this.stack.length > HISTORY_LIMIT) {
      this.stack.shift();
      this.cursor -= 1;
      this.savedCursor -= 1; // có thể thành −1: bản đã lưu nằm ngoài lịch sử
    }
  }

  get canUndo(): boolean {
    return this.cursor > 0;
  }

  get canRedo(): boolean {
    return this.cursor < this.stack.length;
  }

  /** Có thay đổi chưa lưu không. */
  get dirty(): boolean {
    return this.cursor !== this.savedCursor;
  }

  /** Nhãn của bước sẽ được hoàn tác / làm lại tiếp theo (để hiện trên thanh trạng thái). */
  get undoLabel(): string {
    const label = this.stack[this.cursor - 1]?.label;
    return label === undefined ? '' : resolveLabel(label);
  }

  get redoLabel(): string {
    const label = this.stack[this.cursor]?.label;
    return label === undefined ? '' : resolveLabel(label);
  }

  /** Vị trí hiện tại trong lịch sử, để {@link markSaved} biết bản nào đã được lưu dù người dùng sửa tiếp lúc đang lưu. */
  get position(): number {
    return this.cursor;
  }

  /** Đánh dấu một vị trí (mặc định: hiện tại) là đã lưu. */
  markSaved(position: number = this.cursor): void {
    this.savedCursor = position;
  }

  /** Đánh dấu có thay đổi chưa lưu dù lịch sử không có bước nào (ví dụ vừa khôi phục bản nháp). */
  markUnsaved(): void {
    this.savedCursor = -1;
  }

  /** Xóa toàn bộ lịch sử (ví dụ sau khi tải lại bản mới nhất). */
  clear(): void {
    this.stack = [];
    this.cursor = 0;
    this.savedCursor = 0;
  }

  /** Hoàn tác một bước; trả về lệnh đã hoàn tác hoặc null nếu hết bước. */
  undo(doc: ScoreDocument): EditCommand | null {
    if (!this.canUndo) return null;
    const command = this.stack[this.cursor - 1];
    for (const s of command.snapshots) {
      doc.replaceMeasure(s.partIndex, s.measureIndex, s.before.cloneNode(true) as Element, false);
    }
    if (command.head) doc.restoreHead(command.head.before);
    if (command.parts) doc.restoreParts(command.parts.before);
    doc.reindex();
    this.cursor -= 1;
    return command;
  }

  /** Làm lại một bước; trả về lệnh đã làm lại hoặc null nếu không còn. */
  redo(doc: ScoreDocument): EditCommand | null {
    if (!this.canRedo) return null;
    const command = this.stack[this.cursor];
    for (const s of command.snapshots) {
      doc.replaceMeasure(s.partIndex, s.measureIndex, s.after.cloneNode(true) as Element, false);
    }
    if (command.head) doc.restoreHead(command.head.after);
    if (command.parts) doc.restoreParts(command.parts.after);
    doc.reindex();
    this.cursor += 1;
    return command;
  }
}
