import type { Difficulty, ProcessingStatus, ScoreSource, TaskStatus } from '../types';

// Nhãn hiển thị tiếng Việt cho các giá trị enum của BE
export const STATUS_LABELS: Record<ProcessingStatus, string> = {
  NONE: 'Chưa xử lý',
  PENDING: 'Đang chờ',
  PROCESSING: 'Đang xử lý',
  COMPLETED: 'Hoàn tất',
  FAILED: 'Thất bại',
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  PENDING: 'Đang chờ',
  PROCESSING: 'Đang xử lý',
  COMPLETED: 'Hoàn tất',
  FAILED: 'Thất bại',
  CANCELLED: 'Đã hủy',
};

export const SOURCE_LABELS: Record<ScoreSource, string> = {
  OMR: 'Quét từ ảnh',
  IMPORT: 'Nhập file',
  MANUAL: 'Tự soạn',
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  EASY: 'Dễ',
  MEDIUM: 'Trung bình',
  HARD: 'Khó',
};

export const FILE_TYPE_LABELS: Record<string, string> = {
  ORIGINAL_IMAGE: 'Ảnh gốc',
  ORIGINAL_PDF: 'PDF gốc',
  ORIGINAL_MUSICXML: 'MusicXML gốc',
  ORIGINAL_MIDI: 'MIDI gốc',
  PNG: 'Ảnh trang',
  KERN: 'Kern',
  MUSICXML: 'MusicXML',
  MIDI: 'MIDI',
  PDF: 'PDF',
  SVG: 'SVG',
  MP3: 'MP3',
  WAV: 'WAV',
};

export const TASK_TYPE_LABELS: Record<string, string> = {
  OMR_CONVERSION: 'Nhận diện bản nhạc (OMR)',
  CHORD_GENERATION: 'Sinh hợp âm',
  AUDIO_SYNTHESIS: 'Xuất âm thanh',
  FORMAT_CONVERSION: 'Chuyển định dạng',
};

// Giới hạn khớp với validate ở BE (ScoreUpdateRequest)
export const MAX_TITLE = 255;
export const MAX_COMPOSER = 255;
export const MAX_NOTES = 5000;
export const MAX_KEYWORD = 100;

// Chu kỳ tự làm mới khi còn tác vụ đang chạy
export const POLL_INTERVAL_MS = 5000;
export const formatSize = (bytes?: number | null): string => {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export const formatDateTime = (iso?: string | null): string => (iso ? new Date(iso).toLocaleString('vi-VN') : '-');

/** "vừa xong", "5 phút trước", "3 ngày trước"... Quá 30 ngày thì hiện ngày tháng. */
export const formatRelative = (iso?: string | null): string => {
  if (!iso) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return 'vừa xong';
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min} phút trước`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} giờ trước`;
  const day = Math.floor(hour / 24);
  if (day <= 30) return `${day} ngày trước`;
  return new Date(iso).toLocaleDateString('vi-VN');
};

/** Lấy message lỗi từ response của BE, không có thì dùng câu mặc định. */
export const getErrorMessage = (err: unknown, fallback: string): string =>
  (err as { response?: { data?: { message?: string } } }).response?.data?.message ?? fallback;

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
 * TODO(feature/omr-preprocess): trang /processing chưa có nên tạm cho tất cả vào trang chi tiết;
 * khi có trang đó thì đổi USE_PROCESSING_PAGE thành true.
 */
const USE_PROCESSING_PAGE = false;
export const getScorePath = (id: string, status: ProcessingStatus): string => {
  const inProgress = status === 'PENDING' || status === 'PROCESSING' || status === 'FAILED';
  return USE_PROCESSING_PAGE && inProgress ? `/scores/${id}/processing` : `/scores/${id}`;
};

// ---- Validate upload (khớp server: mục 2.1 trong doc, mã lỗi 2003–2006) ----
export const UPLOAD_MAX_FILE_BYTES = 50 * 1024 * 1024;
export const UPLOAD_MAX_TOTAL_BYTES = 200 * 1024 * 1024;
export const UPLOAD_MAX_IMAGES = 20;
export const UPLOAD_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg'];

export const getExtension = (name: string): string => name.split('.').pop()?.toLowerCase() ?? '';
export const isPdf = (file: File): boolean => getExtension(file.name) === 'pdf';

/** Lỗi của riêng từng file; chuỗi rỗng nghĩa là hợp lệ. */
export const validateUploadFile = (file: File): string => {
  if (!UPLOAD_EXTENSIONS.includes(getExtension(file.name))) return 'Chỉ hỗ trợ PDF, PNG, JPG, JPEG';
  if (file.size === 0) return 'File rỗng (0 byte)';
  if (file.size > UPLOAD_MAX_FILE_BYTES) return `File quá lớn (tối đa ${UPLOAD_MAX_FILE_BYTES / 1024 / 1024}MB)`;
  return '';
};

/** Lỗi chung của cả lô file (PDF đi một mình, tối đa 20 ảnh, tổng dung lượng); chuỗi rỗng nghĩa là hợp lệ. */
export const validateUploadBatch = (files: File[]): string => {
  if (files.length === 0) return '';
  const pdfs = files.filter(isPdf).length;
  if (pdfs > 0 && files.length > 1) return 'PDF phải tải lên một mình, không trộn với file khác';
  if (pdfs === 0 && files.length > UPLOAD_MAX_IMAGES) return `Tối đa ${UPLOAD_MAX_IMAGES} ảnh mỗi lần`;
  if (files.reduce((sum, f) => sum + f.size, 0) > UPLOAD_MAX_TOTAL_BYTES) return 'Tổng dung lượng vượt quá 200MB';
  return '';
};

/** Tên file bỏ đuôi, dùng làm tiêu đề gợi ý. */
export const fileNameWithoutExtension = (name: string): string => name.replace(/\.[^.]+$/, '');
