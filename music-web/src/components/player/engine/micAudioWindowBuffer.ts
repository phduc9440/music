export const MIC_SAMPLE_RATE = 22050;
/** Hai cửa sổ liền nhau chồng lên nhau 30 khung (mỗi khung 256 mẫu, ~348 ms), như cách Basic Pitch tự cắt âm thanh dài. */
export const MIC_OVERLAP_SAMPLES = 30 * 256;
/**
 * Độ dài cửa sổ (~1,64 s) vừa đúng một lần chạy mô hình: Basic Pitch đọc từng đoạn 2 s − 256 mẫu, đệm lặng 174 ms ở đầu
 * và bỏ 174 ms ở mỗi mép. Cửa sổ dài hơn thì thư viện tự cắt thêm một lần bên trong, tạo một mép mới giữa cửa sổ và nốt
 * đang ngân ở đó bị đọc thành nốt mới.
 */
export const MIC_WINDOW_SAMPLES = MIC_SAMPLE_RATE * 2 - 256 - MIC_OVERLAP_SAMPLES;
export const MIC_HOP_SAMPLES = MIC_WINDOW_SAMPLES - MIC_OVERLAP_SAMPLES;
/**
 * Ranh giới giữa hai cửa sổ đặt ở giữa phần chồng lấn chứ không ở mép đầu cửa sổ sau. Ở mép đầu, mô hình không có âm
 * thanh phía trước nên nốt đang ngân bị đọc thành nốt vừa đánh (nốt thừa, chấm thành sai cao độ). Đặt ở giữa thì cửa sổ
 * nào cũng chỉ nhận nốt cách mép ít nhất ~174 ms.
 */
export const MIC_EDGE_SAMPLES = MIC_OVERLAP_SAMPLES / 2;

export interface MicAudioWindow {
  samples: Float32Array;
  startSample: number;
  /** Cửa sổ này chịu trách nhiệm cho các nốt bắt đầu trong [ownedFromSample, coveredUntilSample). */
  ownedFromSample: number;
  coveredUntilSample: number;
}

/** Nốt mô hình đọc được trong một cửa sổ (thời điểm tính từ đầu cửa sổ). */
export interface WindowPitchNote {
  pitchMidi: number;
  startTimeSeconds: number;
}

/**
 * Nốt thuộc phần cửa sổ chịu trách nhiệm, đổi sang thời điểm tính từ lúc bắt đầu thu và trừ độ trễ bù (ms). Lọc theo
 * thời điểm gốc (chưa trừ độ trễ, chưa làm tròn) để mỗi nốt được đúng một cửa sổ nhận.
 */
export function ownedNotes(
  window: MicAudioWindow,
  notes: readonly WindowPitchNote[],
  compensationMs: number,
): { midi: number; playedMs: number }[] {
  return notes
    .map((note) => ({
      midi: note.pitchMidi,
      sample: window.startSample + note.startTimeSeconds * MIC_SAMPLE_RATE,
    }))
    .filter((note) => note.sample >= window.ownedFromSample && note.sample < window.coveredUntilSample)
    .map((note) => ({
      midi: note.midi,
      playedMs: Math.max(0, Math.round((note.sample / MIC_SAMPLE_RATE) * 1000 - compensationMs)),
    }))
    .sort((left, right) => left.playedMs - right.playedMs || left.midi - right.midi);
}

/** Hai lần nghe cùng một phím cách nhau dưới khoảng này coi là một nốt (không ai đánh lại một phím nhanh như vậy). */
export const MIC_DUPLICATE_MS = 60;

/**
 * Chọn nốt mới của từng cửa sổ: nốt thuộc phần cửa sổ chịu trách nhiệm, bỏ nốt trùng với nốt vừa nhận ở cửa sổ trước.
 * Nốt đánh sát ranh giới có thể được cả hai cửa sổ đọc ra, mỗi bên lệch một khung (~12 ms) sang một phía ranh giới.
 */
export class MicNoteTracker {
  private recent: { midi: number; playedMs: number }[] = [];

  take(
    window: MicAudioWindow,
    notes: readonly WindowPitchNote[],
    compensationMs: number,
  ): { midi: number; playedMs: number }[] {
    const fresh = ownedNotes(window, notes, compensationMs).filter(
      (note) =>
        !this.recent.some(
          (seen) => seen.midi === note.midi && Math.abs(seen.playedMs - note.playedMs) < MIC_DUPLICATE_MS,
        ),
    );
    const newest = Math.max(0, ...fresh.map((note) => note.playedMs), ...this.recent.map((note) => note.playedMs));
    this.recent = [...this.recent, ...fresh].filter((note) => note.playedMs >= newest - 2 * MIC_DUPLICATE_MS);
    return fresh;
  }
}

export class MicAudioWindowBuffer {
  private samples = new Float32Array(0);
  private bufferStartSample = 0;
  private totalSamples = 0;
  private nextWindowEnd = MIC_WINDOW_SAMPLES;
  private lastCoveredUntilSample = 0;
  private finished = false;

  append(chunk: Float32Array): MicAudioWindow[] {
    if (this.finished) throw new Error('Microphone audio buffer is already finished');
    if (chunk.length === 0) return [];

    const combined = new Float32Array(this.samples.length + chunk.length);
    combined.set(this.samples);
    combined.set(chunk, this.samples.length);
    this.samples = combined;
    this.totalSamples += chunk.length;

    const windows: MicAudioWindow[] = [];
    while (this.totalSamples >= this.nextWindowEnd) {
      const startSample = this.nextWindowEnd - MIC_WINDOW_SAMPLES;
      const offset = startSample - this.bufferStartSample;
      const coveredUntilSample = startSample + MIC_HOP_SAMPLES + MIC_EDGE_SAMPLES;
      windows.push({
        samples: this.samples.slice(offset, offset + MIC_WINDOW_SAMPLES),
        startSample,
        ownedFromSample: this.lastCoveredUntilSample,
        coveredUntilSample,
      });
      this.lastCoveredUntilSample = coveredUntilSample;
      this.nextWindowEnd += MIC_HOP_SAMPLES;
    }

    const nextStartSample = Math.max(
      0,
      Math.min(this.nextWindowEnd - MIC_WINDOW_SAMPLES, this.totalSamples - MIC_WINDOW_SAMPLES),
    );
    const trimCount = nextStartSample - this.bufferStartSample;
    if (trimCount > 0) {
      this.samples = this.samples.slice(trimCount);
      this.bufferStartSample = nextStartSample;
    }
    return windows;
  }

  /** Cửa sổ cuối: bắt đầu đúng chỗ cửa sổ kế tiếp lẽ ra bắt đầu, phần thiếu điền lặng, nhận nốt tới hết âm thanh. */
  finish(): MicAudioWindow | null {
    if (this.finished) throw new Error('Microphone audio buffer is already finished');
    this.finished = true;
    if (this.totalSamples <= this.lastCoveredUntilSample) return null;

    const startSample = this.nextWindowEnd - MIC_WINDOW_SAMPLES;
    const sourceOffset = startSample - this.bufferStartSample;
    const samples = new Float32Array(MIC_WINDOW_SAMPLES);
    samples.set(this.samples.subarray(sourceOffset, sourceOffset + (this.totalSamples - startSample)));

    return {
      samples,
      startSample,
      ownedFromSample: this.lastCoveredUntilSample,
      coveredUntilSample: this.totalSamples,
    };
  }

  get durationMs(): number {
    return (this.totalSamples / MIC_SAMPLE_RATE) * 1000;
  }
}
