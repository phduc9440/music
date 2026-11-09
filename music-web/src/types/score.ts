import type {
  Difficulty,
  OmrSourceType,
  ProcessingStatus,
  ScoreSort,
  ScoreSource,
  SharePermission,
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

// ---- Chia sẻ (BE: SharePermission lưu số) ----
export type ShareSource = 'DIRECT';
/** Cấp truy cập của người đang xem một bản nhạc. */
export type AccessLevel = 'OWNER' | 'EDIT' | 'REVIEW' | 'VIEW';

export interface ShareMember {
  memberId: string;
  email: string;
  fullName?: string | null;
  permission: SharePermission;
  source: ShareSource;
}

/** Quyền hiện có và yêu cầu đang chờ của tôi với một bản nhạc. */
export interface MyAccess {
  accessLevel: AccessLevel | null;
  requestedPermission: SharePermission | null;
}

/** Một yêu cầu xin quyền đang chờ chủ sở hữu duyệt. */
export interface AccessRequest {
  memberId: string;
  email: string;
  fullName?: string | null;
  requestedPermission: SharePermission;
  currentPermission?: SharePermission | null;
  message?: string | null;
  requestedAt?: string;
}

/** Một nhận xét (chấm sao và/hoặc bình luận), BE: ReviewResponse. */
export interface Review {
  id: string;
  memberId: string;
  email: string;
  fullName?: string | null;
  rating?: number | null;
  comment?: string | null;
  mine: boolean;
  canDelete: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ReviewList {
  averageRating: number | null;
  ratingCount: number;
  reviews: Review[];
}

export interface ScoreSharing {
  visibility: Visibility;
  members: ShareMember[];
  pendingRequests: number;
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
  /** Chỉ có trong danh sách "Được chia sẻ với tôi": email chủ sở hữu. */
  ownerEmail?: string | null;
  /** Chỉ có trong danh sách "Được chia sẻ với tôi". */
  accessLevel?: AccessLevel | null;
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
  canReview: boolean;
  averageRating?: number | null;
  ratingCount?: number;
  canManageSharing: boolean;
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
  tagId?: string;
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

/** Một ô nhịp của bản nhận diện (BE: OmrResultResponse.MeasureEntry). */
export interface OmrMeasure {
  /** Số ô trong MusicXML, đánh số liên tục từ 1. */
  measure: number;
  page: number;
  /** Hệ trên trang (từ 1); null nếu chưa biết chắc ô thuộc hệ nào. */
  system?: number | null;
  /** Khung ô trên ảnh trang đã tiền xử lý [x0, y0, x1, y1] (ảnh 1050x1485); null nếu chưa biết. */
  box?: [number, number, number, number] | null;
  /** DURATION: tổng trường độ sai số chỉ nhịp; COUNT_MISMATCH: số ô của hệ/trang lệch số ô đếm trên ảnh. */
  flags: ('DURATION' | 'COUNT_MISMATCH')[];
}

/** So số ô đếm trên ảnh với số ô đọc được (BE: OmrResultResponse.MeasureCheck). */
export interface OmrMeasureCheck {
  imageMeasures?: number | null;
  kernMeasures?: number | null;
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
  /** Bản đồ ô nhịp (rỗng với kết quả cũ). */
  measureMap?: OmrMeasure[];
  measureCheck?: OmrMeasureCheck | null;
  kernFileId?: string | null;
  musicXmlFileId?: string | null;
  midiFileId?: string | null;
}

// Thông báo trong ứng dụng, BE: NotificationResponse
export type NotificationType =
  | 'ACCESS_REQUESTED'
  | 'ACCESS_APPROVED'
  | 'ACCESS_REJECTED'
  | 'SHARED_WITH_YOU'
  | 'PUBLISH_REQUESTED'
  | 'PUBLISH_APPROVED'
  | 'PUBLISH_REJECTED'
  | 'NEW_REVIEW';

export interface AppNotification {
  id: string;
  type: NotificationType;
  scoreId?: string | null;
  message: string;
  read: boolean;
  createdAt: string;
}
