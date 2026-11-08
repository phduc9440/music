/**
 * Bộ phát (sequencer) của Player trên Web Audio API: đồng hồ, hẹn giờ nốt theo cửa sổ nhìn trước, Play / Pause / Stop /
 * Seek. Cùng nguyên lý với Tone.Transport nhưng dùng thẳng dòng thời gian của Editor (lặp lại, fermata, tempo đổi giữa
 * ô) nên chỉ có một đồng hồ.
 *
 * Mọi thời gian trong lớp này là GIÂY CỦA BẢN NHẠC ở tempo gốc; giây của AudioContext chỉ xuất hiện khi hẹn giờ nốt.
 * Tempo (20–200%) chỉ đổi tốc độ trôi của đồng hồ (`rate`) nên cao độ không đổi: mỗi nốt vẫn là mẫu âm gốc.
 * Kiểm thử được: truyền `now` giả và gọi `tick()` thay cho bộ hẹn giờ thật.
 */
import { DEFAULT_INSTRUMENT, getMaster, scheduleVoice } from '../editor/instruments';
import type { InstrumentId, Voice } from '../editor/instruments';
import type { PianoSampler } from './sampler';
import { clampTempoPercent, DEFAULT_TEMPO_PERCENT } from './settings';
import { firstEventAtOrAfter, measureOrderAt, timeOfOrder } from './timeline';
import type { Timeline, TimelineEvent } from './timeline';

export type EngineStatus = 'stopped' | 'playing' | 'paused';

export interface EngineOptions {
  ctx: BaseAudioContext;
  sampler?: PianoSampler | null;
  /** Đồng hồ (giây); mặc định `ctx.currentTime`. */
  now?: () => number;
  /** Có thì dùng thay cho bộ hẹn giờ thật (kiểm thử gọi `tick()` tay). */
  autoTick?: boolean;
  /** Tempo ban đầu (% so với tempo gốc), mặc định 100. */
  tempoPercent?: number;
}

/** Giọng đã hẹn kèm thời điểm bắt đầu (giây của context) để biết giọng nào chưa vang. */
interface ScheduledVoice {
  voice: Voice;
  start: number;
}

const TICK_MS = 25;
const LOOKAHEAD_S = 0.25;
/** Tab ẩn bị trình duyệt giãn bộ hẹn giờ (khoảng 1 giây), nên nhìn trước xa hơn để không rớt nốt. */
const HIDDEN_LOOKAHEAD_S = 2;
/** Chờ một chút sau khi bấm Play để nốt đầu không bị trễ. */
const START_DELAY_S = 0.05;
const MIN_NOTE_S = 0.08;

export class PlayerEngine {
  private readonly ctx: BaseAudioContext;
  private readonly sampler: PianoSampler | null;
  private readonly now: () => number;
  private readonly autoTick: boolean;
  private timeline: Timeline = {
    baseBpm: 100,
    timeSignature: '',
    measureCount: 0,
    total: 0,
    measures: [],
    events: [],
    tracks: [],
    maxDuration: 0,
  };
  private instrumentOf: (part: number) => InstrumentId = () => DEFAULT_INSTRUMENT;
  private status: EngineStatus = 'stopped';
  /** Vị trí (giây bản nhạc) khi dừng hoặc tạm dừng. */
  private idlePos = 0;
  /** Khi đang phát: vị trí bản nhạc tại thời điểm `anchorCtx` của AudioContext. */
  private anchorPos = 0;
  private anchorCtx = 0;
  private nextIndex = 0;
  /** Tốc độ phát so với tempo gốc (1 = 100%). */
  private rate = 1;
  private voices: ScheduledVoice[] = [];
  private trackNodes = new Map<string, GainNode>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private listeners = new Set<() => void>();
  private endedListeners = new Set<() => void>();

  constructor(options: EngineOptions) {
    this.ctx = options.ctx;
    this.sampler = options.sampler ?? null;
    this.now = options.now ?? (() => options.ctx.currentTime);
    this.autoTick = options.autoTick ?? true;
    this.rate = clampTempoPercent(options.tempoPercent ?? DEFAULT_TEMPO_PERCENT) / 100;
  }

  /** Nạp dòng thời gian mới (sau khi sửa bản nhạc); đang phát thì dừng và về đầu. */
  setTimeline(timeline: Timeline, instrumentOf: (part: number) => InstrumentId): void {
    this.stop();
    this.timeline = timeline;
    this.instrumentOf = instrumentOf;
    this.idlePos = 0;
    for (const node of this.trackNodes.values()) node.disconnect();
    this.trackNodes.clear();
    this.emit();
  }

  getStatus(): EngineStatus {
    return this.status;
  }

  getTimeline(): Timeline {
    return this.timeline;
  }

  /** Tempo hiện tại (% so với tempo gốc). */
  getTempoPercent(): number {
    return Math.round(this.rate * 100);
  }

  /**
   * Đổi tempo (kẹp 20–200%). Đang phát thì anchor lại đúng tại vị trí hiện tại nên vị trí không nhảy; chỉ hủy và hẹn
   * lại các nốt chưa vang, nốt đang ngân vẫn ngân hết.
   */
  setTempo(percent: number): void {
    const next = clampTempoPercent(percent) / 100;
    if (next === this.rate) return;
    if (this.status === 'playing') {
      const pos = this.position();
      this.killPending();
      this.rate = next;
      this.anchor(pos, 0);
    } else {
      this.rate = next;
    }
    this.emit();
  }

