import apiClient from '../client';
import type { ApiResponse } from '../../types';
import type { ViewCountResponse } from '../../types/playback';

const viewedKey = (scoreId: string) => `viewed:${scoreId}`;

/**
 * Ghi một lượt xem khi bắt đầu phát. Mỗi bản nhạc chỉ gửi một lần trong một phiên trình duyệt (sessionStorage);
 * lỗi mạng hoặc quyền bị bỏ qua vì đếm lượt xem không được làm hỏng việc nghe nhạc.
 */
export const countView = async (scoreId: string): Promise<ViewCountResponse | null> => {
  try {
    if (sessionStorage.getItem(viewedKey(scoreId))) return null;
    sessionStorage.setItem(viewedKey(scoreId), '1');
  } catch {
    // không có sessionStorage: BE vẫn chặn đếm trùng trong 30 phút
  }
  try {
    const res = await apiClient.post<ApiResponse<ViewCountResponse>>(`/scores/${scoreId}/views`);
    return res.data.result;
  } catch {
    return null;
  }
};
