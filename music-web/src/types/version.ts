/** Nguồn của một phiên bản MusicXML (khớp BE: ScoreVersionResponse.source). */
export type VersionSource = 'EDITOR' | 'OMR' | 'IMPORT' | 'RESTORE';

/** Một phiên bản MusicXML trong lịch sử của bản nhạc (đặc tả 3.6). */
export interface ScoreVersion {
  version: number;
  createdAt?: string | null;
  /** Tên người lưu; thiếu với bản do hệ thống tạo hoặc bản cũ chưa ghi. */
  savedByName?: string | null;
  measureCount?: number | null;
  sizeBytes?: number | null;
  isCurrent: boolean;
  source: VersionSource;
  /** Khi source = RESTORE: version được khôi phục. */
  restoredFrom?: number | null;
}

/** Trạng thái của một ô khi so hai phiên bản (BE: ScoreDiffResponse.measures[].status). */
export type DiffStatus = 'same' | 'edited' | 'deleted' | 'added';

/** Loại lỗi nốt trong ô đã sửa. */
export type DiffErrorType = 'PITCH' | 'ACCIDENTAL' | 'DURATION' | 'TIMING' | 'EXTRA' | 'MISSING';

export interface DiffError {
  type: DiffErrorType;
  staff: number;
  /** Vị trí trong ô, tính bằng phách đen. */
  onset: number;
  /** Nốt ở bản gốc (vd. F#4), null nếu là nốt thiếu. */
  base?: string | null;
  /** Nốt ở bản đã sửa, null nếu là nốt thừa. */
  target?: string | null;
}

export interface DiffMeasure {
  /** Số ô ở bản gốc (từ 1), null nếu ô được thêm. */
  base?: number | null;
  /** Số ô ở bản so, null nếu ô bị xóa. */
  target?: number | null;
  status: DiffStatus;
  errors: DiffError[];
}

export interface DiffSummary {
  baseMeasures: number;
  targetMeasures: number;
  same: number;
  edited: number;
  /** Ô bản gốc có mà bản so không có: OMR sinh thừa (lỗi lặp ô nhịp). */
  deleted: number;
  /** Ô bản so có mà bản gốc không có: OMR bỏ sót. */
  added: number;
  measureEditRate: number;
  baseNotes: number;
  noteErrors: number;
  noteErrorRate: number;
  byType: Record<DiffErrorType, number>;
}

/** Kết quả GET /scores/{id}/versions/{v}/diff (BE: ScoreDiffResponse). */
export interface ScoreDiff {
  baseVersion: number;
  targetVersion: number;
  measures: DiffMeasure[];
  summary: DiffSummary;
  cached: boolean;
}
