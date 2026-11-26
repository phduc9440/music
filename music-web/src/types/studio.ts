export type StudioMode = 'WAIT' | 'FREE_RUN';
export type StudioEventResult = 'PERFECT' | 'EARLY' | 'LATE' | 'WRONG_PITCH' | 'MISSED';
export type StudioHand = 'LEFT' | 'RIGHT';
export type StudioHandMode = 'BOTH' | 'RIGHT_ONLY' | 'LEFT_ONLY';
export type StudioInputSource = 'MIDI' | 'KEYBOARD' | 'TOUCH' | 'MIC';

export interface StudioSessionCreateRequest {
  scoreId: string;
  mode: StudioMode;
  inputSource: StudioInputSource;
  handMode: StudioHandMode;
  tempoPercent: number;
  loopStartMeasure: number | null;
  loopEndMeasure: number | null;
}

export interface StudioSessionResponse {
  sessionId: string;
  scoreId: string;
  mode: StudioMode;
  inputSource: StudioInputSource;
  handMode: StudioHandMode;
  status: string;
  tempoPercent: number;
  loopStartMeasure: number | null;
  loopEndMeasure: number | null;
  startedAt: string;
  serverTime: string;
  scorableNotesInRange: number;
}

export interface StudioNoteEvent {
  seq: number;
  noteId: string | null;
  measure: number | null;
  hand: StudioHand | null;
  expectedMidi: number | null;
  playedMidi: number | null;
  expectedMs: number | null;
  playedMs: number | null;
  deltaMs: number | null;
  result: StudioEventResult;
}

export interface StudioEventBatchResponse {
  accepted: number;
  duplicates: number;
  lastSeq: number | null;
}

export interface StudioTimeline {
  scoreId: string;
  contentHash: string;
  title: string;
  measureCount: number;
  tempoBpm: number;
  timeSignatures: { measure: number; beats: number; beatType: number }[];
  tempoChanges: { measure: number; bpm: number }[];
  /**
   * Các ô theo thứ tự phát (dấu nhắc lại đã mở, ST-08): `index` là thứ tự phát từ 1, `source` là số ô trên bản nhạc
   * (null ở timeline cũ).
   */
  measures: { index: number; startBeat: number; beats: number; source?: number | null }[];
  notes: {
    id: string;
    measure: number;
    staff: number;
    hand: StudioHand | null;
    midi: number;
    startBeat: number;
    durationBeat: number;
    scorable: boolean;
    chordGroupId: string | null;
    osmd: { measureIndex: number; voice: number; entryIndex: number } | null;
  }[];
  steps: { stepIndex: number; startBeat: number; noteIds: string[] }[];
  warnings: string[];
}

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
