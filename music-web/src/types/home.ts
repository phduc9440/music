import type { PracticeStreak, ScoreSummary } from './score';

/** GET /api/public/home: trang chủ cho khách (không có email hay dữ liệu riêng tư). */
export interface PublicHome {
  /** Bản công khai xem nhiều nhất; thumbnailUrl là ảnh công khai, khách tải được. */
  featured: ScoreSummary[];
  /** Tác giả có nhiều bản công khai nhất (gom theo tên, chưa có bảng nhạc sĩ). */
  composers: HomeComposer[];
  stats: HomeStats;
  generatedAt: string;
}

export interface HomeComposer {
  name: string;
  scoreCount: number;
  topTitles: string[];
}

export interface HomeStats {
  scores: number;
  publicScores: number;
  digitizedPages: number;
  practiceHours: number;
  members: number;
}

export type HomePendingType = 'ACCESS_REQUEST' | 'OFFICIAL_REQUEST';

export interface HomePendingItem {
  type: HomePendingType;
  scoreId: string;
  scoreTitle: string;
  actorName?: string | null;
  /** Với ACCESS_REQUEST: cấp xin VIEW / REVIEW / EDIT. */
  permission?: 'VIEW' | 'REVIEW' | 'EDIT' | null;
  createdAt?: string | null;
}

/** GET /api/home/summary: trang làm việc của người đã đăng nhập. */
export interface HomeSummary {
  displayName: string;
  streak: PracticeStreak;
  todayPracticeSeconds: number;
  recentScores: ScoreSummary[];
  pending: HomePendingItem[];
  accessRequestCount: number;
  officialRequestCount: number;
  pendingPublicCount: number;
  suggestion?: { reason: 'CONTINUE' | 'OFFICIAL'; score: ScoreSummary } | null;
}