  /** Vị trí hiện tại (giây bản nhạc, ở tempo gốc). */
  position(): number {
    if (this.status !== 'playing') return this.idlePos;
    const pos = this.anchorPos + (this.now() - this.anchorCtx) * this.rate;
    return Math.min(this.timeline.total, Math.max(this.anchorPos, pos));
  }

  /** Thứ tự (trong lượt phát) của ô đang vang. */
  currentOrder(): number {
    return measureOrderAt(this.timeline, this.position());
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Gọi khi phát hết bài (không gọi khi người dùng bấm Dừng). */
  onEnded(listener: () => void): () => void {
    this.endedListeners.add(listener);
    return () => this.endedListeners.delete(listener);
  }

  private emit(): void {
    this.listeners.forEach((l) => l());
  }

  /** Bắt đầu hoặc phát tiếp. Trả false nếu bản nhạc không có nốt nào. */
  play(fromSeconds?: number): boolean {
    if (this.timeline.events.length === 0) return false;
    if (this.status === 'playing') return true;
    let pos = fromSeconds ?? this.idlePos;
    if (pos >= this.timeline.total - 0.01) pos = 0;
    pos = Math.max(0, pos);
    const resumable = this.ctx as { resume?: () => Promise<void>; state?: string };
    if (resumable.state === 'suspended') resumable.resume?.().catch(() => undefined);
    this.anchor(pos, START_DELAY_S);
    this.status = 'playing';
    if (this.autoTick) this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
    this.emit();
    return true;
  }

  private anchor(pos: number, delay: number): void {
    this.anchorPos = pos;
    this.anchorCtx = this.now() + delay;
    this.nextIndex = firstEventAtOrAfter(this.timeline, pos);
  }

  pause(): void {
    if (this.status !== 'playing') return;
    this.idlePos = this.position();
    this.halt();
    this.status = 'paused';
    this.emit();
  }

  stop(): void {
    if (this.status === 'stopped' && this.idlePos === 0) return;
    this.halt();
    this.idlePos = 0;
    this.status = 'stopped';
    this.emit();
  }

  /** Nhảy tới `seconds`; đang phát thì phát tiếp từ đó. */
  seek(seconds: number): void {
    const target = Math.min(this.timeline.total, Math.max(0, seconds));
    if (this.status === 'playing') {
      this.killVoices();
      this.anchor(target, 0.03);
    } else {
      this.idlePos = target;
    }
    this.emit();
  }

  /** Nhảy tới đầu ô thứ `order` trong lượt phát. */
  seekToOrder(order: number): void {
    this.seek(timeOfOrder(this.timeline, order));
  }

  /** Hẹn giờ các nốt sắp tới; gọi định kỳ bởi bộ hẹn giờ, hoặc gọi tay khi kiểm thử. */
  tick(): void {
    if (this.status !== 'playing') return;
    const pos = this.position();
    const lookahead = typeof document !== 'undefined' && document.hidden ? HIDDEN_LOOKAHEAD_S : LOOKAHEAD_S;
    const horizon = pos + lookahead * this.rate;
    const events = this.timeline.events;
    while (this.nextIndex < events.length && events[this.nextIndex].time < horizon) {
      this.schedule(events[this.nextIndex]);
      this.nextIndex += 1;
    }
    if (this.nextIndex >= events.length && pos >= this.timeline.total - 1e-3) this.finish();
    else this.voices = this.voices.filter((v) => v.voice.endsAt > this.now());
  }

  private trackNode(trackId: string): GainNode {
    let node = this.trackNodes.get(trackId);
    if (!node) {
      node = this.ctx.createGain();
      node.connect(getMaster(this.ctx));
      this.trackNodes.set(trackId, node);
    }
    return node;
  }

  private schedule(event: TimelineEvent): void {
    const now = this.now();
    const start = Math.max(this.anchorCtx + (event.time - this.anchorPos) / this.rate, now + 0.005);
    const duration = Math.max(MIN_NOTE_S, event.duration / this.rate);
    const instrument = this.instrumentOf(event.part);
    const destination = this.trackNode(event.trackId);
    const voice =
      (instrument === 'piano'
        ? this.sampler?.play(this.ctx, { midi: event.midi, start, duration, level: event.gain, destination })
        : null) ??
      scheduleVoice(this.ctx, { instrument, midi: event.midi, start, duration, level: event.gain, destination });
    this.voices.push({ voice, start });
  }

  /** Hết bài: các nốt cuối vẫn được ngân hết rồi mới im. */
  private finish(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.idlePos = 0;
    this.status = 'stopped';
    this.emit();
    this.endedListeners.forEach((l) => l());
  }

  private halt(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.killVoices();
  }

  private killVoices(): void {
    for (const { voice } of this.voices) voice.kill();
    this.voices = [];
  }

  /** Chỉ tắt các giọng chưa bắt đầu (đổi tempo): giọng đang vang được giữ lại. */
  private killPending(): void {
    const now = this.now();
    const keep: ScheduledVoice[] = [];
    for (const item of this.voices) {
      if (item.start > now) item.voice.kill();
      else keep.push(item);
    }
    this.voices = keep;
  }

  dispose(): void {
    this.halt();
    this.status = 'stopped';
    for (const node of this.trackNodes.values()) node.disconnect();
    this.trackNodes.clear();
    this.listeners.clear();
    this.endedListeners.clear();
  }
}
