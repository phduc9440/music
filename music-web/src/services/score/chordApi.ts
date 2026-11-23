import apiClient from '../client';
import type { AiTaskInfo, ApiResponse } from '../../types';

/** Phong cách gợi ý hợp âm (R3), khớp ChordStyle ở BE. */
export type ChordStyle = 'POP' | 'BALLAD' | 'JAZZ' | 'CLASSICAL' | 'FOLK' | 'BOLERO' | 'BLUES';

export const CHORD_STYLES: ChordStyle[] = ['POP', 'BALLAD', 'FOLK', 'BOLERO', 'CLASSICAL', 'JAZZ', 'BLUES'];

/** Gợi ý hợp âm tự động (R3, BE: ChordSuggestionController). */
export const chordApi = {
  /**
   * Tạo tác vụ CHORD_GENERATION; theo dõi bằng taskApi.get, xong thì resultData.suggestionId. Lỗi 3130 phong cách sai,
   * 3131 đang chạy, 3132 đã có gợi ý chờ duyệt (result.suggestionId), 2201 OMR đang chạy, 3702 hết hạn mức.
   * `replaceExisting`: bỏ hết hợp âm đang có rồi gợi ý lại toàn bộ (mặc định chỉ gợi ý cho ô chưa có hợp âm).
   */
  request: (scoreId: string, style: ChordStyle, replaceExisting = false) =>
    apiClient.post<ApiResponse<AiTaskInfo>>(`/scores/${scoreId}/chord-suggestions`, { style, replaceExisting }),
};
