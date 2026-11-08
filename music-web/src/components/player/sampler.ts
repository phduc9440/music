/**
 * Piano mẫu âm: tải các file mp3 render sẵn từ MuseScore_General (xem tools/render_piano_samples.py), chọn mẫu gần
 * nhất và đổi cao độ bằng `playbackRate`. Nạp một lần cho cả trang, dùng chung cho Editor và Player.
 *
 * Lỗi tải một phần (sau khi thử lại một lần) đưa sampler về trạng thái "error"; nơi gọi tự chuyển sang piano tổng hợp
 * của `instruments.ts` và báo "Đang dùng âm thanh thay thế".
 */
import { getMaster } from '../editor/instruments';
import type { Voice } from '../editor/instruments';
import type { SoundQuality } from './settings';

export type SamplerState = 'idle' | 'loading' | 'ready' | 'error' | 'unsupported';

export interface SamplerSnapshot {
  state: SamplerState;
  /** 0–1. */
  progress: number;
  quality: SoundQuality;
}

interface Manifest {
  version: number;
  sampleSeconds: number;
  layers: { id: string; velocity: number }[];
  samples: { note: string; midi: number; files: Record<string, string> }[];
  light: { layer: string; midis: number[] };
}

interface Loaded {
  midi: number;
  buffers: Map<string, AudioBuffer>;
}

export interface SamplerNote {
  midi: number;
  /** Giây theo đồng hồ của context. */
  start: number;
  duration: number;
  /** 0–1; 0,8 là mf. */
  level: number;
  destination?: AudioNode;
}

const MAX_PARALLEL = 6;
/** Dưới mức này dùng lớp lực nhẹ (velocity 60), còn lại dùng lớp mạnh (velocity 110). */
const SOFT_LAYER_BELOW = 0.62;
/** Mức `level` mà mỗi lớp lực được ghi sẵn, dùng để chỉnh to nhỏ phần còn lại. */
const REFERENCE_LEVEL = { soft: 0.45, loud: 0.8 };
const RELEASE_TAU = 0.1;
const TAIL_S = 0.8;

const baseUrl = (): string => {
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return `${base.endsWith('/') ? base : `${base}/`}samples/piano/v1/`;
};

export class PianoSampler {
  private state: SamplerState = 'idle';
  private progress = 0;
  private quality: SoundQuality = 'high';
  private snapshot: SamplerSnapshot = { state: 'idle', progress: 0, quality: 'high' };
  private manifest: Manifest | null = null;
  private samples: Loaded[] = [];
  private loading: Promise<void> | null = null;
  private listeners = new Set<() => void>();

  getSnapshot = (): SamplerSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private update(patch: Partial<Pick<SamplerSnapshot, 'state' | 'progress' | 'quality'>>): void {
    this.state = patch.state ?? this.state;
    this.progress = patch.progress ?? this.progress;
    this.quality = patch.quality ?? this.quality;
    this.snapshot = { state: this.state, progress: this.progress, quality: this.quality };
    this.listeners.forEach((l) => l());
  }

