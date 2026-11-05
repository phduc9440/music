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

// Thể loại (tag) gắn cho bản nhạc, BE: TagResponse
export interface Tag {
  id: string;
  name: string;
  slug: string;
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
  tags?: Tag[];
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
  taskType: string;
  status: TaskStatus;
  progress?: number | null;
  step?: string | null;
  errorMessage?: string | null;
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
