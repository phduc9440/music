import { t } from '../../../i18n/core';
import type { SuggestionStaleReason, SuggestionStatus } from '../../../types';

/** Giới hạn khớp BE (SuggestionServiceImpl). */
export const SUGGESTION_TITLE_MAX = 200;
export const SUGGESTION_DESCRIPTION_MAX = 2000;
export const SUGGESTION_NOTE_MAX = 500;

/** Lớp CSS của nhãn trạng thái đề xuất. */
export const statusTone = (status: SuggestionStatus): string =>
  status === 'OPEN' ? 'is-open' : status === 'ACCEPTED' || status === 'PARTIAL' ? 'is-accepted' : 'is-closed';

/** Câu giải thích vì sao đề xuất còn mở không áp dụng được nữa. */
export const staleMessage = (reason?: SuggestionStaleReason | null): string => {
  switch (reason) {
    case 'VERSION_CHANGED':
      return t('suggestions.review.staleVersion');
    case 'CONTEXT_CHANGED':
      return t('suggestions.review.staleContext');
    default:
      return t('suggestions.review.staleStructure');
  }
};

/** Đường dẫn trang xem xét một đề xuất. */
export const suggestionPath = (base: string, scoreId: string, suggestionId: string): string =>
  `${base}/${scoreId}/suggestions/${suggestionId}`;

/** Trình chỉnh sửa nạp sẵn gợi ý hợp âm `suggestionId` làm bản nháp (chỉ dùng cho người sửa được bản nhạc). */
/** Trình chỉnh sửa, vào xong thì hỏi rồi xóa hết hợp âm (hộp Gợi ý hợp âm ở trang chi tiết). */
export const clearChordsEditPath = (base: string, scoreId: string): string => `${base}/${scoreId}/edit?clearChords=1`;

export const aiChordsEditPath = (base: string, scoreId: string, suggestionId: string): string =>
  `${base}/${scoreId}/edit?aiChords=${encodeURIComponent(suggestionId)}`;
