/**
 * Bộ phát (sequencer) của Player trên Web Audio API: đồng hồ, hẹn giờ nốt theo cửa sổ nhìn trước, Play / Pause / Stop /
 * Seek. Cùng nguyên lý với Tone.Transport nhưng dùng thẳng dòng thời gian của Editor (lặp lại, fermata, tempo đổi giữa
 * ô) nên chỉ có một đồng hồ.
 *
 * Mọi thời gian trong lớp này là GIÂY CỦA BẢN NHẠC ở tempo gốc; giây của AudioContext chỉ xuất hiện khi hẹn giờ nốt.
 * Tempo (20–200%) chỉ đổi tốc độ trôi của đồng hồ (`rate`) nên cao độ không đổi: mỗi nốt vẫn là mẫu âm gốc.
 * Kiểm thử được: truyền `now` giả và gọi `tick()` thay cho bộ hẹn giờ thật.
 */
import { accompanimentInstrument, DEFAULT_INSTRUMENT, getMaster, scheduleVoice } from '../../editor/audio/instruments';
import type { InstrumentId, Voice } from '../../editor/audio/instruments';
import type { PianoSampler } from './sampler';
import { loopSegments, NO_LOOP, normalizeLoop, pickSegment, sameLoop } from '../state/loop';
import { scheduleClick } from './metronome';
import type { LoopSegment, LoopSettings } from '../state/loop';
import { EMPTY_MIXER, pruneMixer, trackGain, withTrackMix } from '../state/mixer';
import type { MixerState, TrackMix } from '../state/mixer';
import { clampTempoPercent, DEFAULT_TEMPO_PERCENT } from '../state/settings';
import { clampTranspose, inPianoRange } from '../state/transposeRange';
import { CHORD_TRACK_ID, firstEventAtOrAfter, measureOrderAt, timeOfOrder } from './timeline';
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
  /** Chuyển giọng ban đầu (nửa cung, −12…+12). */
  transpose?: number;
  /** Ô không ghi hợp âm có đánh lại hợp âm đang hiệu lực không (mặc định có). */
  chordCarry?: boolean;
}

/**
 * Điểm neo của đồng hồ: từ thời điểm `ctx` (giây của AudioContext) bản nhạc ở vị trí `pos` (giây bản nhạc) và trôi với
 * tốc độ `rate`. `hold` = đứng yên ở `pos` (đang đếm nhịp vào). Tốc độ gắn theo điểm neo để đổi tốc độ ở vòng sau
 * (tăng tốc dần) không làm sai vị trí hiển thị của vòng đang phát.
 */
interface Anchor {
  ctx: number;
  pos: number;
  rate: number;
  hold?: boolean;
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
/** Tăng tốc dần: mỗi vòng tăng thêm bấy nhiêu % cho tới 100%. */
const SPEED_STEP_PERCENT = 5;

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
  private anchors: Anchor[] = [{ ctx: 0, pos: 0, rate: 1 }];
  private nextIndex = 0;
  private loop: LoopSettings = NO_LOOP;
  /** Các đoạn A-B trong lượt phát (kể cả khi chưa bật lặp, để hiển thị). */
  private segments: LoopSegment[] = [];
  /** Đoạn đang áp dụng cho lần phát hiện tại; null nếu không lặp. */
  private segment: LoopSegment | null = null;
  /** Tốc độ phát so với tempo gốc (1 = 100%). */
  private rate = 1;
  /** Tempo do người dùng chọn; `rate` có thể cao hơn khi tăng tốc dần đang chạy, và về lại đây khi dừng hoặc tắt. */
  private baseRate = 1;
  /** Số nửa cung cộng vào cao độ mỗi nốt khi hẹn giờ (nghe ở giọng khác, bản nhạc không đổi). */
  private transpose = 0;
  /** Đánh lại hợp âm đang hiệu lực ở ô không ghi ký hiệu hợp âm; tắt thì các ô đó im phần đệm. */
  private chordCarry = true;
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
    this.baseRate = this.rate;
    this.mixer = options.mixer ?? EMPTY_MIXER;
    this.loop = options.loop ?? NO_LOOP;
    this.transpose = clampTranspose(options.transpose ?? 0);
    this.chordCarry = options.chordCarry ?? true;
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

  /** Ô không ghi hợp âm có đánh lại hợp âm đang hiệu lực không. */
  getChordCarry(): boolean {
    return this.chordCarry;
  }

  /**
   * Bật/tắt việc đánh lại hợp âm ở ô không ghi ký hiệu hợp âm. Áp dụng ngay khi đang phát như đổi tempo: nốt chưa vang
   * được hẹn lại theo lựa chọn mới, nốt đang ngân vẫn ngân hết.
   */
  setChordCarry(on: boolean): void {
    if (on === this.chordCarry) return;
    this.chordCarry = on;
    if (this.status === 'playing') {
      const pos = this.position();
      this.killPending();
      this.anchor(pos, 0);
    }
    this.emit();
  }

  /** Số nửa cung đang chuyển giọng khi nghe. */
  getTranspose(): number {
    return this.transpose;
  }

