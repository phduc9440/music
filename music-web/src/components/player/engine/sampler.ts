/**
 * Piano mẫu âm: tải các file mp3 render sẵn từ MuseScore_General (xem tools/render_piano_samples.py), chọn mẫu gần
 * nhất và đổi cao độ bằng `playbackRate`. Nạp một lần cho cả trang, dùng chung cho Editor và Player.
 *
 * Lỗi tải một phần (sau khi thử lại một lần) đưa sampler về trạng thái "error"; nơi gọi tự chuyển sang piano tổng hợp
 * của `instruments.ts` và báo "Đang dùng âm thanh thay thế".
 */
import { getMaster } from '../../editor/audio/instruments';
import { levelDriveDb } from '../../editor/audio/loudness';
import type { Voice } from '../../editor/audio/instruments';
import type { SoundQuality } from '../state/settings';

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
  /**
   * Nốt nối (một âm gộp từ nhiều nốt): giữ tiếng không tắt hẳn suốt `duration`. Piano thật tắt rất nhanh (mẫu C4 mất 25 dB sau 1
   * giây) nên nếu cứ để tắt tự nhiên, phần nối nghe như đã dứt.
   */
  sustain?: boolean;
}

/** Đoạn mẫu được lặp lại để giữ tiếng, và đường bao to nhỏ của mẫu. */
export interface SustainLoop {
  /** Vị trí (giây, trong mẫu) bắt đầu và kết thúc vòng lặp. */
  start: number;
  end: number;
  /** Độ dài (giây) đoạn trộn đầu vòng lặp với phần mẫu nối tiếp sau `end` để chỗ nối vòng liền mạch (xem `buildLoopData`). */
  xfade: number;
  /** Mức to nhỏ (dB, so với đỉnh lúc đánh) của mẫu, lấy mỗi `ENV_STEP_S` giây kể từ đầu mẫu. */
  envDb: Float32Array;
}

/** Bước lấy đường bao (giây). */
export const ENV_STEP_S = 0.02;
/** Độ dài vòng lặp mong muốn (giây); thực tế làm tròn thành số nguyên chu kỳ của âm gốc. */
const LOOP_TARGET_S = 0.4;
/** Vòng lặp không bắt đầu trước mốc này (giây) để bỏ phần va chạm lúc đánh, và không kết thúc sát đuôi mẫu. */
const LOOP_MIN_START_S = 0.3;
const LOOP_END_MARGIN_S = 0.4;
/** Bỏ qua đoạn mẫu đã yếu hơn mức này (dB so với đỉnh): chỉ còn tạp âm, khuếch đại lên sẽ nghe rõ. */
const LOOP_MIN_LEVEL_DB = -62;
const LOOP_XFADE_S = 0.1;
/** Nốt nối được giữ ở mức tối thiểu này (dB so với lúc đánh) rồi mới tắt chậm; khuếch đại thêm tối đa `BOOST_MAX_DB`. */
export const SUSTAIN_FLOOR_DB = -13;
const BOOST_MAX_DB = 38;
/** Sau khi vào vòng lặp, tiếng tắt chậm dần theo hằng số thời gian này (giây), khoảng -2,5 dB mỗi giây. */
const SUSTAIN_TAU_S = 3.5;
/** Nốt nối ngắn hơn mức này (giây) thì để mẫu tắt tự nhiên. */
const SUSTAIN_MIN_S = 0.6;
const CURVE_STEP_S = 0.02;

/**
 * Tìm đoạn mẫu để lặp: đoạn ít tắt dần nhất sau lúc đánh, dài đúng một số nguyên chu kỳ của âm gốc (để hai đầu vòng
 * lặp khớp pha), bắt đầu ở điểm cắt không đi lên. Trả về null nếu mẫu không có đoạn nào dùng được.
 */
