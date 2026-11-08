import type {
  Difficulty,
  OmrSourceType,
  ProcessingStatus,
  ScoreSort,
  ScoreSource,
  TaskStatus,
  Visibility,
} from './enums';

// Khớp với PageResponse của BE (khác với PageResponse cũ của trang admin)
export interface PageResult<T> {
  content: T[];
  pageNumber: number;
  pageSize: number;
  totalElements: number;
  totalPages: number;
}

export interface ScoreSummary {
  id: string;
  title: string;
  composer?: string | null;
  difficulty?: Difficulty | null;
  processingStatus: ProcessingStatus;
  sourceType?: ScoreSource | null;
  visibility: Visibility;
  measureCount?: number | null;
  thumbnailUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ScoreFileInfo {
  id: string;
  fileType: string;
  originalFileName?: string | null;
  contentType?: string | null;
  sizeBytes?: number | null;
  pageNumber?: number | null;
  version?: number | null;
  isCurrent?: boolean | null;
  downloadUrl: string;
  createdAt?: string;
}

export interface AiTaskInfo {
  id: string;
  scoreId?: string;
  taskType: string;
  status: TaskStatus;
  progress?: number | null;
  step?: string | null;
  errorMessage?: string | null;
  /** JSON kết quả do music-ai trả về (pageCount, warnings, stoppedAfter...). */
  resultData?: Record<string, unknown> | null;
  createdAt?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface ScoreDetail extends ScoreSummary {
  studyNotes?: string | null;
  rejectReason?: string | null;
  isOfficial?: boolean | null;
  keySignature?: string | null;
  timeSignature?: string | null;
  tempoBpm?: number | null;
  staffCount?: number | null;
  pageCount?: number | null;
  currentVersion?: number | null;
  viewCount?: number | null;
  ownerEmail?: string | null;
  canEdit: boolean;
  canDelete: boolean;
  files: ScoreFileInfo[];
  latestTasks: AiTaskInfo[];
}

/** Kết quả lưu MusicXML từ trình chỉnh sửa (đặc tả 3.6). */
export interface ScoreSaveResult {
  /** Phiên bản MusicXML mới. */
  version: number;
  measureCount: number;
  keySignature: string;
  timeSignature: string;
  tempoBpm: number;
  updatedAt: string;
}

export interface ScoreListParams {
  page?: number;
  size?: number;
  keyword?: string;
  status?: ProcessingStatus | '';
  source?: ScoreSource | '';
  difficulty?: Difficulty | '';
  sort?: ScoreSort;
}

export interface ScoreUpdateRequest {
  title?: string;
  composer?: string;
  difficulty?: Difficulty;
  studyNotes?: string;
  visibility?: Visibility;
}

// Body multipart của POST /omr/upload (files phải đúng thứ tự trang, ảnh đã xoay nếu người dùng xoay)
export interface OmrUploadRequest {
  files: File[];
  title: string;
  composer: string;
  sourceType: OmrSourceType;
}

// Kết quả POST /scores/import
export interface ScoreImportResult {
  scoreId: string;
  title: string;
  composer?: string | null;
  processingStatus: ProcessingStatus;
}

// Kết quả POST /omr/upload
export interface OmrUploadResult {
  scoreId: string;
  title: string;
  processingStatus: ProcessingStatus;
}

/** Kết quả nhận diện mới nhất của bản nhạc (BE: OmrResultResponse). */
export interface OmrResult {
  taskId: string;
  status: TaskStatus;
  pageCount?: number | null;
  warnings: string[];
  /** Bước cuối đã chạy nếu task dừng sớm (MERGE, PREPROCESS...), null nếu chạy đủ. */
  stoppedAfter?: string | null;
  /** Phiên bản MusicXML hiện hành (BE: scores.current_version). */
  musicXmlVersion?: number | null;
  /** Mỗi trang kèm khoảng ô nhịp (đánh số từ 1) để vẽ đúng phần của trang đó từ MusicXML. */
  pages: { pageNumber: number; imageFileId: string; firstMeasure?: number | null; lastMeasure?: number | null }[];
  kernFileId?: string | null;
  musicXmlFileId?: string | null;
  midiFileId?: string | null;
}
