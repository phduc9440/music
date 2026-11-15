import { useLocation } from 'react-router-dom';
import { formatDateTime as formatDateTimeI18n, formatRelativeTime, labelMap, t, translateError } from '../i18n/core';
import type { AccessLevel, Difficulty, OmrSourceType, ProcessingStatus, ScoreSource, TaskStatus } from '../types';
import type { SharePermission, Visibility } from '../types';

// Nhãn hiển thị cho các giá trị enum của BE, theo ngôn ngữ đang dùng (chuỗi nằm ở locales/*/scores.json)
export const STATUS_LABELS: Record<ProcessingStatus, string> = labelMap('scores.labels.status', [
  'NONE',
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
]);

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = labelMap('scores.labels.taskStatus', [
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);

export const SOURCE_LABELS: Record<ScoreSource, string> = labelMap('scores.labels.source', ['OMR', 'IMPORT', 'MANUAL']);

export const OMR_SOURCE_LABELS: Record<OmrSourceType, string> = labelMap('scores.labels.omrSource', [
  'PHOTO',
  'SCAN',
  'PDF_NATIVE',
]);

export const VISIBILITY_LABELS: Record<Visibility, string> = labelMap('scores.labels.visibility', [
  'PRIVATE',
  'PENDING',
  'PUBLIC',
]);

export const SHARE_PERMISSION_LABELS: Record<SharePermission, string> = labelMap(
  'scores.labels.sharePermission',
  [1, 2, 3],
);

export const ACCESS_LEVEL_LABELS: Record<AccessLevel, string> = labelMap('scores.labels.accessLevel', [
  'OWNER',
  'EDIT',
  'REVIEW',
  'VIEW',
]);

export const DIFFICULTY_LABELS: Record<Difficulty, string> = labelMap('scores.labels.difficulty', [
  'EASY',
  'MEDIUM',
  'HARD',
  'EXPERT',
]);

export const FILE_TYPE_LABELS: Record<string, string> = labelMap('scores.labels.fileType', [
  'ORIGINAL_IMAGE',
  'ORIGINAL_PDF',
  'ORIGINAL_MUSICXML',
  'ORIGINAL_MIDI',
  'PNG',
  'KERN',
  'MUSICXML',
  'MIDI',
  'PDF',
  'SVG',
  'MP3',
  'WAV',
]);

export const TASK_TYPE_LABELS: Record<string, string> = labelMap('scores.labels.taskType', [
  'OMR_CONVERSION',
  'CHORD_GENERATION',
  'AUDIO_SYNTHESIS',
  'FORMAT_CONVERSION',
]);

// Giới hạn khớp với validate ở BE (ScoreUpdateRequest)
export const MAX_TITLE = 255;
export const MAX_COMPOSER = 255;
/** Ảnh bìa bản nhạc: loại và dung lượng tối đa, khớp BE (lỗi 2025). */
export const COVER_TYPES = ['image/jpeg', 'image/png'];
export const COVER_MAX_BYTES = 3 * 1024 * 1024;
export const MAX_NOTES = 5000;
export const MAX_REVIEW_COMMENT = 2000;
export const MAX_KEYWORD = 100;

// Chu kỳ tự làm mới khi còn tác vụ đang chạy
export const POLL_INTERVAL_MS = 5000;
export const formatSize = (bytes?: number | null): string => {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export const formatDateTime = (iso?: string | null): string => (iso ? formatDateTimeI18n(iso) : '-');

/** "vừa xong", "5 phút trước", "3 ngày trước"... Quá 30 ngày thì hiện ngày tháng. */
export const formatRelative = (iso?: string | null): string => (iso ? formatRelativeTime(iso) : '');

/** Câu lỗi cho người dùng: bản dịch theo mã lỗi BE nếu có, không thì message của BE, không thì câu mặc định. */
export const getErrorMessage = (err: unknown, fallback: string): string => translateError(err, fallback);

/** Mã lỗi nghiệp vụ (ErrorCode của BE) trong response, ví dụ 2004. */
export const getErrorCode = (err: unknown): number | undefined =>
  (err as { response?: { data?: { code?: number } } }).response?.data?.code;

export const getHttpStatus = (err: unknown): number | undefined =>
  (err as { response?: { status?: number } }).response?.status;

// Các định dạng trong menu "Tải xuống" ở trang chi tiết (doc 2.0). Mục nào chưa có file thì hiện "Tạo file".
export const DOWNLOAD_FORMATS: { fileType: string; label: string }[] = [
  { fileType: 'MUSICXML', label: 'MusicXML' },
  { fileType: 'MIDI', label: 'MIDI' },
  { fileType: 'KERN', label: 'Kern (.krn)' },
  { fileType: 'MP3', label: 'MP3' },
  { fileType: 'WAV', label: 'WAV' },
  { fileType: 'PDF', label: 'PDF' },
  { fileType: 'SVG', label: 'SVG' },
];

/**
 * Bấm vào thẻ bản nhạc thì đi đâu (doc 2.0):
 *  - PENDING / PROCESSING / FAILED -> /scores/{id}/processing (trang tiến độ, hiện lỗi + nút "Thử lại" nếu FAILED)
 *  - COMPLETED (và còn lại)        -> /scores/{id}
 */
export const getScorePath = (id: string, status: ProcessingStatus): string => {
  const inProgress = status === 'PENDING' || status === 'PROCESSING' || status === 'FAILED';
  return inProgress ? `/scores/${id}/processing` : `/scores/${id}`;
};

// ---- Validate upload (khớp server: mục 2.1 trong doc, mã lỗi 2003–2011, 2202) ----
export const UPLOAD_MAX_FILE_BYTES = 50 * 1024 * 1024;
export const UPLOAD_MAX_TOTAL_BYTES = 200 * 1024 * 1024;
export const UPLOAD_MAX_IMAGES = 20;
export const UPLOAD_MAX_PDF_PAGES = 20;
export const UPLOAD_MIN_IMAGE_SIDE = 600;
export const UPLOAD_MAX_IMAGE_PIXELS = 40_000_000;

/** Mã lỗi BE có câu riêng khi upload thất bại (chuỗi ở locales, nhóm upload.errorByCode). */
const UPLOAD_ERROR_CODES = [2003, 2004, 2005, 2006, 2008, 2009, 2010, 2011, 2018, 2202];

export const getUploadErrorMessage = (err: unknown): string => {
  const code = getErrorCode(err);
  if (code && UPLOAD_ERROR_CODES.includes(code)) {
    return t(`upload.errorByCode.${code}`, { pages: UPLOAD_MAX_PDF_PAGES, side: UPLOAD_MIN_IMAGE_SIDE });
  }
  return getErrorMessage(err, t('upload.failed'));
};
/** Mã lỗi BE có câu riêng khi lưu MusicXML từ trình chỉnh sửa (chuỗi ở locales, nhóm upload.saveByCode). */
const SAVE_ERROR_CODES = [1002, 2001, 2005, 2013, 2201];

/** Thông báo cho lỗi lưu (không gồm 2014, vì xung đột phiên bản có hộp thoại riêng). */
export const getSaveErrorMessage = (err: unknown): string => {
  const code = getErrorCode(err);
  if (code && SAVE_ERROR_CODES.includes(code)) return t(`upload.saveByCode.${code}`);
  return getErrorMessage(err, t('upload.saveFailed'));
};

/** Phiên bản mới nhất BE trả kèm lỗi 2014 SCORE_VERSION_CONFLICT; undefined nếu không phải lỗi này. */
export const getConflictVersion = (err: unknown): number | undefined => {
  if (getErrorCode(err) !== 2014) return undefined;
  const result = (err as { response?: { data?: { result?: { currentVersion?: number } } } }).response?.data?.result;
  return typeof result?.currentVersion === 'number' ? result.currentVersion : 0;
};

export const UPLOAD_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg'];

export const getExtension = (name: string): string => name.split('.').pop()?.toLowerCase() ?? '';
export const isPdf = (file: File): boolean => getExtension(file.name) === 'pdf';

/** Lỗi của riêng từng file; chuỗi rỗng nghĩa là hợp lệ. */
export const validateUploadFile = (file: File): string => {
  if (!UPLOAD_EXTENSIONS.includes(getExtension(file.name))) return t('upload.validate.unsupported');
  if (file.size === 0) return t('upload.import.empty');
  if (file.size > UPLOAD_MAX_FILE_BYTES)
    return t('upload.import.tooLarge', { max: UPLOAD_MAX_FILE_BYTES / 1024 / 1024 });
  return '';
};

/** Lỗi chung của cả lô file (PDF đi một mình, tối đa 20 ảnh, tổng dung lượng); chuỗi rỗng nghĩa là hợp lệ. */
export const validateUploadBatch = (files: File[]): string => {
  if (files.length === 0) return '';
  const pdfs = files.filter(isPdf).length;
  if (pdfs > 0 && files.length > 1) return t('upload.validate.pdfAlone');
  if (pdfs === 0 && files.length > UPLOAD_MAX_IMAGES) return t('upload.validate.maxImages', { max: UPLOAD_MAX_IMAGES });
  if (files.reduce((sum, f) => sum + f.size, 0) > UPLOAD_MAX_TOTAL_BYTES) return t('upload.validate.totalSize');
  return '';
};

/** Tên file bỏ đuôi, dùng làm tiêu đề gợi ý. */
export const fileNameWithoutExtension = (name: string): string => name.replace(/\.[^.]+$/, '');

/** Tự đoán loại nguồn: PDF -> PDF gốc, ảnh -> Ảnh chụp (người dùng sửa được). */
export const guessSourceType = (files: File[]): OmrSourceType =>
  files.length > 0 && files.every(isPdf) ? 'PDF_NATIVE' : 'PHOTO';

/** Tên file tải về an toàn: bỏ ký tự cấm (\ / : * ? " < > |) và ký tự điều khiển, tối đa 120 ký tự. */
export function toSafeFileName(name: string | null | undefined, fallback = 'ban-nhac'): string {
  const cleaned = (name ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}

/**
 * Đường dẫn gốc của các trang bản nhạc: admin xem trong /admin/scores/..., người dùng trong /scores/...
 * Dùng chung để các trang chi tiết, trình xem, phát, tiến độ, kết quả số hóa không phải nhân đôi cho admin.
 */
export function useScoreBase(): string {
  return useLocation().pathname.startsWith('/admin/') ? '/admin/scores' : '/scores';
}
