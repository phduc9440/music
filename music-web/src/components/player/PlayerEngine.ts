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
import { loopSegments, NO_LOOP, normalizeLoop, pickSegment, sameLoop } from './loop';
import type { LoopSegment, LoopSettings } from './loop';
import { EMPTY_MIXER, pruneMixer, trackGain, withTrackMix } from './mixer';
import type { MixerState, TrackMix } from './mixer';
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
  /** Mute / Solo / âm lượng ban đầu theo track. */
  mixer?: MixerState;
  /** Đoạn lặp A-B ban đầu. */
  loop?: LoopSettings;
}

/** Điểm neo của đồng hồ: từ thời điểm `ctx` (giây của AudioContext) bản nhạc ở vị trí `pos` (giây bản nhạc). */
interface Anchor {
  ctx: number;
  pos: number;
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
/** Hằng số thời gian (giây) khi đổi độ lợi của track: đủ nhanh để Mute / Solo nghe ngay, đủ chậm để không "tách". */
const MIX_TAU_S = 0.015;
/** Số lần quay vòng tối đa trong một lần hẹn giờ (chặn vòng lặp vô hạn nếu đoạn lặp quá ngắn). */
const MAX_WRAPS_PER_TICK = 16;

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
  /**
   * Khi đang phát: các điểm neo của đồng hồ theo thứ tự thời gian. Điểm cuối dùng để hẹn giờ nốt tiếp theo; vị trí hiển
   * thị dùng điểm đang có hiệu lực (`ctx` ≤ bây giờ), nên khi quay vòng A-B vị trí chỉ nhảy đúng lúc nghe thấy quay lại.
   */
  private anchors: Anchor[] = [{ ctx: 0, pos: 0 }];
  private nextIndex = 0;
  private loop: LoopSettings = NO_LOOP;
  /** Các đoạn A-B trong lượt phát (kể cả khi chưa bật lặp, để hiển thị). */
  private segments: LoopSegment[] = [];
  /** Đoạn đang áp dụng cho lần phát hiện tại; null nếu không lặp. */
  private segment: LoopSegment | null = null;
  /** Tốc độ phát so với tempo gốc (1 = 100%). */
  private rate = 1;
  private voices: ScheduledVoice[] = [];
  private mixer: MixerState = EMPTY_MIXER;
  private trackIds: string[] = [];
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
    this.mixer = options.mixer ?? EMPTY_MIXER;
    this.loop = options.loop ?? NO_LOOP;
  }

  /** Nạp dòng thời gian mới (sau khi sửa bản nhạc); đang phát thì dừng và về đầu. */
  setTimeline(timeline: Timeline, instrumentOf: (part: number) => InstrumentId): void {
    this.stop();
    this.timeline = timeline;
    this.trackIds = timeline.tracks.map((t) => t.id);
    this.mixer = pruneMixer(this.mixer, this.trackIds);
    this.instrumentOf = instrumentOf;
    this.loop = normalizeLoop(this.loop, timeline.measureCount);
    this.segments = loopSegments(timeline, this.loop.a, this.loop.b);
    this.segment = null;
    this.idlePos = this.restPos();
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

  /** Cài đặt lặp A-B hiện tại (đổi tham chiếu mỗi khi có thay đổi). */
  getLoop(): LoopSettings {
    return this.loop;
  }

  /**
   * Đổi đoạn lặp A-B (kẹp vào số ô của bản nhạc, B < A thì tự đổi chỗ). Đang phát thì áp dụng ngay từ vị trí hiện tại:
   * nốt chưa vang được hẹn lại, nốt đang ngân vẫn ngân hết.
   */
  setLoop(patch: Partial<LoopSettings>): void {
    const next = normalizeLoop({ ...this.loop, ...patch }, this.timeline.measureCount);
    if (sameLoop(next, this.loop)) return;
    this.loop = next;
    this.segments = loopSegments(this.timeline, next.a, next.b);
    if (this.status === 'playing') {
      const pos = this.position();
      this.killPending();
      this.anchor(pos, 0);
    } else if (this.status === 'stopped') {
      this.idlePos = this.restPos();
    }
    this.emit();
  }

  /** Vị trí khi dừng hẳn: đầu đoạn A nếu đang lặp, không thì đầu bài. */
  private restPos(): number {
    return this.loop.enabled ? (this.segments[0]?.start ?? 0) : 0;
  }

  /** Bảng Mute / Solo / âm lượng hiện tại (đổi tham chiếu mỗi khi có thay đổi). */
  getMixer(): MixerState {
    return this.mixer;
  }

  /** Đổi Mute / Solo / âm lượng của một track; có hiệu lực ngay cả với nốt đã hẹn giờ. */
  setTrackMix(trackId: string, patch: Partial<TrackMix>): void {
    if (!this.trackIds.includes(trackId)) return;
    this.mixer = withTrackMix(this.mixer, trackId, patch);
    this.applyMixer();
    this.emit();
  }

  /** Đưa mọi track về mặc định (không tắt tiếng, âm lượng 100%). */
  resetMixer(): void {
    if (Object.keys(this.mixer).length === 0) return;
    this.mixer = EMPTY_MIXER;
    this.applyMixer();
    this.emit();
  }

  private applyMixer(): void {
    const at = this.ctx.currentTime;
    for (const [trackId, node] of this.trackNodes) {
      node.gain.setTargetAtTime(trackGain(this.mixer, this.trackIds, trackId), at, MIX_TAU_S);
    }
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
    const now = this.now();
    const anchor = this.effectiveAnchor(now);
    const pos = anchor.pos + (now - anchor.ctx) * this.rate;
    return Math.min(this.timeline.total, Math.max(anchor.pos, pos));
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

  /** Điểm neo đang có hiệu lực tại thời điểm `now`: điểm cuối cùng đã tới giờ (chưa tới thì điểm đầu). */
  private effectiveAnchor(now: number): Anchor {
    let current = this.anchors[0];
    for (const anchor of this.anchors) {
      if (anchor.ctx <= now) current = anchor;
      else break;
    }
    return current;
  }

  /** Đặt lại đồng hồ: bản nhạc ở vị trí `pos` sau `delay` giây, và chọn đoạn A-B áp dụng cho vị trí đó. */
  private anchor(pos: number, delay: number): void {
    this.anchors = [{ ctx: this.now() + delay, pos }];
    this.nextIndex = firstEventAtOrAfter(this.timeline, pos);
    this.segment = this.loop.enabled ? pickSegment(this.segments, measureOrderAt(this.timeline, pos)) : null;
  }

  pause(): void {
    if (this.status !== 'playing') return;
    this.idlePos = this.position();
    this.halt();
    this.status = 'paused';
    this.emit();
  }

  stop(): void {
    const rest = this.restPos();
    if (this.status === 'stopped' && this.idlePos === rest) return;
    this.halt();
    this.idlePos = rest;
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
    const now = this.now();
    const lookahead = typeof document !== 'undefined' && document.hidden ? HIDDEN_LOOKAHEAD_S : LOOKAHEAD_S;
    this.scheduleUntil(now + lookahead);
    const pos = this.position();
    // Bỏ các điểm neo đã qua (giữ điểm đang có hiệu lực)
    const effective = this.anchors.indexOf(this.effectiveAnchor(now));
    if (effective > 0) this.anchors = this.anchors.slice(effective);
    if (!this.segment && this.nextIndex >= this.timeline.events.length && pos >= this.timeline.total - 1e-3)
      this.finish();
    else this.voices = this.voices.filter((v) => v.voice.endsAt > now);
  }

  /**
   * Hẹn giờ mọi nốt rơi vào khoảng tới thời điểm `horizonCtx` (giây của AudioContext). Khi chạm cuối đoạn A-B thì thêm
   * điểm neo quay về A đúng vào lúc nghe thấy cuối B rồi hẹn tiếp từ A, nên các vòng nối nhau không hở và không trễ dồn.
   */
  private scheduleUntil(horizonCtx: number): void {
    const events = this.timeline.events;
    for (let wraps = 0; ; wraps++) {
      const anchor = this.anchors[this.anchors.length - 1];
      const horizon = anchor.pos + (horizonCtx - anchor.ctx) * this.rate;
      const segment = this.segment;
      const limit = segment ? segment.end : Infinity;
      const until = Math.min(horizon, limit);
      while (this.nextIndex < events.length && events[this.nextIndex].time < until) {
        this.schedule(events[this.nextIndex], anchor, limit);
        this.nextIndex += 1;
      }
      if (!segment || horizon < limit || wraps >= MAX_WRAPS_PER_TICK) return;
      this.anchors.push({ ctx: anchor.ctx + (limit - anchor.pos) / this.rate, pos: segment.start });
      this.nextIndex = firstEventAtOrAfter(this.timeline, segment.start);
    }
  }

  private trackNode(trackId: string): GainNode {
    let node = this.trackNodes.get(trackId);
    if (!node) {
      node = this.ctx.createGain();
      node.gain.value = trackGain(this.mixer, this.trackIds, trackId);
      node.connect(getMaster(this.ctx));
      this.trackNodes.set(trackId, node);
    }
    return node;
  }

  /** Hẹn giờ một nốt theo điểm neo `anchor`; nốt vắt qua `limit` (cuối đoạn A-B) bị cắt tại đó. */
  private schedule(event: TimelineEvent, anchor: Anchor, limit: number): void {
    const now = this.now();
    const start = Math.max(anchor.ctx + (event.time - anchor.pos) / this.rate, now + 0.005);
    const duration = Math.max(MIN_NOTE_S, Math.min(event.duration, limit - event.time) / this.rate);
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
    this.idlePos = this.restPos();
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
