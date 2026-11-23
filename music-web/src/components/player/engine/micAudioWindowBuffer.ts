export const MIC_SAMPLE_RATE = 22050;
export const MIC_WINDOW_SAMPLES = MIC_SAMPLE_RATE * 2;
export const MIC_HOP_SAMPLES = MIC_WINDOW_SAMPLES - 30 * 256;

export interface MicAudioWindow {
  samples: Float32Array;
  startSample: number;
  coveredUntilSample: number;
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
      windows.push({
        samples: this.samples.slice(offset, offset + MIC_WINDOW_SAMPLES),
        startSample,
        coveredUntilSample: startSample + MIC_HOP_SAMPLES,
      });
      this.lastCoveredUntilSample = startSample + MIC_HOP_SAMPLES;
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

  finish(): MicAudioWindow | null {
    if (this.finished) throw new Error('Microphone audio buffer is already finished');
    this.finished = true;
    if (this.totalSamples <= this.lastCoveredUntilSample) return null;

    const startSample = Math.max(0, this.totalSamples - MIC_WINDOW_SAMPLES);
    const sourceOffset = startSample - this.bufferStartSample;
    const availableSamples = this.totalSamples - startSample;
    const samples = new Float32Array(MIC_WINDOW_SAMPLES);
    samples.set(this.samples.subarray(sourceOffset, sourceOffset + availableSamples));

    return {
      samples,
      startSample,
      coveredUntilSample: this.totalSamples,
    };
  }

  get durationMs(): number {
    return (this.totalSamples / MIC_SAMPLE_RATE) * 1000;
  }
}
