export type StudioMode = 'WAIT' | 'FREE_RUN';
export type StudioEventResult = 'PERFECT' | 'EARLY' | 'LATE' | 'WRONG_PITCH' | 'MISSED';

export interface StudioSessionFinishRequest {
  durationSeconds: number;
  reachedEnd: boolean;
  coveredUntilMs: number;
}

export interface StudioSessionSummary {
  id: string;
  scoreId: string;
  title: string;
  mode: StudioMode;
  tempoPercent: number;
  durationSeconds?: number | null;
  startedAt: string;
  scorePoints: number;
  accuracyPct?: number | null;
  timingAccuracyPct?: number | null;
  grade: string;
}

export interface StudioSessionCounts {
  total: number;
  perfect: number;
  early: number;
  late: number;
  wrongPitch: number;
  missed: number;
}

export interface StudioMeasureBreakdown {
  measure: number;
  perfect: number;
  early: number;
  late: number;
  wrongPitch: number;
  missed: number;
}

export interface StudioSessionReport {
  sessionId: string;
  scoreId: string;
  title: string;
  mode: StudioMode;
  tempoPercent: number;
  durationSeconds?: number | null;
  isCompleted: boolean;
  scorePoints: number;
  grade: string;
  accuracyPct?: number | null;
  timingAccuracyPct?: number | null;
  counts: StudioSessionCounts;
  measureBreakdown: StudioMeasureBreakdown[];
  weakestMeasures: number[];
  comparison: {
    previousScorePoints?: number | null;
    bestScorePoints?: number | null;
    isNewBest: boolean;
  };
  startedAt: string;
}
