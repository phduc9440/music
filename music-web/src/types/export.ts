import type { AiTaskInfo } from './score';

/** Định dạng xuất âm thanh (nhánh export-audio); PDF, SVG, MIDI thêm ở nhánh export-formats. */
export type ExportFormat = 'MP3' | 'WAV';
export type ExportHands = 'BOTH' | 'RIGHT' | 'LEFT';

/** Tùy chọn gửi lên API xuất (đặc tả 5.2). `bitrate` chỉ dùng cho MP3. */
export interface ExportOptions {
  bitrate?: number;
  tempoPercent: number;
  transpose: number;
  hands: ExportHands;
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
  createdAt?: string;
  downloadUrl: string;
  /** Tùy chọn đã dùng để xuất file này. */
  options?: Partial<ExportOptions> | null;
  sourceVersion?: number | null;
  /** True khi bản nhạc đã được sửa sau lúc xuất. */
  outdated: boolean;
}

/** Kết quả yêu cầu xuất: có `file` ngay (cached) hoặc có `task` để theo dõi. */
export interface ExportResult {
  cached: boolean;
  file?: ExportFileInfo | null;
  task?: AiTaskInfo | null;
}
