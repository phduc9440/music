/**
 * Bộ tổng hợp âm nhiều nhạc cụ bằng WebAudio (không dùng thư viện, không tải mẫu âm thanh), cho nút Phát.
 *
 * Mỗi nhạc cụ là một "giọng" dựng từ vài bộ dao động + bộ lọc + đường bao biên độ riêng (piano tắt dần, đàn dây
 * vào chậm và rung nhẹ, hợp xướng có formant nguyên âm "a"...). Toàn bộ đi qua một chuỗi chung: nén động (để nhiều
 * part cùng chơi không vỡ tiếng) và vang phòng nhỏ (để các nốt nối vào nhau thay vì rời rạc).
 *
 * Mọi hàm nhận `BaseAudioContext` nên chạy được cả trên `OfflineAudioContext` (dùng để kiểm thử mà không cần loa).
 */
import { midiToFrequency } from './pitch';
import type { ScoreDocument } from './ScoreDocument';

export type InstrumentId = 'piano' | 'strings' | 'flute' | 'organ' | 'guitar' | 'choir' | 'brass' | 'bells';

export interface InstrumentInfo {
  id: InstrumentId;
  /** Tên tiếng Việt hiển thị. */
  label: string;
}

export const INSTRUMENTS: readonly InstrumentInfo[] = [
  { id: 'piano', label: 'Piano' },
  { id: 'strings', label: 'Đàn dây' },
  { id: 'flute', label: 'Sáo / kèn gỗ' },
  { id: 'organ', label: 'Đàn organ' },
  { id: 'guitar', label: 'Guitar / đàn gảy' },
  { id: 'choir', label: 'Giọng hát / hợp xướng' },
  { id: 'brass', label: 'Kèn đồng' },
  { id: 'bells', label: 'Chuông / glockenspiel' },
];

export const DEFAULT_INSTRUMENT: InstrumentId = 'piano';

/** Một nốt cần dựng giọng. */
export interface VoiceSpec {
  instrument: InstrumentId;
  /** Cao độ MIDI (có thể lẻ với vi cung). */
  midi: number;
  /** Thời điểm bắt đầu theo đồng hồ của context (giây). */
  start: number;
  /** Thời gian giữ nốt (giây) tính đến lúc nhả phím; đuôi vang thêm do nhạc cụ quyết định. */
  duration: number;
  /** Độ to 0–1; 0,8 là mức mặc định (mf). */
  level: number;
}

/** Giọng đã hẹn giờ, để cắt ngay khi bấm Dừng. */
export interface Voice {
  /** Thời điểm (giây, theo context) mà giọng này chắc chắn đã im. */
  endsAt: number;
  /** Tắt nhanh (khoảng 40 ms) để không bị tiếng "tách". */
  kill: () => void;
}

/** Tham số riêng từng nhạc cụ. */
interface Profile {
  /** Hệ số biên độ để các nhạc cụ có độ to cảm nhận gần bằng nhau. */
  trim: number;
  /** Hằng số thời gian nhả (giây) sau khi hết `duration`. */
  release: number;
}

const PROFILES: Record<InstrumentId, Profile> = {
  piano: { trim: 0.16, release: 0.2 },
  strings: { trim: 0.17, release: 0.16 },
  flute: { trim: 0.14, release: 0.09 },
  organ: { trim: 0.16, release: 0.05 },
  guitar: { trim: 0.2, release: 0.12 },
  choir: { trim: 0.2, release: 0.18 },
  brass: { trim: 0.12, release: 0.07 },
  bells: { trim: 0.14, release: 0.5 },
};

const SILENCE = 0.0001;

// ---------------------------------------------------------------------------------------------------------------
// Chuỗi xử lý chung

const masters = new WeakMap<BaseAudioContext, AudioNode>();
const waves = new WeakMap<BaseAudioContext, Map<string, PeriodicWave>>();
const noises = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Xung đáp phòng nhỏ: nhiễu tắt dần theo hàm mũ, khác nhau hai tai. Dùng bộ sinh số giả ngẫu nhiên cố định. */
const buildImpulse = (ctx: BaseAudioContext, seconds: number): AudioBuffer => {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  let seed = 12345;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296 - 0.5;
  };
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    let smooth = 0;
    for (let i = 0; i < length; i++) {
      smooth += (random() * 2 - smooth) * 0.5; // lọc thấp nhẹ cho tiếng vang bớt chói
      data[i] = smooth * (1 - i / length) ** 2.6;
    }
  }
  return buffer;
};

