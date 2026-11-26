import { t } from '../../../i18n/core';
import type { SuggestionStaleReason, SuggestionStatus, SuggestionSummary } from '../../../types';

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

// Gợi ý hợp âm AI: BE lưu tiêu đề, mô tả tiếng Việt (ChordGenerationWorker); web dựng lại theo ngôn ngữ đang dùng (CH-07)
const CHORD_STYLE_LABELS: Record<string, string> = {
  'Tự nhiên': 'NATURAL', // i18n-ignore: chữ BE lưu
  'Đơn giản': 'SIMPLE', // i18n-ignore: chữ BE lưu
  'Có màu': 'COLORFUL', // i18n-ignore: chữ BE lưu
  'Hợp âm 7 / Jazz': 'JAZZY', // i18n-ignore: chữ BE lưu
};
const CHORD_TITLE = /^Gợi ý hợp âm \((.+)\)$/; // i18n-ignore: chữ BE lưu
const CHORD_DESCRIPTION = /^Giọng (.+), (\d+) hợp âm (thay cho hợp âm cũ|được thêm)$/; // i18n-ignore: chữ BE lưu

/** Tiêu đề đề xuất theo ngôn ngữ đang dùng; đề xuất người dùng gửi giữ nguyên chữ họ viết. */
export const suggestionTitle = (s: Pick<SuggestionSummary, 'title' | 'source'>): string => {
  const match = s.source === 'CHORD_GENERATION' ? CHORD_TITLE.exec(s.title) : null;
  const style = match ? CHORD_STYLE_LABELS[match[1]] : undefined;
  return style ? t('chords.suggestion.title', { style: t(`chords.styles.${style}.name`) }) : s.title;
};

/** Mô tả đề xuất theo ngôn ngữ đang dùng (gợi ý hợp âm AI), còn lại giữ nguyên. */
export const suggestionDescription = (source: string | null | undefined, description?: string | null): string => {
  if (!description) return '';
  const match = source === 'CHORD_GENERATION' ? CHORD_DESCRIPTION.exec(description) : null;
  if (!match) return description;
  const count = Number(match[2]);
  return t(match[3].startsWith('\u0111') ? 'chords.suggestion.added' : 'chords.suggestion.replaced', {
    // "được thêm" (i18n-ignore)
    // i18n-ignore: chữ BE lưu
    key: match[1],
    count,
  });
};

/** Đường dẫn trang xem xét một đề xuất. */
export const suggestionPath = (base: string, scoreId: string, suggestionId: string): string =>
  `${base}/${scoreId}/suggestions/${suggestionId}`;

/** Trình chỉnh sửa nạp sẵn gợi ý hợp âm `suggestionId` làm bản nháp (chỉ dùng cho người sửa được bản nhạc). */
/** Trình chỉnh sửa, vào xong thì hỏi rồi xóa hết hợp âm (hộp Gợi ý hợp âm ở trang chi tiết). */
export const clearChordsEditPath = (base: string, scoreId: string): string => `${base}/${scoreId}/edit?clearChords=1`;

export const aiChordsEditPath = (base: string, scoreId: string, suggestionId: string): string =>
  `${base}/${scoreId}/edit?aiChords=${encodeURIComponent(suggestionId)}`;