  /**
   * Chuyển giọng khi nghe (−12…+12 nửa cung). Đang phát thì áp dụng ngay từ vị trí hiện tại như khi đổi tempo: nốt chưa
   * vang được hẹn lại ở cao độ mới, nốt đang ngân vẫn ngân hết. Nốt ra ngoài âm vực piano (A0–C8) bị bỏ khi phát.
   */
  setTranspose(semitones: number): void {
    const next = clampTranspose(semitones);
    if (next === this.transpose) return;
    this.transpose = next;
    if (this.status === 'playing') {
      const pos = this.position();
      this.killPending();
      this.anchor(pos, 0);
    }
    this.emit();
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
    if (!(next.enabled && next.speedUp)) this.rate = this.baseRate; // tắt lặp / tăng tốc: về tempo đã chọn
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
    if (next === this.rate && next === this.baseRate) return;
    this.baseRate = next;
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
    if (anchor.hold) return Math.min(this.timeline.total, anchor.pos);
    const pos = anchor.pos + (now - anchor.ctx) * anchor.rate;
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
    this.anchor(pos, START_DELAY_S, true);
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

  /**
   * Đặt lại đồng hồ: bản nhạc ở vị trí `pos` sau `delay` giây, và chọn đoạn A-B áp dụng cho vị trí đó. `countIn` = được
   * phép đếm nhịp vào (chỉ khi đang lặp và `pos` đúng đầu đoạn A; kéo thanh thời gian giữa chừng thì không đếm).
   */
  private anchor(pos: number, delay: number, countIn = false): void {
    this.nextIndex = firstEventAtOrAfter(this.timeline, pos);
    this.segment = this.loop.enabled ? pickSegment(this.segments, measureOrderAt(this.timeline, pos)) : null;
    const atStart = this.segment !== null && Math.abs(pos - this.segment.start) < 1e-6;
    this.anchors = this.passAnchors(this.now() + delay, pos, countIn && this.loop.countIn && atStart);
  }

  /**
   * Điểm neo cho một lượt phát bắt đầu lúc `ctxStart` ở vị trí `pos`. Có đếm nhịp vào thì thêm một điểm neo đứng yên suốt
   * một ô (hẹn các tiếng gõ) rồi mới trôi: vị trí hiển thị đứng ở đầu đoạn trong lúc đếm.
   */
  private passAnchors(ctxStart: number, pos: number, countIn: boolean): Anchor[] {
    const rate = this.rate;
    if (!countIn) return [{ ctx: ctxStart, pos, rate }];
    const { count, beatSeconds } = this.countInBeats();
    const beat = beatSeconds / rate;
    for (let i = 0; i < count; i++) {
      const start = ctxStart + i * beat;
      this.voices.push({ voice: scheduleClick(this.ctx, start, i === 0), start });
    }
    return [
      { ctx: ctxStart, pos, rate, hold: true },
      { ctx: ctxStart + count * beat, pos, rate },
    ];
  }

  /** Số tiếng gõ của một ô và độ dài một phách (giây ở tempo gốc), theo nhịp của bản nhạc ("3/4", "6/8"; tự do thì 4/4). */
  private countInBeats(): { count: number; beatSeconds: number } {
    const match = /^(\d+)\/(\d+)$/.exec(this.timeline.timeSignature);
    const count = match ? Math.min(12, Math.max(1, Number(match[1]))) : 4;
    const unit = match && Number(match[2]) > 0 ? Number(match[2]) : 4;
    return { count, beatSeconds: (60 / this.timeline.baseBpm) * (4 / unit) };
  }

  /** Tăng tốc dần: sang vòng mới thì tăng thêm 5% cho tới 100% (không giảm nếu người dùng đã chọn trên 100%). */
  private advanceSpeed(): void {
    if (!this.loop.speedUp) return;
    const percent = Math.round(this.rate * 100);
    if (percent >= 100) return;
    this.rate = Math.min(100, percent + SPEED_STEP_PERCENT) / 100;
    this.emit();
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
    this.rate = this.baseRate;
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
      const horizon = anchor.hold ? -Infinity : anchor.pos + (horizonCtx - anchor.ctx) * anchor.rate;
      const segment = this.segment;
      const limit = segment ? segment.end : Infinity;
      const until = Math.min(horizon, limit);
      while (this.nextIndex < events.length && events[this.nextIndex].time < until) {
        this.schedule(events[this.nextIndex], anchor, limit);
        this.nextIndex += 1;
      }
      if (!segment || horizon < limit || wraps >= MAX_WRAPS_PER_TICK) return;
      const wrapCtx = anchor.ctx + (limit - anchor.pos) / anchor.rate;
      this.advanceSpeed();
      this.anchors.push(...this.passAnchors(wrapCtx, segment.start, this.loop.countIn));
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
    if (event.silent) return; // nốt gốc của láy: các nốt láy (cùng id) phát thay
    if (event.carried && !this.chordCarry) return;
    if (!inPianoRange(event.midi, this.transpose)) return;
    const midi = event.midi + this.transpose;
    const now = this.now();
    const start = Math.max(anchor.ctx + (event.time - anchor.pos) / anchor.rate, now + 0.005);
    // `ring`: pedal giữ nốt vang lâu hơn độ dài ghi trên bản nhạc
    const sounding = Math.max(event.duration, event.ring ?? 0);
    const duration = Math.max(MIN_NOTE_S, Math.min(sounding, limit - event.time) / anchor.rate);
    // Đệm hợp âm: organ / guitar tự đệm bằng tiếng của mình, các nhạc cụ khác (ví dụ giọng hát, sáo) đệm bằng piano
    const melody = this.instrumentOf(event.part);
    const instrument = event.trackId === CHORD_TRACK_ID ? accompanimentInstrument(melody) : melody;
    const destination = this.trackNode(event.trackId);
    const voice =
      (instrument === 'piano'
        ? this.sampler?.play(this.ctx, { midi, start, duration, level: event.gain, destination })
        : null) ?? scheduleVoice(this.ctx, { instrument, midi, start, duration, level: event.gain, destination });
    this.voices.push({ voice, start });
  }

  /** Hết bài: các nốt cuối vẫn được ngân hết rồi mới im. */
  private finish(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.rate = this.baseRate;
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