/**
 * Nút đầu vào của chuỗi chung của `ctx` (tạo một lần): nốt → [khô + vang] → nén động → loa.
 * Mọi giọng nối vào nút này.
 */
export function getMaster(ctx: BaseAudioContext): AudioNode {
  const existing = masters.get(ctx);
  if (existing) return existing;
  const input = ctx.createGain();
  const dry = ctx.createGain();
  dry.gain.value = 0.82;
  const wet = ctx.createGain();
  wet.gain.value = 0.2;
  const reverb = ctx.createConvolver();
  reverb.buffer = buildImpulse(ctx, 1.6);
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -20;
  compressor.knee.value = 18;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.008;
  compressor.release.value = 0.25;
  const out = ctx.createGain();
  out.gain.value = 0.95;
  input.connect(dry).connect(compressor);
  input.connect(reverb).connect(wet).connect(compressor);
  compressor.connect(out).connect(ctx.destination);
  masters.set(ctx, input);
  return input;
}

/** Bảng sóng từ biên độ các họa âm (amps[0] là họa âm bậc 1). */
const harmonicWave = (ctx: BaseAudioContext, key: string, amps: readonly number[]): PeriodicWave => {
  let cache = waves.get(ctx);
  if (!cache) {
    cache = new Map();
    waves.set(ctx, cache);
  }
  let wave = cache.get(key);
  if (!wave) {
    const real = new Float32Array(amps.length + 1);
    const imag = new Float32Array(amps.length + 1);
    amps.forEach((a, i) => (imag[i + 1] = a));
    wave = ctx.createPeriodicWave(real, imag);
    cache.set(key, wave);
  }
  return wave;
};

const series = (count: number, f: (n: number) => number): number[] => Array.from({ length: count }, (_, i) => f(i + 1));

const pianoAmps = series(14, (n) => (n === 1 ? 1 : 0.9 / n ** 1.15) * (n % 7 === 0 ? 0.3 : 1));
const guitarAmps = series(12, (n) => 1 / n ** 1.05);
const organAmps = [1, 0.75, 0.5, 0.42, 0, 0.3, 0, 0.24];
const fluteAmps = [1, 0.22, 0.07, 0.03];

/** Nhiễu trắng 1 giây (lặp) cho hơi thở của sáo. */
const noiseBuffer = (ctx: BaseAudioContext): AudioBuffer => {
  let buffer = noises.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 987654321;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = seed / 2147483648 - 1;
    }
    noises.set(ctx, buffer);
  }
  return buffer;
};

// ---------------------------------------------------------------------------------------------------------------
// Dựng giọng

type Source = AudioScheduledSourceNode;

/** Kết quả dựng của một nhạc cụ. */
interface Built {
  /** Mọi nguồn cần dừng khi hết nốt. */
  sources: Source[];
  /** Nút biên độ cuối, trước khi vào chuỗi chung. */
  env: GainNode;
  /** Biên độ của `env` tại thời điểm `t`, để nhả phím từ đúng mức hiện tại (không bị nhảy). */
  valueAt: (t: number) => number;
}

/** Bộ dao động với họa âm hoặc kiểu sóng có sẵn, tần số `f`, lệch `cents`. */
const oscillator = (
  ctx: BaseAudioContext,
  f: number,
  start: number,
  shape: Exclude<OscillatorType, 'custom'> | PeriodicWave,
  cents = 0,
): OscillatorNode => {
  const osc = ctx.createOscillator();
  if (typeof shape === 'string') osc.type = shape as OscillatorType;
  else osc.setPeriodicWave(shape);
  osc.frequency.value = f;
  osc.detune.value = cents;
  osc.start(start);
  return osc;
};

/** Rung (vibrato) vào dần sau `delay` giây: nối vào `detune` của các bộ dao động, độ sâu tính bằng cent. */
const vibrato = (
  ctx: BaseAudioContext,
  start: number,
  targets: OscillatorNode[],
  rate: number,
  depth: number,
  delay: number,
): OscillatorNode => {
  const lfo = ctx.createOscillator();
  lfo.frequency.value = rate;
  const amount = ctx.createGain();
  amount.gain.setValueAtTime(0, start + delay);
  amount.gain.linearRampToValueAtTime(depth, start + delay + 0.35);
  lfo.connect(amount);
  for (const t of targets) amount.connect(t.detune);
  lfo.start(start);
  return lfo;
};