export function analyseSustain(data: Float32Array, sampleRate: number, midi: number): SustainLoop | null {
  const win = Math.round(ENV_STEP_S * sampleRate);
  const count = Math.floor(data.length / win);
  const duration = data.length / sampleRate;
  if (count < 20) return null;
  const envDb = new Float32Array(count);
  let peak = -Infinity;
  for (let i = 0; i < count; i++) {
    let sum = 0;
    for (let j = i * win; j < (i + 1) * win; j++) sum += data[j] * data[j];
    envDb[i] = 10 * Math.log10(sum / win + 1e-12);
    if (i * ENV_STEP_S < 0.15) peak = Math.max(peak, envDb[i]);
  }
  for (let i = 0; i < count; i++) envDb[i] -= peak;

  const f0 = 440 * Math.pow(2, (midi - 69) / 12);
  const cycles = Math.max(1, Math.round(LOOP_TARGET_S * f0));
  const length = cycles / f0;
  const span = Math.max(1, Math.round(length / ENV_STEP_S));
  let best = -1;
  let bestScore = Infinity;
  for (let i = Math.ceil(LOOP_MIN_START_S / ENV_STEP_S); i + span < count; i++) {
    if (i * ENV_STEP_S + length > duration - LOOP_END_MARGIN_S) break;
    const a = envDb[i];
    if (a < LOOP_MIN_LEVEL_DB) break;
    // Ít tắt dần trong vòng, mức còn đủ lớn, và bắt đầu càng sớm càng tốt
    const score = Math.abs(a - envDb[i + span]) + 0.04 * -a + 0.3 * i * ENV_STEP_S;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  if (best < 0) return null;

  // Lùi/tiến tới điểm cắt không đi lên gần nhất (trong một chu kỳ) để chỗ nối vòng lặp không bị "tách"
  const from = Math.round(best * ENV_STEP_S * sampleRate);
  const period = Math.max(2, Math.round(sampleRate / f0));
  let start = from;
  for (let k = from; k < Math.min(from + period, data.length - 1); k++) {
    if (data[k] <= 0 && data[k + 1] > 0) {
      start = k + 1;
      break;
    }
  }
  const startS = start / sampleRate;
  if (startS + length > duration - 0.05) return null;
  return { start: startS, end: startS + length, xfade: Math.min(LOOP_XFADE_S, length / 3), envDb };
}

/**
 * Dữ liệu một kênh của vòng lặp đã trộn: `n` mẫu từ `loop.start`, đoạn đầu trộn dần từ phần mẫu nối tiếp ngay sau `loop.end`
 * sang đoạn gốc. Nhờ vậy cuối vòng lặp nối sang đầu vòng lặp đúng như mẫu gốc chạy tiếp (không bị nhảy sóng), và vào vòng
 * lặp tại vị trí `xfade` thì liền với mẫu gốc đang phát (mẫu gốc phát đến `start + xfade` rồi chuyển sang vòng lặp).
 */
export function buildLoopData(data: Float32Array, sampleRate: number, loop: SustainLoop): Float32Array<ArrayBuffer> {
  const from = Math.round(loop.start * sampleRate);
  const n = Math.round((loop.end - loop.start) * sampleRate);
  const xf = Math.round(loop.xfade * sampleRate);
  const out = data.slice(from, from + n);
  for (let i = 0; i < xf && from + n + i < data.length; i++) {
    const w = i / xf;
    out[i] = data[from + i] * w + data[from + n + i] * (1 - w);
  }
  return out;
}

/** Mức to nhỏ (dB so với đỉnh) của mẫu tại vị trí `pos` giây trong mẫu. */
const envAt = (loop: SustainLoop, pos: number): number => {
  const x = Math.max(0, pos) / ENV_STEP_S;
  const i = Math.min(loop.envDb.length - 1, Math.floor(x));
  const j = Math.min(loop.envDb.length - 1, i + 1);
  return loop.envDb[i] + (loop.envDb[j] - loop.envDb[i]) * (x - i);
};

/**
 * Đường khuếch đại (tuyến tính) theo thời gian của context từ lúc đánh tới lúc mẫu vào vòng lặp: giữ tiếng không thấp hơn
 * `SUSTAIN_FLOOR_DB` nên chỉ tăng chứ không bao giờ giảm. Mẫu phát với tốc độ `rate`.
 */
export function sustainCurve(loop: SustainLoop, rate: number): Float32Array {
  const enter = loop.start + loop.xfade;
  const steps = Math.max(2, Math.ceil(enter / rate / CURVE_STEP_S) + 1);
  const curve = new Float32Array(steps);
  let boost = 0;
  for (let i = 0; i < steps; i++) {
    const natural = envAt(loop, Math.min(enter, i * CURVE_STEP_S * rate));
    boost = Math.max(boost, Math.min(BOOST_MAX_DB, SUSTAIN_FLOOR_DB - natural));
    curve[i] = Math.pow(10, boost / 20);
  }
  return curve;
}

interface Sustain {
  loop: SustainLoop;
  /** Vòng lặp đã trộn (mọi kênh của mẫu gốc). */
  buffer: AudioBuffer;
}

const sustainCache = new WeakMap<AudioBuffer, Sustain | null>();
const sustainOf = (ctx: BaseAudioContext, buffer: AudioBuffer, midi: number): Sustain | null => {
  const cached = sustainCache.get(buffer);
  if (cached !== undefined) return cached;
  const loop = analyseSustain(buffer.getChannelData(0), buffer.sampleRate, midi);
  let result: Sustain | null = null;
  if (loop) {
    const first = buildLoopData(buffer.getChannelData(0), buffer.sampleRate, loop);
    const looped = ctx.createBuffer(buffer.numberOfChannels, first.length, buffer.sampleRate);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      looped.copyToChannel(c === 0 ? first : buildLoopData(buffer.getChannelData(c), buffer.sampleRate, loop), c);
    }
    result = { loop, buffer: looped };
  }
  sustainCache.set(buffer, result);
  return result;
};

