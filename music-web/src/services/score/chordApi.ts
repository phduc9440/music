import apiClient from '../client';
import type { AiTaskInfo, ApiResponse } from '../../types';

/** Màu hợp âm: music-ai tăng / giảm nhóm hợp âm của model (model không có khái niệm thể loại). */
export type ChordStyle = 'NATURAL' | 'SIMPLE' | 'COLORFUL' | 'JAZZY';

export const CHORD_STYLES: ChordStyle[] = ['NATURAL', 'SIMPLE', 'COLORFUL', 'JAZZY'];

/** Độ sáng tạo khi AI lấy mẫu hợp âm: an toàn → táo bạo. */
export type ChordCreativity = 'SAFE' | 'BALANCED' | 'BOLD';
export const CHORD_CREATIVITIES: ChordCreativity[] = ['SAFE', 'BALANCED', 'BOLD'];

/** Mật độ đổi hợp âm: thưa → dày. */
export type ChordDensity = 'SPARSE' | 'NORMAL' | 'DENSE';
export const CHORD_DENSITIES: ChordDensity[] = ['SPARSE', 'NORMAL', 'DENSE'];

export interface ChordRequestOptions {
  replaceExisting?: boolean;
  creativity?: ChordCreativity;
  density?: ChordDensity;
  /** Bè giai điệu (CH-04): part từ 0, khuông từ 1. Bỏ trống thì AI lấy khuông 1 của part đầu có nốt. */
  partIndex?: number;
  staff?: number;
}

/** Gợi ý hợp âm tự động (R3, BE: ChordSuggestionController). */
export const chordApi = {
  /**
   * Tạo tác vụ CHORD_GENERATION; theo dõi bằng taskApi.get, xong thì resultData.suggestionId. Lỗi 3130 phong cách sai,
   * 3131 đang chạy, 3132 đã có gợi ý chờ duyệt (result.suggestionId), 2201 OMR đang chạy, 3702 hết hạn mức.
   * `replaceExisting`: bỏ hết hợp âm đang có rồi gợi ý lại toàn bộ (mặc định chỉ gợi ý cho ô chưa có hợp âm). Mỗi lần
   * gọi AI lấy mẫu lại nên ra cách đệm khác, kèm tới 3 phương án (xem SuggestionDetail.optionCount).
   */
  request: (scoreId: string, style: ChordStyle, options: ChordRequestOptions = {}) =>
    apiClient.post<ApiResponse<AiTaskInfo>>(`/scores/${scoreId}/chord-suggestions`, {
      style,
      replaceExisting: options.replaceExisting ?? false,
      creativity: options.creativity ?? 'BALANCED',
      density: options.density ?? 'NORMAL',
      partIndex: options.partIndex,
      staff: options.staff,
    }),
};
