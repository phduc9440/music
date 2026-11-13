/** Mẫu nhạc cụ của bản nhạc trống (khớp enum BlankPreset của BE). */
export type BlankPreset = 'PIANO' | 'VOICE_PIANO' | 'GUITAR' | 'SATB';

export type KeyMode = 'MAJOR' | 'MINOR';

/** Body của POST /scores/blank. */
export interface BlankScoreRequest {
  title: string;
  composer?: string;
  preset: BlankPreset;
  /** Số dấu hóa của hóa biểu: −7 (7 giáng) … +7 (7 thăng). */
  keyFifths: number;
  mode: KeyMode;
  beats: number;
  beatType: number;
  tempoBpm: number;
  measures: number;
}

export interface BlankScoreResult {
  scoreId: string;
  version: number;
}
