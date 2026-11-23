export interface MicPitchNote {
  pitchMidi: number;
  startTimeSeconds: number;
  amplitude: number;
}

export interface MicPitchLoadRequest {
  type: 'load';
  requestId: number;
  modelUrl: string;
}

export interface MicPitchAnalyzeRequest {
  type: 'analyze';
  requestId: number;
  samples: Float32Array;
}

export type MicPitchRequest = MicPitchLoadRequest | MicPitchAnalyzeRequest;

export interface MicPitchResponse {
  requestId: number;
  notes?: MicPitchNote[];
  error?: string;
}
