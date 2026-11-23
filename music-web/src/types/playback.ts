/** Kết quả POST /scores/{id}/views. */
export interface ViewCountResponse {
  viewCount: number;
  /** false nếu lượt xem này không được tính (chủ bài, bài riêng tư, hoặc đã tính trong 30 phút gần đây). */
  counted: boolean;
}
