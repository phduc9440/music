/** Hàm và hằng số dùng chung cho các trang admin (để riêng khỏi file component). */

import {
  formatDate as formatDateI18n,
  formatDateTimeShort as formatDateTimeI18n,
  t,
  translateError,
} from '../../i18n/core';

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'violet';

/** Câu lỗi cho người dùng: bản dịch theo mã lỗi BE nếu có, không thì message của BE, không thì câu mặc định. */
export const errorMessage = (error: unknown, fallback: string) => translateError(error, fallback);

export const formatDateTime = (iso?: string | null) => (iso ? formatDateTimeI18n(iso) : '—');
export const formatDate = (iso?: string | null) => (iso ? formatDateI18n(iso) : '—');

export const VISIBILITY: Record<string, { label: string; tone: Tone }> = {
  PUBLIC: {
    get label() {
      return t('scores.labels.visibilityShort.PUBLIC');
    },
    tone: 'success',
  },
  PENDING: {
    get label() {
      return t('scores.labels.visibilityShort.PENDING');
    },
    tone: 'warning',
  },
  PRIVATE: {
    get label() {
      return t('scores.labels.visibilityShort.PRIVATE');
    },
    tone: 'neutral',
  },
};
