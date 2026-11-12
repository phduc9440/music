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
  isOfficial?: boolean | null;
  measureCount?: number | null;
  tags?: Tag[];
  /** Chỉ có trong danh sách "Được chia sẻ với tôi": email chủ sở hữu. */
  ownerEmail?: string | null;
  /** Chỉ có trong danh sách "Được chia sẻ với tôi". */
  accessLevel?: AccessLevel | null;
  thumbnailUrl?: string | null;
  /** Ảnh bìa người dùng tải lên (Cloudinary, địa chỉ tuyệt đối); null thì dùng thumbnailUrl. */
  coverUrl?: string | null;
  /** Bản trong kho mẫu: tên người phối (chủ bản gốc). */
  arrangerName?: string | null;
  /** Chỉ có trong trang Khám phá: tên người chia sẻ (không có email), lượt xem, điểm sao trung bình và số lượt chấm. */
  ownerName?: string | null;
  viewCount?: number | null;
  ratingAverage?: number | null;
  ratingCount?: number | null;
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
  keySignature?: string | null;
  timeSignature?: string | null;
  tempoBpm?: number | null;
  staffCount?: number | null;
  pageCount?: number | null;
  currentVersion?: number | null;
  viewCount?: number | null;
  ownerEmail?: string | null;
  /** Bản trong kho mẫu mà bạn là chủ của bản gốc: id bản gốc của bạn. */
  myOriginalScoreId?: string | null;
  canEdit: boolean;
  canDelete: boolean;
  canReview: boolean;
  averageRating?: number | null;
  ratingCount?: number;
  canManageSharing: boolean;
  /** Người xem có tải được MusicXML, MIDI, âm thanh, PDF không (chủ và người sửa luôn được). */
  canDownload: boolean;
  /** Chủ sở hữu đã cho người xem tải chưa; chỉ chủ sở hữu nhận giá trị thật. */
  allowDownload: boolean;
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
  /** Cho phép người xem tải MusicXML, MIDI, âm thanh, PDF (chỉ chủ sở hữu được đổi). */
  allowDownload?: boolean;
}