const lowpass = (ctx: BaseAudioContext, frequency: number, q = 0.7): BiquadFilterNode => {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = Math.min(frequency, ctx.sampleRate / 2 - 200);
  filter.Q.value = q;
  return filter;
};

/** Đường bao "nhấn rồi tắt dần": lên `peak` trong `attack`, giảm theo hàm mũ với hằng số `decay`. */
const decayEnvelope = (env: GainNode, start: number, peak: number, attack: number, decay: number) => {
  env.gain.setValueAtTime(SILENCE, start);
  env.gain.linearRampToValueAtTime(peak, start + attack);
  env.gain.setTargetAtTime(SILENCE, start + attack, decay);
  return (t: number): number =>
    t <= start + attack ? peak : Math.max(SILENCE, peak * Math.exp(-(t - start - attack) / decay));
};

/** Đường bao "giữ nguyên": lên `peak` trong `attack` rồi giữ đến lúc nhả. */
const sustainEnvelope = (env: GainNode, start: number, peak: number, attack: number) => {
  env.gain.setValueAtTime(SILENCE, start);
  env.gain.linearRampToValueAtTime(peak, start + attack);
  return (t: number): number => (t >= start + attack ? peak : Math.max(SILENCE, (peak * (t - start)) / attack));
};

const buildPiano = (ctx: BaseAudioContext, s: VoiceSpec, f: number, peak: number): Built => {
  const env = ctx.createGain();
  const decay = Math.min(3.4, Math.max(0.45, 3.2 - (s.midi - 48) * 0.036)); // nốt cao tắt nhanh hơn nốt trầm
  const valueAt = decayEnvelope(env, s.start, peak, 0.004, decay);
  const filter = lowpass(ctx, Math.min(f * (4 + 9 * s.level), 11000));
  filter.frequency.setTargetAtTime(Math.min(f * 2.5, 6000), s.start + 0.01, 0.5);
  const wave = harmonicWave(ctx, 'piano', pianoAmps);
  const a = oscillator(ctx, f, s.start, wave, -2.5);
  const b = oscillator(ctx, f, s.start, wave, 2.5);
  a.connect(filter);
  b.connect(filter);
  filter.connect(env);
  return { sources: [a, b], env, valueAt };
};

const buildGuitar = (ctx: BaseAudioContext, s: VoiceSpec, f: number, peak: number): Built => {
  const env = ctx.createGain();
  const decay = Math.min(1.4, Math.max(0.3, 1.7 - (s.midi - 40) * 0.025));
  const valueAt = decayEnvelope(env, s.start, peak, 0.002, decay);
  const filter = lowpass(ctx, Math.min(f * 10, 9000), 1.2);
  filter.frequency.setTargetAtTime(Math.min(f * 2.2, 3500), s.start + 0.005, 0.18);
  const osc = oscillator(ctx, f, s.start, harmonicWave(ctx, 'guitar', guitarAmps));
  osc.connect(filter);
  filter.connect(env);
  return { sources: [osc], env, valueAt };
};

/** Chuông: họa âm không nguyên, mỗi thành phần tắt với tốc độ riêng (thành phần cao tắt nhanh hơn). Vang tự nhiên. */
const buildBells = (ctx: BaseAudioContext, s: VoiceSpec, f: number, peak: number): Built => {
  const env = ctx.createGain();
  env.gain.value = 1;
  const sources: Source[] = [];
  for (const { ratio, gain } of [
    { ratio: 1, gain: 1 },
    { ratio: 2.76, gain: 0.45 },
    { ratio: 5.4, gain: 0.22 },
    { ratio: 8.93, gain: 0.1 },
  ]) {
    if (f * ratio > ctx.sampleRate / 2 - 500) continue;
    const partial = ctx.createGain();
    decayEnvelope(partial, s.start, peak * gain, 0.002, 1.5 / Math.sqrt(ratio));
    const osc = oscillator(ctx, f * ratio, s.start, 'sine');
    osc.connect(partial);
    partial.connect(env);
    sources.push(osc);
  }
  return { sources, env, valueAt: () => 1 };
};

