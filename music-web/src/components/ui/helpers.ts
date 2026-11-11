/** Hàm và hằng số dùng chung cho các trang admin (để riêng khỏi file component). */

import { formatDate as formatDateI18n, formatDateTime as formatDateTimeI18n, translateError } from '../../i18n/core';

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'violet';

/** Câu lỗi cho người dùng: bản dịch theo mã lỗi BE nếu có, không thì message của BE, không thì câu mặc định. */
export const errorMessage = (error: unknown, fallback: string) => translateError(error, fallback);

export const formatDateTime = (iso?: string | null) => (iso ? formatDateTimeI18n(iso) : '—');
export const formatDate = (iso?: string | null) => (iso ? formatDateI18n(iso) : '—');

export const VISIBILITY: Record<string, { label: string; tone: Tone }> = {
  PUBLIC: { label: 'Công khai', tone: 'success' },
  PENDING: { label: 'Chờ duyệt', tone: 'warning' },
  PRIVATE: { label: 'Riêng tư', tone: 'neutral' },
};