/** Một bản nhạc trong thùng rác, BE: TrashedScoreResponse. */
export interface TrashedScore {
  id: string;
  title: string;
  composer?: string | null;
  measureCount?: number | null;
  deletedAt: string;
  /** Thời điểm bị xóa hẳn. */
  purgeAt: string;
  /** true nếu quản trị viên xóa (kiểm duyệt). */
  deletedByAdmin: boolean;
  deleteReason?: string | null;
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
  | 'NEW_REVIEW'
  | 'ANNOUNCEMENT'
  | 'SCORE_TRASHED_BY_ADMIN'
  | 'OFFICIAL_REQUESTED'
  | 'OFFICIAL_ACCEPTED'
  | 'OFFICIAL_DECLINED'
  | 'PLAN_ACTIVATED'
  | 'PLAN_EXPIRING'
  | 'PLAN_REVOKED'
  | 'PLAN_BANNED'
  | 'PLAN_BAN_LIFTED'
  | 'TEAM_INVITED'
  | 'TEAM_MEMBER_JOINED'
  | 'TEAM_ROLE_CHANGED'
  | 'TEAM_REMOVED'
  | 'SHOW_ITEM_ASSIGNED'
  | 'SHOW_ITEM_SUBMITTED'
  | 'SHOW_ITEM_APPROVED'
  | 'SHOW_ITEM_RETURNED'
  | 'SHOW_ITEM_DUE'
  | 'TEAM_DELETED_BY_ADMIN'
  | 'TEAM_DELETED'
  | 'TEAM_RESTORED';

export interface AppNotification {
  id: string;
  type: NotificationType;
  scoreId?: string | null;
  /** Câu tiếng Việt dựng sẵn: dự phòng cho thông báo cũ và thông báo tự do của quản trị viên. */
  message: string;
  /** Tham số (title, name, level, reason, variant) để dựng câu theo ngôn ngữ của người đọc. */
  params?: Record<string, string> | null;
  read: boolean;
  createdAt: string;
}

// Playlist luyện tập, BE: PlaylistResponse
export interface Playlist {
  id: string;
  name: string;
  description?: string | null;
  scoreCount: number;
}

// Một bài trong playlist, BE: PlaylistItemResponse (position bắt đầu từ 1)
export interface PlaylistItem {
  scoreId: string;
  title: string;
  composer?: string | null;
  difficulty?: Difficulty | null;
  measureCount?: number | null;
  position: number;
}

// Phiên tập, BE: PracticeSessionResponse. mode: 1 = FREE, 2 = LOOP, 3 = TEST. errorLog chỉ có ở chi tiết.
export interface PracticeSessionRecord {
  id: string;
  scoreId: string;
  scoreTitle: string;
  mode: 1 | 2 | 3;
  tempoPercent?: number | null;
  loopStartMeasure?: number | null;
  loopEndMeasure?: number | null;
  startedAt?: string | null;
  endedAt?: string | null;
  durationSeconds?: number | null;
  totalNotes?: number | null;
  perfectCount?: number | null;
  earlyCount?: number | null;
  lateCount?: number | null;
  wrongPitchCount?: number | null;
  missedCount?: number | null;
  accuracyPct?: number | null;
  timingAccuracyPct?: number | null;
  scorePoints?: number | null;
  isCompleted?: boolean | null;
  errorLog?: unknown[] | null;
}

// Heatmap/streak luyện tập, BE: PracticeHeatmapDayResponse / PracticeStreakResponse (date dạng yyyy-MM-dd)
export interface PracticeHeatmapDay {
  date: string;
  sessionCount: number;
  totalSeconds: number;
}

export interface PracticeStreak {
  currentStreak: number;
  longestStreak: number;
  lastPracticeDate?: string | null;
  practicedToday: boolean;
}

// Thời gian luyện tập theo chu kỳ, BE: PracticeTimeBucketResponse (start/end dạng yyyy-MM-dd)
export type PracticePeriod = 'DAY' | 'WEEK' | 'MONTH';

export interface PracticeTimeBucket {
  start: string;
  end: string;
  totalSeconds: number;
  sessionCount: number;
}

// Điểm kỹ năng 0-100 cho biểu đồ radar, BE: PracticeSkillsResponse (sessionCount = 0 là chưa có dữ liệu)
export interface PracticeSkills {
  days: number;
  sessionCount: number;
  pitchAccuracy: number;
  timing: number;
  speed: number;
  diligence: number;
}

// Thể loại kèm số bản nhạc đang dùng, BE: AdminTagResponse
export interface AdminTag {
  id: string;
  name: string;
  slug: string;
  scoreCount: number;
}

// Giám sát hệ thống (admin), BE: SystemMetricsResponse / ErrorLogResponse. Số null = hệ điều hành không cung cấp.
export interface SystemMetrics {
  timestamp: string;
  startTime: string;
  uptimeSeconds: number;
  heapUsedBytes: number;
  heapMaxBytes: number;
  processCpuPercent?: number | null;
  systemCpuPercent?: number | null;
  loadAverage?: number | null;
  availableProcessors: number;
  physicalMemoryTotalBytes?: number | null;
  physicalMemoryFreeBytes?: number | null;
  threadCount: number;
  peakThreadCount: number;
  diskTotalBytes?: number | null;
  diskUsableBytes?: number | null;
  javaVersion: string;
  errorCountSinceStart: number;
}

export interface ErrorLogEntry {
  id: number;
  timestamp: string;
  level: string;
  logger: string;
  thread: string;
  message: string;
  exceptionClass?: string | null;
  stackTrace?: string | null;
}

// Thao tác hàng loạt trên bản nhạc, BE: AdminScoreBulkResponse
export interface BulkResult {
  success: number;
  failures: { id: string; message: string }[];
}

// Gửi thông báo chung, BE: AnnouncementRequest / AnnouncementResponse
export type AnnouncementAudience = 'ALL' | 'USERS' | 'ADMINS' | 'SELECTED';

// Thống kê dashboard admin, BE: AdminDashboardResponse
export interface DashboardTotals {
  members: number;
  activeMembers: number;
  lockedMembers: number;
  admins: number;
  scores: number;
  publicScores: number;
  pendingScores: number;
  officialScores: number;
  reviews: number;
  averageRating: number | null;
  practiceSessions: number;
  aiTasksRunning: number;
  aiTasksFailed: number;
}

export interface DashboardKeyCount {
  key: string;
  count: number;
}

export interface AdminDashboard {
  days: number;
  totals: DashboardTotals;
  scoresByDay: { date: string; count: number }[];
  membersByDay: { date: string; count: number }[];
  membersWithoutDate: number;
  practiceByDay: { date: string; sessions: number; minutes: number }[];
  scoresByVisibility: DashboardKeyCount[];
  scoresBySource: DashboardKeyCount[];
  scoresByDifficulty: DashboardKeyCount[];
  aiTasksByStatus: DashboardKeyCount[];
  topTags: DashboardKeyCount[];
  topViewed: { id: string; title: string; ownerEmail: string | null; viewCount: number }[];
  billing: DashboardBilling;
  revenueByDay: { date: string; amount: number; orders: number }[];
  /** Khóa là tên gói. */
  subscriptionsByPlan: DashboardKeyCount[];
  /** Khóa là SubscriptionSource: PAYMENT / POINTS_TRIAL / ADMIN_GRANT. */
  subscriptionsBySource: DashboardKeyCount[];
}

/** Số tiền tính trong `days` ngày gần nhất; gói, đơn chờ và lệnh cấm là trạng thái hiện tại. */
export interface DashboardBilling {
  revenue: number;
  paidOrders: number;
  refundedAmount: number;
  refundedOrders: number;
  activeSubscriptions: number;
  subscribedMembers: number;
  pendingOrders: number;
  activeBans: number;
}

// Giám sát tác vụ AI của admin, BE: AdminAiTaskResponse
export interface AdminAiTask {
  id: string;
  taskType: string;
  status: TaskStatus;
  step?: string | null;
  progress?: number | null;
  errorMessage?: string | null;
  retryCount?: number | null;
  scoreId?: string | null;
  scoreTitle?: string | null;
  memberEmail?: string | null;
  createdAt?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  waitSeconds?: number | null;
  runSeconds?: number | null;
  canCancel: boolean;
  canRetry: boolean;
  /** Chỉ có ở API chi tiết. */
  inputData?: unknown;
  resultData?: unknown;
}

export interface AiTaskSummary {
  pending: number;
  processing: number;
  failedLast24h: number;
  completedLast24h: number;
  averageRunSeconds: { taskType: string; seconds: number; count: number }[];
}

// Lời xin đưa bản nhạc vào kho bản nhạc mẫu (BE: OfficialRequestResponse)
export type OfficialRequestStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELED';

export interface OfficialRequest {
  id: string;
  scoreId: string;
  scoreTitle: string;
  composer?: string | null;
  status: OfficialRequestStatus;
  /** Quản trị viên đã xin (tên, hoặc email nếu chưa đặt tên). */
  requestedBy: string;
  /** Chỉ có ở danh sách của quản trị viên. */
  ownerEmail?: string | null;
  /** Bản sao trong kho mẫu, có khi chủ đã đồng ý. */
  copyScoreId?: string | null;
  createdAt?: string;
  resolvedAt?: string | null;
}