/** Các nhạc cụ ngân được (đàn dây, sáo, organ, kèn đồng, hợp xướng): giữ biên độ đến lúc nhả. */
const buildSustained = (ctx: BaseAudioContext, s: VoiceSpec, f: number, peak: number): Built => {
  const env = ctx.createGain();
  const sources: Source[] = [];
  const connect = (osc: OscillatorNode, to: AudioNode): OscillatorNode => {
    osc.connect(to);
    sources.push(osc);
    return osc;
  };
  let attack: number;
  switch (s.instrument) {
    case 'strings': {
      attack = 0.07 + 0.1 * (1 - Math.min(1, s.level));
      const filter = lowpass(ctx, Math.min(f * 6 + 1200, 6500));
      const oscs = [-7, 7].map((c) => connect(oscillator(ctx, f, s.start, 'sawtooth', c), filter));
      sources.push(vibrato(ctx, s.start, oscs, 5.3, 6, 0.25));
      filter.connect(env);
      break;
    }
    case 'organ': {
      attack = 0.012;
      connect(oscillator(ctx, f, s.start, harmonicWave(ctx, 'organ', organAmps)), env);
      break;
    }
    case 'flute': {
      attack = 0.06;
      const osc = connect(oscillator(ctx, f, s.start, harmonicWave(ctx, 'flute', fluteAmps)), env);
      sources.push(vibrato(ctx, s.start, [osc], 5, 5, 0.3));
      // hơi thở: nhiễu qua bộ lọc dải quanh 2 lần tần số cơ bản, rất nhỏ
      const breath = ctx.createBufferSource();
      breath.buffer = noiseBuffer(ctx);
      breath.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = Math.min(f * 2, ctx.sampleRate / 2 - 500);
      band.Q.value = 1.5;
      const air = ctx.createGain();
      air.gain.value = 0.09;
      breath.connect(band);
      band.connect(air);
      air.connect(env);
      breath.start(s.start);
      sources.push(breath);
      break;
    }
    case 'brass': {
      attack = 0.045;
      const filter = lowpass(ctx, f * 2, 1.4);
      filter.frequency.setValueAtTime(Math.min(f * 2, ctx.sampleRate / 2 - 200), s.start);
      filter.frequency.linearRampToValueAtTime(Math.min(f * 2 + f * 5 * (0.4 + s.level), 7000), s.start + 0.12);
      connect(oscillator(ctx, f, s.start, 'sawtooth', -4), filter);
      connect(oscillator(ctx, f, s.start, 'sawtooth', 4), filter);
      filter.connect(env);
      break;
    }
    default: {
      // choir: sóng cưa qua ba formant của nguyên âm "a"; formant 1 nhích lên theo cao độ (giọng cao mở miệng hơn)
      attack = 0.1;
      const mix = ctx.createGain();
      const oscs = [-8, 8].map((c) => connect(oscillator(ctx, f, s.start, 'sawtooth', c), mix));
      const formants = [
        { freq: Math.min(1100, Math.max(700, f * 1.05)), gain: 1 },
        { freq: 1150, gain: 0.55 },
        { freq: 2900, gain: 0.3 },
      ];
      for (const fm of formants) {
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = fm.freq;
        band.Q.value = 7;
        const g = ctx.createGain();
        g.gain.value = fm.gain * 1.6;
        mix.connect(band);
        band.connect(g);
        g.connect(env);
      }
      sources.push(vibrato(ctx, s.start, oscs, 5.6, 8, 0.2));
      break;
    }
  }
  const valueAt = sustainEnvelope(env, s.start, peak, attack);
  return { sources, env, valueAt };
};

/**
 * Hẹn giờ một nốt trên `ctx`, nối vào chuỗi chung. Nốt vào ở `start`, giữ đến `start + duration` rồi nhả theo kiểu
 * của nhạc cụ. Trả về giọng để cắt ngay khi cần.
 */
