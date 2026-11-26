import type { ScoreDocument } from '../../editor/core/ScoreDocument';
import type { CommentAnchor } from './commentUtils';

/** Số noteId tối đa gửi kèm góp ý (khớp BE). */
const MAX_NOTE_IDS = 200;

/**
 * Vùng neo góp ý từ các nốt đang chọn trong Editor: ô đầu–ô cuối (đổi chỉ số từ 0 sang số ô từ 1), mã bè nếu mọi nốt cùng
 * một bè, và danh sách id nốt. Null nếu chưa chọn nốt nào.
 */
export function anchorFromNotes(doc: ScoreDocument, ids: ReadonlySet<string>): CommentAnchor | null {
  const infos = [...ids].map((id) => doc.getInfo(id)).filter((n) => n !== undefined);
  if (infos.length === 0) return null;
  const measures = infos.map((n) => n.measureIndex);
  const parts = new Set(infos.map((n) => n.partIndex));
  return {
    start: Math.min(...measures) + 1,
    end: Math.max(...measures) + 1,
    partId: parts.size === 1 ? doc.partIdOf([...parts][0]) : null,
    noteIds: infos.length <= MAX_NOTE_IDS ? infos.map((n) => n.id) : [],
  };
}
