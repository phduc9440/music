import apiClient from '../client';
import type { AiTaskInfo, ApiResponse } from '../../types';

/** Phong cách gợi ý hợp âm (R3), khớp ChordStyle ở BE. */
export type ChordStyle = 'POP' | 'BALLAD' | 'JAZZ';

export const CHORD_STYLES: ChordStyle[] = ['POP', 'BALLAD', 'JAZZ'];

/** Gợi ý hợp âm tự động (R3, BE: ChordSuggestionController). */
export const chordApi = {
  /**
   * Tạo tác vụ CHORD_GENERATION; theo dõi bằng taskApi.get, xong thì resultData.suggestionId. Lỗi 3130 phong cách sai,
   * 3131 đang chạy, 3132 đã có gợi ý chờ duyệt (result.suggestionId), 2201 OMR đang chạy, 3702 hết hạn mức.
   */
  request: (scoreId: string, style: ChordStyle) =>
    apiClient.post<ApiResponse<AiTaskInfo>>(`/scores/${scoreId}/chord-suggestions`, { style }),
};