export function scheduleVoice(ctx: BaseAudioContext, spec: VoiceSpec): Voice {
  const profile = PROFILES[spec.instrument];
  const f = midiToFrequency(spec.midi);
  const loud = Math.min(1.25, Math.max(0.4, spec.level / 0.8));
  const peak = profile.trim * (0.35 + 0.65 * Math.min(1, spec.level / 0.8)) * loud;

  const built =
    spec.instrument === 'piano'
      ? buildPiano(ctx, spec, f, peak)
      : spec.instrument === 'guitar'
        ? buildGuitar(ctx, spec, f, peak)
        : spec.instrument === 'bells'
          ? buildBells(ctx, spec, f, peak)
          : buildSustained(ctx, spec, f, peak);
  const { env, sources, valueAt } = built;
  env.connect(getMaster(ctx));

  // Nhả phím từ đúng mức biên độ tại thời điểm đó rồi tắt dần (chuông thì để vang tự nhiên)
  const releaseAt = spec.start + Math.max(0.03, spec.duration);
  const bells = spec.instrument === 'bells';
  if (!bells) {
    env.gain.cancelScheduledValues(releaseAt);
    env.gain.setValueAtTime(valueAt(releaseAt), releaseAt);
    env.gain.setTargetAtTime(SILENCE, releaseAt, profile.release);
  }
  const endsAt = releaseAt + (bells ? 3.5 : profile.release * 7 + 0.05);
  for (const source of sources) source.stop(endsAt);

  return {
    endsAt,
    kill: () => {
      try {
        const now = ctx.currentTime;
        env.gain.cancelScheduledValues(now);
        env.gain.setValueAtTime(Math.max(SILENCE, env.gain.value), now);
        env.gain.linearRampToValueAtTime(0, now + 0.04);
        for (const source of sources) source.stop(now + 0.05);
      } catch {
        // nguồn đã dừng
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Nhận diện nhạc cụ từ MusicXML

/** Tên nhạc cụ → InstrumentId (dùng khi file không có chương trình MIDI); quy tắc đứng trước ưu tiên hơn. */
const NAME_RULES: [RegExp, InstrumentId][] = [
  [/organ/i, 'organ'],
  [/sopran|mezzo|alto|tenor|bariton|\bbass?\b|voice|vocal|choir|chorus|singer|giọng|hát|hợp xướng/i, 'choir'],
  [/violin|viola|cello|contrabass|double bass|string|vĩ cầm|đàn dây/i, 'strings'],
  [/flute|piccolo|clarinet|oboe|bassoon|sax|recorder|whistle|sáo|kèn/i, 'flute'],
  [/trumpet|horn|trombone|tuba|cornet|brass/i, 'brass'],
  [/guitar|harp|lute|mandolin|banjo|ukulele|đàn tranh|ghi-?ta/i, 'guitar'],
  [/bell|glock|celesta|marimba|xylophone|vibraphone|chime|chuông/i, 'bells'],
  [/piano|keyboard|harpsichord|đàn phím/i, 'piano'],
];

/** Chương trình MIDI (1–128, như `<midi-program>`) → nhạc cụ gần nhất. */
export const instrumentForProgram = (program: number): InstrumentId => {
  if (program <= 8) return 'piano';
  if (program <= 16) return 'bells';
  if (program <= 24) return 'organ';
  if (program <= 40) return 'guitar';
  if (program <= 52) return 'strings';
  if (program <= 56) return 'choir';
  if (program <= 64) return 'brass';
  if (program <= 80) return 'flute';
  return 'piano';
};

const scoreParts = (doc: ScoreDocument): Element[] => Array.from(doc.root.getElementsByTagName('score-part'));

const textOf = (el: Element | undefined, tag: string): string =>
  el?.getElementsByTagName(tag)[0]?.textContent?.trim() ?? '';

/** Tên hiển thị của part `partIndex`: `<part-name>` hoặc "Khuông N". */
export const partLabel = (doc: ScoreDocument, partIndex: number): string =>
  textOf(scoreParts(doc)[partIndex], 'part-name') || `Khuông ${partIndex + 1}`;

/**
 * Nhạc cụ mặc định của một part: theo `<midi-program>` nếu file có, không thì theo tên (part-name / instrument-name),
 * không đoán được thì piano.
 */
export function detectInstrument(doc: ScoreDocument, partIndex: number): InstrumentId {
  const part = scoreParts(doc)[partIndex];
  const program = Number(textOf(part, 'midi-program'));
  if (Number.isInteger(program) && program >= 1 && program <= 128) return instrumentForProgram(program);
  const name = `${textOf(part, 'part-name')} ${textOf(part, 'instrument-name')}`;
  for (const [pattern, id] of NAME_RULES) if (pattern.test(name)) return id;
  return DEFAULT_INSTRUMENT;
}