const MAX_PARALLEL = 6;
/** Dưới mức to nhỏ này (dB so với mf, xem levelDriveDb) dùng lớp lực nhẹ (velocity 60), còn lại dùng lớp mạnh (110). */
const SOFT_LAYER_BELOW_DB = -6.5;
/** Biên độ (dB) của lớp mạnh ở mức mf. Mẫu mạnh có đỉnh gần −3 dBFS, nên mf để dư chỗ cho ff, fff mà không vỡ tiếng. */
const MF_AMPLITUDE_DB = -5;
/** Lớp nhẹ được ghi nhỏ hơn lớp mạnh chừng 9,5 dB (đo trên 30 mẫu); bù lại để chuyển lớp không làm nhảy âm lượng. */
const SOFT_LAYER_OFFSET_DB = 9.5;
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
    const drive = levelDriveDb(note.level);
    const soft = this.quality === 'high' && drive < SOFT_LAYER_BELOW_DB && sample.buffers.has('v60');
    const layer = soft ? 'v60' : sample.buffers.has('v110') ? 'v110' : (sample.buffers.keys().next().value as string);
    const buffer = sample.buffers.get(layer);
    if (!buffer) return null;
    const amp = Math.min(
      2,
      Math.max(0.02, Math.pow(10, (MF_AMPLITUDE_DB + drive + (soft ? SOFT_LAYER_OFFSET_DB : 0)) / 20)),
    );

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const rate = Math.pow(2, (note.midi - sample.midi) / 12);
    source.playbackRate.value = rate;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, note.start);
    env.gain.linearRampToValueAtTime(amp, note.start + 0.003);
    const releaseAt = note.start + Math.max(0.05, note.duration);
    env.gain.setValueAtTime(amp, releaseAt);
    env.gain.setTargetAtTime(0, releaseAt, RELEASE_TAU);
    const sustain = note.sustain && note.duration >= SUSTAIN_MIN_S ? sustainOf(ctx, buffer, sample.midi) : null;
    const endsAt = releaseAt + TAIL_S;
    let tail: AudioBufferSourceNode | null = null;
    if (sustain) {
      // Nốt nối: mẫu gốc phát tới đầu vòng lặp rồi chuyển sang vòng lặp (liền mạch, không đánh lại phím), kèm đường khuếch
      // đại giữ tiếng không tụt dưới ngưỡng và tắt chậm sau đó
      const { loop } = sustain;
      const enter = (loop.start + loop.xfade) / rate;
      const hold = ctx.createGain();
      hold.gain.setValueCurveAtTime(sustainCurve(loop, rate), note.start, Math.max(CURVE_STEP_S, enter));
      hold.gain.setTargetAtTime(0.0001, note.start + Math.max(CURVE_STEP_S, enter) + 0.002, SUSTAIN_TAU_S);
      source.connect(hold).connect(env);
      source.start(note.start);
      source.stop(Math.min(endsAt, note.start + enter));
      if (note.start + enter < endsAt) {
        tail = ctx.createBufferSource();
        tail.buffer = sustain.buffer;
        tail.playbackRate.value = rate;
        tail.loop = true;
        tail.connect(hold);
        tail.start(note.start + enter, loop.xfade);
        tail.stop(endsAt);
      }
    } else {
      source.connect(env);
      source.start(note.start);
      source.stop(endsAt);
    }
    env.connect(note.destination ?? getMaster(ctx));

    return {
      endsAt,
      kill: () => {
        try {
          const now = ctx.currentTime;
          env.gain.cancelScheduledValues(now);
          env.gain.setValueAtTime(Math.max(0.0001, env.gain.value), now);
          env.gain.linearRampToValueAtTime(0, now + 0.04);
          source.stop(now + 0.05);
          tail?.stop(now + 0.05);
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
