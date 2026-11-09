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
