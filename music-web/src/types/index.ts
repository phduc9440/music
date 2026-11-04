export interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: 'USER' | 'ADMIN';
  phone?: string;
  address?: string;
  authProvider?: 'LOCAL' | 'GOOGLE' | string;
}

export interface AuthResponse {
  token: string;
  refreshToken?: string;
  authenticated?: boolean;
}

export interface ApiResponse<T> {
  result: T;
  message?: string;
  code?: number;
}

export interface PageResponse<T> {
  data: T[];
  currentPage: number;
  totalPages: number;
  totalElements: number;
}

export interface PageRequest {
  page?: number;
  size?: number;
  sortBy?: string;
  order?: 'asc' | 'desc';
  keyword?: string;
}

export interface LoginRequest {
  username?: string;
  password?: string;
}

export interface RegisterRequest {
  username?: string;
  password?: string;
  email?: string;
  phone?: string;
  fullName?: string;
  address?: string;
}

export interface ChangePasswordRequest {
  oldPassword?: string;
  newPassword?: string;
}

export interface ForgotPasswordRequest {
  email?: string;
}

export interface ResetPasswordRequest {
  email?: string;
  otp?: string;
  newPassword?: string;
}

export interface AccountCreationRequest {
  username?: string;
  password?: string;
  email?: string;
  fullName?: string;
  role?: string;
}

export interface AccountUpdateRequest {
  email?: string;
  fullName?: string;
  password?: string;
}

export interface RefreshRequest {
  refreshToken?: string;
}

// ===================== Thư viện bản nhạc (khớp với DTO của music-be) =====================

export type ProcessingStatus = 'NONE' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type ScoreSource = 'OMR' | 'IMPORT' | 'MANUAL';
export type Visibility = 'PRIVATE' | 'PUBLIC';
export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type ScoreSort = 'newest' | 'oldest' | 'title';
export type TaskStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
/** Loại bản gốc khi upload OMR (BE: OmrSourceType), dùng cho thống kê SER 1.7. */
export type OmrSourceType = 'PHOTO' | 'SCAN' | 'PDF_NATIVE';

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

export interface ScoreListParams {
  page?: number;
  size?: number;
  keyword?: string;
  status?: ProcessingStatus | '';
  source?: ScoreSource | '';
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

// Kết quả POST /omr/upload
export interface OmrUploadResult {
  scoreId: string;
  title: string;
  processingStatus: ProcessingStatus;
}