  /**
   * Tải mẫu âm. Gọi lại khi đang tải thì dùng lại lượt tải đó; gọi lại sau lỗi thì chỉ tải các file còn thiếu.
   * @param base thư mục chứa manifest.json (mặc định theo BASE_URL của Vite)
   */
  load(ctx: BaseAudioContext, quality: SoundQuality = 'high', base: string = baseUrl()): Promise<void> {
    if (typeof AudioContext === 'undefined' && !(window as { webkitAudioContext?: unknown }).webkitAudioContext) {
      this.update({ state: 'unsupported' });
      return Promise.resolve();
    }
    if (this.state === 'ready' && this.quality === quality) return Promise.resolve();
    if (this.loading && this.quality === quality) return this.loading;
    this.update({ state: 'loading', progress: 0, quality });
    this.loading = this.run(ctx, quality, base).finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  private async run(ctx: BaseAudioContext, quality: SoundQuality, base: string): Promise<void> {
    try {
      this.manifest ??= await this.withRetry(() => this.fetchJson<Manifest>(`${base}manifest.json`));
      const manifest = this.manifest;
      const light = quality === 'light';
      const layers = light ? [manifest.light.layer] : manifest.layers.map((l) => l.id);
      const wanted = manifest.samples.filter((s) => !light || manifest.light.midis.includes(s.midi));
      const jobs: { midi: number; layer: string; url: string }[] = [];
      for (const sample of wanted) {
        const loaded = this.samples.find((s) => s.midi === sample.midi);
        for (const layer of layers) {
          if (!loaded?.buffers.has(layer)) jobs.push({ midi: sample.midi, layer, url: base + sample.files[layer] });
        }
      }
      const total = Math.max(1, jobs.length);
      let done = 0;
      let failed = 0;
      let next = 0;
      const worker = async (): Promise<void> => {
        while (next < jobs.length) {
          const job = jobs[next++];
          try {
            const buffer = await this.withRetry(() => this.fetchBuffer(ctx, job.url));
            let entry = this.samples.find((s) => s.midi === job.midi);
            if (!entry) {
              entry = { midi: job.midi, buffers: new Map() };
              this.samples.push(entry);
              this.samples.sort((a, b) => a.midi - b.midi);
            }
            entry.buffers.set(job.layer, buffer);
          } catch {
            failed += 1;
          }
          done += 1;
          this.update({ progress: done / total });
        }
      };
      await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL, jobs.length) }, worker));
      this.update({ state: failed === 0 ? 'ready' : 'error', progress: failed === 0 ? 1 : this.progress });
    } catch {
      this.update({ state: 'error' });
    }
  }

  private async withRetry<T>(task: () => Promise<T>): Promise<T> {
    try {
      return await task();
    } catch {
      return task();
    }
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as T;
  }

  private async fetchBuffer(ctx: BaseAudioContext, url: string): Promise<AudioBuffer> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return ctx.decodeAudioData(await response.arrayBuffer());
  }

  /** Mẫu gần nhất về cao độ (hai mẫu bằng nhau thì lấy mẫu thấp hơn). */
  private nearest(midi: number): Loaded | null {
    const usable = this.samples;
    if (usable.length === 0) return null;
    let best = usable[0];
    for (const sample of usable) {
      if (Math.abs(sample.midi - midi) < Math.abs(best.midi - midi)) best = sample;
    }
    return best;
  }

  /** Hẹn giờ một nốt piano; null nếu sampler chưa sẵn sàng (nơi gọi dùng piano tổng hợp thay thế). */
  play(ctx: BaseAudioContext, note: SamplerNote): Voice | null {
    if (this.state !== 'ready') return null;
    const sample = this.nearest(note.midi);
    if (!sample) return null;
    const soft = this.quality === 'high' && note.level < SOFT_LAYER_BELOW && sample.buffers.has('v60');
    const layer = soft ? 'v60' : sample.buffers.has('v110') ? 'v110' : (sample.buffers.keys().next().value as string);
    const buffer = sample.buffers.get(layer);
    if (!buffer) return null;
    const reference = soft ? REFERENCE_LEVEL.soft : REFERENCE_LEVEL.loud;
    const amp = Math.min(1.2, Math.max(0.15, Math.pow(note.level / reference, 0.8)));

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = Math.pow(2, (note.midi - sample.midi) / 12);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, note.start);
    env.gain.linearRampToValueAtTime(amp, note.start + 0.003);
    const releaseAt = note.start + Math.max(0.05, note.duration);
    env.gain.setValueAtTime(amp, releaseAt);
    env.gain.setTargetAtTime(0, releaseAt, RELEASE_TAU);
    source.connect(env).connect(note.destination ?? getMaster(ctx));
    source.start(note.start);
    const endsAt = releaseAt + TAIL_S;
    source.stop(endsAt);

    return {
      endsAt,
      kill: () => {
        try {
          const now = ctx.currentTime;
          env.gain.cancelScheduledValues(now);
          env.gain.setValueAtTime(Math.max(0.0001, env.gain.value), now);
          env.gain.linearRampToValueAtTime(0, now + 0.04);
          source.stop(now + 0.05);
        } catch {
          // nguồn đã dừng
        }
      },
    };
  }
}

let shared: PianoSampler | null = null;

/** Sampler dùng chung cho cả trang. */
export const getPianoSampler = (): PianoSampler => (shared ??= new PianoSampler());
