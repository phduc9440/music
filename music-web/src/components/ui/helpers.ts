/** Hàm và hằng số dùng chung cho các trang admin (để riêng khỏi file component). */

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'violet';

export const errorMessage = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { message?: string } } }).response?.data?.message || fallback;

export const formatDateTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN') : '—');
export const formatDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '—');

export const VISIBILITY: Record<string, { label: string; tone: Tone }> = {
  PUBLIC: { label: 'Công khai', tone: 'success' },
  PENDING: { label: 'Chờ duyệt', tone: 'warning' },
  PRIVATE: { label: 'Riêng tư', tone: 'neutral' },
};
