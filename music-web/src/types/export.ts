import type { AiTaskInfo } from './score';

/** Định dạng xuất âm thanh. */
export type ExportFormat = 'MP3' | 'WAV';
/** Mọi định dạng API xuất nhận: âm thanh, PDF, SVG, và MUSICXML (cũng dùng để chuyển MIDI nhập thành bản nhạc). */
export type ExportTarget = ExportFormat | 'PDF' | 'SVG' | 'MIDI' | 'MUSICXML';
export type ExportHands = 'BOTH' | 'RIGHT' | 'LEFT';

/** Tùy chọn gửi lên API xuất (đặc tả 5.2). `bitrate` chỉ dùng cho MP3. */
export interface ExportOptions {
  bitrate?: number;
  tempoPercent: number;
  transpose: number;
  hands: ExportHands;
}

export type PdfPageSize = 'A4' | 'LETTER';
export type PdfOrientation = 'PORTRAIT' | 'LANDSCAPE';
export type MeasureNumbers = 'SYSTEM' | 'EVERY' | 'NONE';

/** Tùy chọn xuất PDF (khớp BE: ExportOptionsValidator). */
export interface PdfOptions {
  pageSize: PdfPageSize;
  orientation: PdfOrientation;
  /** Khoảng cách giữa hai dòng kẻ, mm (1,5–2,2). */
  staffSpaceMm: number;
  /** Lề bốn phía, mm (10–25). */
  marginMm: number;
  showTitle: boolean;
  measureNumbers: MeasureNumbers;
  showChords: boolean;
}

/** Tùy chọn xuất SVG: "ALL" hoặc số trang từ 1 (tác vụ luôn kết xuất mọi trang). */
export interface SvgOptions {
  page: 'ALL' | number;
}

/** Một file xuất của bản nhạc (khớp BE: ExportFileResponse). */
export interface ExportFileInfo {
  id: string;
  scoreId: string;
  fileType: string;
  originalFileName?: string | null;
  contentType?: string | null;
  sizeBytes?: number | null;
  pageNumber?: number | null;
  /** Tác vụ xuất đã tạo file (gom các trang SVG của một lần xuất). */
  taskId?: string | null;
  createdAt?: string;
  downloadUrl: string;
  /** Tùy chọn đã dùng để xuất file này. */
  options?: Partial<ExportOptions & PdfOptions> | null;
  sourceVersion?: number | null;
  /** True khi bản nhạc đã được sửa sau lúc xuất. */
  outdated: boolean;
}

/** Kết quả yêu cầu xuất: có `file` ngay (cached) hoặc có `task` để theo dõi. */
export interface ExportResult {
  cached: boolean;
  file?: ExportFileInfo | null;
  /** Với SVG đã có sẵn: tất cả các trang theo thứ tự. */
  files?: ExportFileInfo[] | null;
  task?: AiTaskInfo | null;
}
