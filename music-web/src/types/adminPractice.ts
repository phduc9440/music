/** Quản lý luyện tập của admin (BE: AdminPracticeSessionResponse). */
export type PracticeAnomaly = 'SHORT' | 'LONG' | 'ZERO_ACCURACY' | 'STUCK';

export interface AdminPracticeSession {
  id: string;
  memberId: string;
  memberEmail: string;
  memberName?: string | null;
  scoreId: string;
  scoreTitle?: string | null;
  mode?: string | null;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
  startedAt?: string | null;
  endedAt?: string | null;
  durationSeconds?: number | null;
  tempoPercent?: number | null;
  totalNotes?: number | null;
  accuracyPct?: number | null;
  scorePoints?: number | null;
  anomalies: PracticeAnomaly[];
  canClose: boolean;
}

export interface AdminPracticeOverview {
  from: string;
  to: string;
  sessions: number;
  minutes: number;
  averageAccuracy: number | null;
  completionRate: number | null;
  activeMembers: number;
  anomalous: number;
  byDay: { date: string; sessions: number; minutes: number }[];
}
