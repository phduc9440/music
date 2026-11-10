/**
 * Dựng lịch phát từ MusicXML để nghe thử bản nhạc (nút Phát) và để xem trước vùng chọn. Chỉ tính thời gian, cao độ và
 * âm lượng từ DOM, không dùng thư viện âm thanh.
 *
 * Cách tính:
 * - Một đồng hồ CHUNG cho mọi part, dựng theo từng ô nhịp (theo thứ tự phát): mỗi ô có bảng tempo từng đoạn (tempo đổi
 *   giữa ô) và bảng độ trễ fermata. Nốt nào kéo dài qua fermata thì dài ra, mọi part sau fermata đều chờ như nhau.
 * - Âm lượng (gain) theo mức to nhỏ gần nhất trước nốt của part đó, nội suy dọc theo cresc./dim.
 * - Độ dài nốt theo dấu thể hiện (staccato, tenuto, marcato, lấy hơi...); nốt hoa mỹ lấy thời gian của nốt chính theo sau.
 * - Láy rền / láy ngắn / láy vòng được khai triển thành các nốt ngắn (nốt gốc im, `silent`; các nốt khai triển `ornament`);
 *   rải hợp âm lệch nhẹ thời điểm vào của từng nốt từ dưới lên; pedal giữ nốt ngân cho tới khi nhả; dấu ngắt nghỉ (caesura)
 *   chèn một quãng lặng chung cho mọi part (như fermata nhưng sau nốt).
 */
import { DEFAULT_GAIN, DEFAULT_VELOCITY, velocityGain } from './loudness';
import { chordNotes } from '../notation/chordNotes';
import type { ChordNotes } from '../notation/chordNotes';
import { keyAlter, pitchToMidi, STEPS } from '../notes/pitch';
import type { Step } from '../notes/pitch';
import { playOrder } from './playOrder';
import type { NoteInfo, ScoreDocument } from '../core/ScoreDocument';

/** Một nốt cần phát. */
export interface PlayNote {
  id: string;
  /** Chỉ số part của nốt (để chọn nhạc cụ theo part). */
  part: number;
  /** Giây kể từ đầu bản nhạc. */
  time: number;
  duration: number;
  /** Cao độ NGHE THẤY (đã tính chuyển âm của nhạc cụ). */
  midi: number;
  /** Âm lượng 0–1; 0,8 là mức mặc định (tương đương mf) khi bản nhạc chưa ghi mức to nhỏ. */
  gain: number;
  /** Chỉ số (từ 0) của ô nhịp trong bản nhạc. */
  measure: number;
  /** Thứ tự của ô trong lượt phát (ô lặp lại xuất hiện nhiều lần nên khác `measure`). */
  order: number;
  /** Khuông trong part (từ 1). */
  staff: number;
  /** Vị trí bắt đầu và kết thúc tính theo phách đen kể từ đầu lượt phát (không phụ thuộc tempo). */
  beat: number;
  beatEnd: number;
  /**
   * Chỉ có ở nốt đệm hợp âm: true nếu nốt này đánh lại hợp âm ĐANG HIỆU LỰC ở đầu một ô không ghi ký hiệu hợp âm nào (không
   * phải do chính một ký hiệu sinh ra). Người dùng chọn có đánh các nốt này hay không.
   */
  carried?: boolean;
  /**
   * Nốt này đã được khai triển thành các nốt láy (`ornament`) nên bản thân nó KHÔNG phát tiếng; vẫn giữ trong danh sách để
   * tô nốt và để chấm điểm (nốt trên bản nhạc chỉ có một).
   */
  silent?: boolean;
  /**
   * Chỉ có khi pedal giữ nốt vang lâu hơn `duration`: tổng thời gian nốt còn vang (giây). `duration` vẫn là độ dài theo dấu
   * thể hiện để tô nốt trên bản nhạc không kéo dài theo pedal.
   */
  ring?: number;
  /** Nốt phụ của láy rền / láy ngắn / láy vòng: cùng `id` với nốt gốc để tô nốt; không đưa vào dữ liệu chấm điểm. */
  ornament?: boolean;
}

/** Một ô nhịp trong lượt phát. */
export interface PlayMeasure {
  /** Chỉ số (từ 0) của ô trong bản nhạc. */
  index: number;
  /** Thứ tự trong lượt phát. */
  order: number;
  /** Giây bắt đầu / kết thúc trên đồng hồ chung (đã tính fermata). */
  start: number;
  end: number;
  startBeat: number;
  lengthBeats: number;
}

export interface PlaybackPlan {
  notes: PlayNote[];
  /**
   * Nốt đệm của các ký hiệu hợp âm (<harmony>) theo thứ tự phát: bass và các nốt hợp âm đánh cùng lúc, giữ tới hợp âm kế
   * hoặc hết ô (hợp âm chưa đổi thì đánh lại ở đầu ô kế). Tách khỏi `notes` vì không phải nốt trên bản nhạc.
   */
  chords: PlayNote[];
  /** Các ô nhịp theo thứ tự phát. */
  measures: PlayMeasure[];
  /** Tổng thời lượng (giây). */
  total: number;
}

/** Âm lượng mặc định (mf) và vận tốc MIDI tương ứng: xem loudness.ts, nơi cũng định nghĩa mức to nhỏ → dB. */
export { DEFAULT_GAIN, DEFAULT_VELOCITY, velocityGain };
/**
 * Âm lượng nốt đệm hợp âm (nhỏ hơn giai điệu mf chừng 6 dB để không át), nốt bass to hơn một chút, và phần ngân (≤ 1) trước
 * khi nhả.
 */
export const CHORD_GAIN = 0.68;
export const CHORD_BASS_GAIN = 0.72;
const CHORD_HOLD = 0.92;
/** Nốt ngân bình thường chỉ vang 90% độ dài để hai nốt liền nhau không dính. */
const LEGATO_FACTOR = 0.9;
const ARTICULATION_FACTOR = { staccatissimo: 0.25, staccato: 0.5, tenuto: 1 } as const;
/** Marcato (^): nhấn mạnh và ngắt, ngắn hơn nốt thường nhưng dài hơn staccato. */
const MARCATO_FACTOR = 0.7;
/** Dấu lấy hơi: cắt bớt cuối nốt một phần tư độ dài, tối thiểu 0,06 giây, tối đa 0,3 giây. */
const BREATH_FRACTION = 0.25;
const BREATH_MIN_S = 0.06;
const BREATH_MAX_S = 0.3;
/** Dấu ngắt nghỉ (//): lặng thêm chừng này phách (nốt đen) sau nốt, cho mọi part. */
const CAESURA_BEATS = 1;
/** Láy rền: mỗi nốt luân phiên dài chừng này (giây); láy ngắn / láy vòng: nốt láy dài trong khoảng này. */
const TRILL_STEP_S = 0.07;
const TRILL_MIN_STEP_S = 0.035;
const ORNAMENT_MIN_S = 0.03;
/** Glissando / slide: phần đầu của nốt giữ nguyên cao độ gốc, phần còn lại trượt tới nốt đích (mỗi bước một nửa cung). */
const GLISS_HOLD = 0.3;
const GLISS_STEP_MAX_S = 0.1;
const GLISS_STEP_MIN_S = 0.025;
const ORNAMENT_MAX_S = 0.09;
/** Rải hợp âm: nốt kế tiếp vào trễ chừng này (giây), tổng độ rải không quá nửa độ dài nốt ngắn nhất và 0,25 giây. */
const ARPEGGIO_STEP_S = 0.035;
const ARPEGGIO_MAX_S = 0.25;
/** Nốt ngân nhờ pedal vang tối đa chừng này (giây) kể từ lúc đánh. */
const PEDAL_MAX_S = 8;
/** Nốt có accent / marcato / sf to hơn chừng 30%. */
const ACCENT_BOOST = 1.3;
/** Cresc./dim. không có mức đích thì đổi ±25%. */
const HAIRPIN_STEP = 0.25;
/** Một nốt hoa mỹ có gạch lấy 1/8 phách đen từ nốt chính; nốt không gạch lấy một nửa nốt chính. */
const GRACE_QUARTERS = 0.125;
const MIN_GAIN = 0.05;
const EPS = 1e-6;

/** Vận tốc MIDI xấp xỉ của các mức to nhỏ. */
const LEVEL_VELOCITY: Record<string, number> = {
  pppp: 10,
  ppp: 20,
  pp: 36,
  p: 54,
  mp: 69,
  mf: 83,
  f: 98,
  ff: 112,
  fff: 127,
  ffff: 127,
};
/** Dấu nhấn một nốt; fp / sfp còn kéo mức về p sau nốt đó. */
const ACCENT_DYNAMICS: Record<string, { peak?: number; after?: number }> = {
  sf: {},
  sfz: {},
  sffz: {},
  fz: {},
  rf: {},
  rfz: {},
  fp: { peak: 98, after: 54 },
  sfp: { peak: 98, after: 54 },
};

/** Cao độ nghe thấy của một nốt (nhạc cụ chuyển âm nghe khác chữ viết). */
const soundOf = (info: NoteInfo): number | null => info.soundingMidi ?? info.midi;

const has = (table: object, key: string): boolean => Object.prototype.hasOwnProperty.call(table, key);

const clampGain = (gain: number): number => Math.min(1, Math.max(MIN_GAIN, gain));

const childNumber = (parent: Element, tag: string): number => {
  const text = Array.from(parent.children)
    .find((c) => c.tagName === tag)
    ?.textContent?.trim();
  const value = Number(text);
  return text && Number.isFinite(value) ? value : 0;
};

const hasChild = (el: Element, tag: string): boolean => Array.from(el.children).some((c) => c.tagName === tag);

const hasTie = (note: Element, type: string): boolean =>
  Array.from(note.children).some((c) => c.tagName === 'tie' && c.getAttribute('type') === type);

const hasDeep = (el: Element, tag: string): boolean => el.getElementsByTagName(tag).length > 0;

type Item =
  | {
      kind: 'note';
      child: Element;
      /** Vị trí và độ dài tính bằng divisions của part. */
      start: number;
      duration: number;
      isChord: boolean;
      isGrace: boolean;
      slash: boolean;
    }
  | { kind: 'harmony'; at: number; child: Element }
  | { kind: 'tempo'; at: number; bpm: number }
  | { kind: 'level'; at: number; velocity: number }
  | { kind: 'accent'; at: number; peak?: number; after?: number }
  | { kind: 'wedge'; at: number; type: 'crescendo' | 'diminuendo' | 'stop'; number: string }
  | { kind: 'pedal'; at: number; mode: PedalMode };

/** Nhấn (down), nhả (up) hoặc nhả rồi nhấn lại ngay (change) pedal. */
type PedalMode = 'down' | 'up' | 'change';

/** Pedal ghi bằng <pedal type="..."> hoặc <sound damper-pedal="...">; null nếu không phải thao tác nhấn/nhả. */
const pedalModeOfType = (type: string | null): PedalMode | null => {
  if (type === 'start' || type === 'resume') return 'down';
  if (type === 'stop' || type === 'discontinue') return 'up';
  if (type === 'change') return 'change';
  return null;
};
const pedalModeOfDamper = (value: string | null): PedalMode | null => {
  if (value === null) return null;
  const text = value.trim().toLowerCase();
  if (text === 'yes') return 'down';
  if (text === 'no') return 'up';
  const n = Number(text);
  return Number.isFinite(n) && text !== '' ? (n > 0 ? 'down' : 'up') : null;
};

interface Scan {
  items: Item[];
  /** Vị trí xa nhất (divisions) mà ô đã đi tới. */
  furthest: number;
}

const readDirection = (direction: Element, at: number, items: Item[]): void => {
  let soundVelocity: number | null = null;
  for (const sound of Array.from(direction.getElementsByTagName('sound'))) {
    const tempo = Number(sound.getAttribute('tempo'));
    if (tempo > 0) items.push({ kind: 'tempo', at, bpm: tempo });
    const dynamics = Number(sound.getAttribute('dynamics'));
    if (sound.hasAttribute('dynamics') && dynamics > 0) soundVelocity = dynamics;
  }
  const names = Array.from(direction.getElementsByTagName('dynamics')).flatMap((d) =>
    Array.from(d.children).map((c) => c.tagName),
  );
  const levelName = names.find((n) => has(LEVEL_VELOCITY, n));
  const accentName = names.find((n) => has(ACCENT_DYNAMICS, n));
  const velocity = soundVelocity ?? (levelName ? LEVEL_VELOCITY[levelName] : null);
  if (velocity !== null) items.push({ kind: 'level', at, velocity });
  if (accentName) items.push({ kind: 'accent', at, ...ACCENT_DYNAMICS[accentName] });
  const pedals = Array.from(direction.getElementsByTagName('pedal'));
  if (pedals.length > 0) {
    for (const pedal of pedals) {
      const mode = pedalModeOfType(pedal.getAttribute('type'));
      if (mode) items.push({ kind: 'pedal', at, mode });
    }
  } else {
    for (const sound of Array.from(direction.getElementsByTagName('sound'))) {
      const mode = pedalModeOfDamper(sound.getAttribute('damper-pedal'));
      if (mode) items.push({ kind: 'pedal', at, mode });
    }
  }
  for (const wedge of Array.from(direction.getElementsByTagName('wedge'))) {
    const type = wedge.getAttribute('type');
    if (type === 'crescendo' || type === 'diminuendo' || type === 'stop') {
      items.push({ kind: 'wedge', at, type, number: wedge.getAttribute('number') ?? '1' });
    }
  }
};

/** Đọc một ô nhịp: các nốt, tempo, mức to nhỏ, vạch cresc./dim., kèm vị trí (divisions). */
const scanMeasure = (measure: Element): Scan => {
  const items: Item[] = [];
  let cursor = 0;
  let furthest = 0;
  let lastStart = 0;
  for (const child of Array.from(measure.children)) {
    if (child.tagName === 'backup') cursor -= childNumber(child, 'duration');
    else if (child.tagName === 'forward') cursor += childNumber(child, 'duration');
    else if (child.tagName === 'harmony') {
      items.push({ kind: 'harmony', at: Math.max(0, cursor + childNumber(child, 'offset')), child });
    } else if (child.tagName === 'direction') {
      readDirection(child, Math.max(0, cursor + childNumber(child, 'offset')), items);
    } else if (child.tagName === 'sound') {
      const tempo = Number(child.getAttribute('tempo'));
      if (tempo > 0) items.push({ kind: 'tempo', at: cursor, bpm: tempo });
      const dynamics = Number(child.getAttribute('dynamics'));
      if (child.hasAttribute('dynamics') && dynamics > 0) items.push({ kind: 'level', at: cursor, velocity: dynamics });
      const pedal = pedalModeOfDamper(child.getAttribute('damper-pedal'));
      if (pedal) items.push({ kind: 'pedal', at: cursor, mode: pedal });
    } else if (child.tagName === 'note') {
      const isChord = hasChild(child, 'chord');
      const isGrace = hasChild(child, 'grace');
      const duration = childNumber(child, 'duration');
      const start = isChord ? lastStart : cursor;
      if (!isChord) {
        lastStart = start;
        if (!isGrace) cursor += duration;
      }
      furthest = Math.max(furthest, cursor);
      const grace = Array.from(child.children).find((c) => c.tagName === 'grace');
      items.push({
        kind: 'note',
        child,
        start,
        duration,
        isChord,
        isGrace,
        slash: grace?.getAttribute('slash') === 'yes',
      });
    }
  }
  return { items, furthest };
};

interface Segment {
  /** Vị trí (số nốt đen kể từ đầu ô) bắt đầu đoạn tempo này. */
  q: number;
  bpm: number;
}

interface Fermata {
  /** Vị trí (nốt đen) nơi fermata kết thúc: từ đó trở đi phải chờ thêm `extra` giây. */
  pos: number;
  extra: number;
}

/** Thời gian của một ô nhịp trong đồng hồ chung. */
interface MeasureTime {
  start: number;
  /** Phách đen kể từ đầu lượt phát. */
  startBeat: number;
  /** Độ dài ô (nốt đen) lấy theo part dài nhất. */
  length: number;
  segments: Segment[];
  fermatas: Fermata[];
  /** Quãng lặng chèn SAU nốt (dấu ngắt nghỉ): nốt kết thúc tại `pos` không bị dời, nốt bắt đầu tại `pos` thì chờ `extra`. */
  gaps: Fermata[];
}

/** Giây trôi qua từ đầu ô đến vị trí `q` (nốt đen), chỉ tính tempo, chưa tính fermata. */
const baseAt = (segments: Segment[], q: number): number => {
  let seconds = 0;
  for (let i = 0; i < segments.length; i++) {
    const to = i + 1 < segments.length ? segments[i + 1].q : Infinity;
    const span = Math.min(q, to) - segments[i].q;
    if (span > 0) seconds += (span * 60) / segments[i].bpm;
  }
  return seconds;
};

/** Tempo (nốt đen mỗi phút) có hiệu lực tại vị trí `q` của ô. */
const bpmAt = (segments: Segment[], q: number): number => {
  let bpm = segments[0].bpm;
  for (const segment of segments) if (segment.q <= q + EPS) bpm = segment.bpm;
  return bpm;
};

/**
 * Thời điểm (giây) của vị trí `q` trong ô: fermata kết thúc tại hoặc trước `q` đã làm mọi thứ sau nó chậm lại.
 * `isEnd`: `q` là chỗ một nốt NHẢ ra; quãng lặng của dấu ngắt nghỉ tại đúng `q` chưa tính (nốt kết thúc đúng chỗ, nốt sau
 * mới chờ).
 */
const timeAt = (m: MeasureTime, q: number, isEnd = false): number => {
  let seconds = m.start + baseAt(m.segments, q);
  for (const f of m.fermatas) if (f.pos <= q + EPS) seconds += f.extra;
  for (const g of m.gaps) if (isEnd ? g.pos < q - EPS : g.pos <= q + EPS) seconds += g.extra;
  return seconds;
};

type Event =
  | { time: number; item: Extract<Item, { kind: 'level' }> }
  | { time: number; item: Extract<Item, { kind: 'accent' }> }
  | { time: number; item: Extract<Item, { kind: 'wedge' }> };

/** Nốt đang dựng, chưa chốt độ dài và âm lượng. */
interface Building {
  id: string;
  start: number;
  end: number;
  measure: number;
  order: number;
  staff: number;
  beat: number;
  beatEnd: number;
  midi: number;
  factor: number;
  accent: boolean;
  voice: number;
  /** Cắt bớt cuối nốt (giây): dấu lấy hơi. */
  trim: number;
  ornament: OrnamentKind | null;
  /** Nốt kề trên / dưới (cao độ nghe thấy) để khai triển láy; null nếu không tính được. */
  neighbors: { upper: number; lower: number } | null;
  /** Nốt thuộc một hợp âm được rải; hướng rải. */
  arpeggio: 'up' | 'down' | null;
  /** Khóa nhóm các nốt cùng hợp âm (cùng thời điểm, khuông, bè) để rải. */
  chordKey: string;
  /** Khóa các đường glissando/slide bắt đầu / kết thúc ở nốt này (khuông|kiểu|số hiệu). */
  glissStart: string[];
  glissStop: string[];
  /** Cao độ nốt đích của glissando/slide bắt đầu ở nốt này; null nếu không có. */
  glissTarget: number | null;
}

type OrnamentKind = 'trill' | 'mordent' | 'invMordent' | 'turn';

/** Các dấu luyến (<slur>) bắt đầu / kết thúc trên thẻ <note>, khóa theo số thứ tự của dấu luyến. */
const slurMarks = (note: Element): { starts: string[]; stops: string[] } => {
  const starts: string[] = [];
  const stops: string[] = [];
  for (const slur of Array.from(note.getElementsByTagName('slur'))) {
    const key = slur.getAttribute('number') ?? '1';
    const type = slur.getAttribute('type');
    if (type === 'start') starts.push(key);
    else if (type === 'stop') stops.push(key);
  }
  return { starts, stops };
};

const articulationFactor = (note: Element): number => {
  if (hasDeep(note, 'staccatissimo')) return ARTICULATION_FACTOR.staccatissimo;
  if (hasDeep(note, 'staccato')) return ARTICULATION_FACTOR.staccato;
  if (hasDeep(note, 'tenuto')) return ARTICULATION_FACTOR.tenuto;
  if (hasDeep(note, 'strong-accent')) return MARCATO_FACTOR;
  return LEGATO_FACTOR;
};

const ornamentOf = (note: Element): OrnamentKind | null => {
  if (hasDeep(note, 'trill-mark')) return 'trill';
  if (hasDeep(note, 'inverted-mordent')) return 'invMordent';
  if (hasDeep(note, 'mordent')) return 'mordent';
  if (hasDeep(note, 'turn')) return 'turn';
  return null;
};

const arpeggioOf = (note: Element): 'up' | 'down' | null => {
  const el = note.getElementsByTagName('arpeggiate')[0];
  if (!el) return null;
  return el.getAttribute('direction') === 'down' ? 'down' : 'up';
};

/** Khóa của các thẻ <glissando>/<slide> có `type` cho trước trên nốt (cùng khuông, kiểu và số hiệu thì ghép thành cặp). */
const lineKeys = (note: Element, staff: number, type: 'start' | 'stop'): string[] =>
  (['glissando', 'slide'] as const).flatMap((tag) =>
    Array.from(note.getElementsByTagName(tag))
      .filter((el) => el.getAttribute('type') === type)
      .map((el) => `${staff}|${tag}|${el.getAttribute('number') ?? '1'}`),
  );

/** Ghép nốt bắt đầu với nốt kết thúc của glissando/slide để nốt đầu biết cao độ đích. Nhận danh sách đã xếp theo thời gian. */
const linkGlissandi = (notes: Building[]): void => {
  const open = new Map<string, Building>();
  for (const note of notes) {
    for (const key of note.glissStop) {
      const from = open.get(key);
      if (from) {
        from.glissTarget = note.midi;
        open.delete(key);
      }
    }
    for (const key of note.glissStart) open.set(key, note);
  }
};

/**
 * Khai triển glissando/slide thành các nốt nhỏ trong `span` giây của nốt đầu: giữ cao độ gốc một lúc rồi trượt từng
 * nửa cung tới sát nốt đích (nốt đích do chính nốt kế tiếp phát). Quá nhiều bước thì bỏ cách một để mỗi bước không
 * ngắn hơn GLISS_STEP_MIN_S. Hai nốt cách nhau không quá một nửa cung thì không cần khai triển (mảng rỗng).
 */
const expandGliss = (from: number, to: number, span: number): OrnamentStep[] => {
  const between = Math.abs(to - from) - 1;
  if (between < 1 || span <= 0) return [];
  const direction = Math.sign(to - from);
  const runSpan = span * (1 - GLISS_HOLD);
  const stride = Math.max(1, Math.ceil((GLISS_STEP_MIN_S * between) / runSpan));
  const middles: number[] = [];
  for (let k = stride; k <= between; k += stride) middles.push(from + direction * k);
  if (middles.length === 0) return [];
  const length = Math.min(GLISS_STEP_MAX_S, runSpan / middles.length);
  const runStart = span - length * middles.length;
  return [
    { midi: from, offset: 0, length: runStart },
    ...middles.map((midi, i) => ({ midi, offset: runStart + i * length, length })),
  ];
};

/**
 * Cao độ nghe thấy của nốt kề trên và kề dưới (theo bậc của khóa nhạc đang có hiệu lực) để khai triển láy. Dấu hóa bất
 * thường ghi riêng cho nốt gốc không ảnh hưởng nốt kề (theo thông lệ: nốt kề theo khóa nhạc).
 */
const neighborsOf = (info: NoteInfo, fifths: number): { upper: number; lower: number } | null => {
  const pitch = info.element.getElementsByTagName('pitch')[0];
  const step = pitch?.getElementsByTagName('step')[0]?.textContent?.trim() as Step | undefined;
  const octave = Number(pitch?.getElementsByTagName('octave')[0]?.textContent);
  const at = step ? STEPS.indexOf(step) : -1;
  const shift = (info.soundingMidi ?? 0) - (info.midi ?? 0);
  if (at < 0 || !Number.isFinite(octave) || info.midi === null || info.soundingMidi === null) return null;
  // Dấu hóa ghi kèm láy (♯ ♭ ♮ trên chữ tr) áp cho nốt kề trên thay cho hóa biểu
  const accidental = info.element.getElementsByTagName('accidental-mark')[0]?.textContent?.trim();
  const upperAlter = accidental
    ? ({ sharp: 1, flat: -1, natural: 0 } as Record<string, number>)[accidental]
    : undefined;
  const spell = (stepIndex: number, oct: number, alter?: number): number => {
    const target = STEPS[(stepIndex + 7) % 7];
    return pitchToMidi({ step: target, alter: alter ?? keyAlter(fifths, target), octave: oct }) + shift;
  };
  return {
    upper: spell(at + 1, octave + (at === 6 ? 1 : 0), upperAlter),
    lower: spell(at - 1, octave - (at === 0 ? 1 : 0)),
  };
};

/** Một nốt nhỏ của láy: cao độ, lệch so với đầu nốt gốc và độ dài (giây). Nốt cuối của khai triển kéo dài tới hết nốt. */
interface OrnamentStep {
  midi: number;
  offset: number;
  length: number;
}

/**
 * Khai triển láy thành các nốt nhỏ trong `span` giây của nốt gốc (không tính phần ngân thêm). Trả về mảng rỗng nếu nốt
 * quá ngắn hoặc không có nốt kề: nốt gốc phát nguyên như thường.
 * - Láy rền (tr): nốt gốc luân phiên với nốt kề trên (rồi kết bằng nốt gốc).
 * - Láy ngắn (mordent, có gạch): gốc – kề dưới – gốc. Láy ngắn ngược (không gạch): gốc – kề trên – gốc.
 * - Láy vòng: kề trên – gốc – kề dưới – gốc.
 */
const expandOrnament = (
  kind: OrnamentKind,
  main: number,
  neighbors: { upper: number; lower: number } | null,
  span: number,
): OrnamentStep[] => {
  if (!neighbors || span <= 0) return [];
  if (kind === 'trill') {
    let count = Math.floor(span / TRILL_STEP_S);
    count = Math.min(count, Math.floor(span / TRILL_MIN_STEP_S));
    if (count < 3) return [];
    if (count % 2 === 0) count -= 1; // kết thúc bằng nốt gốc
    const length = span / count;
    return Array.from({ length: count }, (_, i) => ({
      midi: i % 2 === 0 ? main : neighbors.upper,
      offset: i * length,
      length,
    }));
  }
  const pattern =
    kind === 'mordent'
      ? [main, neighbors.lower, main]
      : kind === 'invMordent'
        ? [main, neighbors.upper, main]
        : [neighbors.upper, main, neighbors.lower, main];
  const quick = pattern.length - 1;
  const length = Math.min(ORNAMENT_MAX_S, Math.max(ORNAMENT_MIN_S, span * (kind === 'turn' ? 0.15 : 0.12)));
  if (quick * length > span * 0.6) return [];
  return pattern.map((midi, i) => ({ midi, offset: i * length, length: i === quick ? span - quick * length : length }));
};

/** Gán âm lượng cho các nốt của MỘT part theo mức to nhỏ, dấu nhấn và cresc./dim. */
const assignGains = (notes: Building[], events: Event[]): Map<Building, number> => {
  notes.sort((a, b) => a.start - b.start);
  events.sort((a, b) => a.time - b.time);

  // Dấu nhấn (sf, sfz, fp...) tác động lên nốt đầu tiên từ vị trí của nó
  const boosts: { start: number; peak?: number; after?: number }[] = [];
  for (const e of events) {
    if (e.item.kind !== 'accent') continue;
    const target = notes.find((n) => n.start >= e.time - EPS);
    if (target) boosts.push({ start: target.start, peak: e.item.peak, after: e.item.after });
  }
  const afters = boosts.filter((b) => b.after !== undefined);

  const result = new Map<Building, number>();
  let gain = DEFAULT_GAIN;
  let wedge: { start: number; end: number; from: number; to: number } | null = null;
  let next = 0;
  let afterIndex = 0;
  for (const note of notes) {
    while (afterIndex < afters.length && note.start > afters[afterIndex].start + EPS) {
      gain = velocityGain(afters[afterIndex].after as number);
      wedge = null;
      afterIndex += 1;
    }
    while (next < events.length && events[next].time <= note.start + EPS) {
      const event = events[next];
      const item = event.item;
      if (item.kind === 'level') {
        gain = velocityGain(item.velocity);
        wedge = null;
      } else if (item.kind === 'wedge' && item.type !== 'stop') {
        let endTime: number | null = null;
        for (let j = next + 1; j < events.length && endTime === null; j++) {
          const other = events[j].item;
          if (other.kind === 'wedge' && other.type === 'stop' && other.number === item.number) endTime = events[j].time;
        }
        if (endTime !== null && endTime > event.time) {
          // Mức đích: mức to nhỏ đặt ngay tại điểm kết thúc (trước nốt kế tiếp), nếu không thì ±25%
          const following = notes.find((n) => n.start >= (endTime as number) - EPS);
          const limit = following ? following.start + EPS : Infinity;
          let to: number | null = null;
          for (let j = next + 1; j < events.length && to === null; j++) {
            const other = events[j].item;
            if (other.kind === 'level' && events[j].time >= endTime - EPS && events[j].time <= limit) {
              to = velocityGain(other.velocity);
            }
          }
          wedge = {
            start: event.time,
            end: endTime,
            from: gain,
            to: to ?? clampGain(gain * (item.type === 'crescendo' ? 1 + HAIRPIN_STEP : 1 - HAIRPIN_STEP)),
          };
        }
      }
      next += 1;
    }
    let g = gain;
    if (wedge) {
      if (note.start >= wedge.end - EPS) {
        gain = wedge.to;
        g = gain;
        wedge = null;
      } else {
        g = wedge.from + ((wedge.to - wedge.from) * (note.start - wedge.start)) / (wedge.end - wedge.start);
      }
    }
    const boost = boosts.find((b) => Math.abs(b.start - note.start) < EPS);
    if (boost) g = boost.peak !== undefined ? velocityGain(boost.peak) : g * ACCENT_BOOST;
    if (note.accent) g *= ACCENT_BOOST;
    result.set(note, clampGain(g));
  }
  return result;
};

/**
 * Rải hợp âm: các nốt cùng hợp âm (cùng thời điểm, khuông, bè) có dấu rải vào lần lượt từ thấp lên cao (hoặc từ cao xuống thấp
 * nếu dấu rải hướng xuống), cách nhau vài chục mili giây; nốt đầu vẫn vào đúng phách và mọi nốt cùng nhả ở cuối.
 */
const spreadArpeggios = (notes: Building[]): void => {
  const groups = new Map<string, Building[]>();
  for (const note of notes) {
    if (!note.arpeggio) continue;
    const list = groups.get(note.chordKey);
    if (list) list.push(note);
    else groups.set(note.chordKey, [note]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const down = group[0].arpeggio === 'down';
    group.sort((a, b) => (down ? b.midi - a.midi : a.midi - b.midi));
    const shortest = Math.min(...group.map((n) => n.end - n.start));
    const step = Math.min(ARPEGGIO_STEP_S, ARPEGGIO_MAX_S / (group.length - 1), (shortest * 0.5) / (group.length - 1));
    group.forEach((note, i) => {
      note.start += step * i;
    });
  }
};

/**
 * Pedal nâng đỡ của một part: trả về hàm cho biết, nếu pedal đang nhấn tại `time` (lúc nhả phím), pedal sẽ được nhả vào lúc
 * nào (Infinity nếu không bao giờ nhả); null nếu pedal không nhấn.
 */
const pedalSustain = (pedals: { time: number; mode: PedalMode }[]): ((time: number) => number | null) => {
  const sorted = [...pedals].sort((a, b) => a.time - b.time);
  const spans: { from: number; to: number }[] = [];
  let open: number | null = null;
  for (const action of sorted) {
    if (action.mode === 'down') {
      if (open === null) open = action.time;
    } else if (action.mode === 'up') {
      if (open !== null) spans.push({ from: open, to: action.time });
      open = null;
    } else {
      if (open !== null) spans.push({ from: open, to: action.time });
      open = action.time;
    }
  }
  if (open !== null) spans.push({ from: open, to: Infinity });
  return (time) => {
    const span = spans.find((s) => s.from <= time + EPS && time < s.to - EPS);
    return span ? span.to : null;
  };
};

/** Tra thời điểm bắt đầu của nốt kế tiếp cùng cao độ (cùng part) để nốt ngân nhờ pedal không chồng lên nó. */
const onsetsByPitch = (notes: Building[]): { next: (note: Building) => number | null } => {
  const byPitch = new Map<number, number[]>();
  for (const note of notes) {
    const list = byPitch.get(note.midi);
    if (list) list.push(note.start);
    else byPitch.set(note.midi, [note.start]);
  }
  for (const list of byPitch.values()) list.sort((a, b) => a - b);
  return {
    next: (note) => byPitch.get(note.midi)?.find((t) => t > note.start + EPS) ?? null,
  };
};

/**
 * Dựng lịch phát cho cả bản nhạc.
 * @param doc tài liệu MusicXML
 * @param fallbackBpm tempo dùng khi file không có <sound tempo>
 */
export function buildPlayback(doc: ScoreDocument, fallbackBpm: number): PlaybackPlan {
  const infoOf = new Map<Element, NoteInfo>();
  for (const info of doc.notes) infoOf.set(info.element, info);

  const order = playOrder(doc);
  const parts = Array.from({ length: doc.partCount }, (_, p) => doc.getMeasures(p));
  const scans = new Map<Element, Scan>();
  const scanOf = (measure: Element): Scan => {
    let scan = scans.get(measure);
    if (!scan) {
      scan = scanMeasure(measure);
      scans.set(measure, scan);
    }
    return scan;
  };
  const divisionsOf = (p: number, measureIndex: number): number => doc.divisionsAtPart(p, measureIndex) || 1;

  // Lượt 1: đồng hồ chung (độ dài ô, tempo từng đoạn, fermata) của từng ô theo thứ tự phát
  const times: MeasureTime[] = [];
  let bpm = fallbackBpm > 0 ? fallbackBpm : 100;
  let clock = 0;
  let beatClock = 0;
  for (const measureIndex of order) {
    let length = 0;
    let tempos: { q: number; bpm: number }[] = [];
    let tempoFound = false;
    const held: { q0: number; q1: number }[] = [];
    const pauses: number[] = [];
    parts.forEach((measures, p) => {
      const measure = measures[measureIndex];
      if (!measure) return;
      const scan = scanOf(measure);
      const div = divisionsOf(p, measureIndex);
      length = Math.max(length, scan.furthest / div);
      if (!tempoFound) {
        const found = scan.items.flatMap((i) => (i.kind === 'tempo' ? [{ q: i.at / div, bpm: i.bpm }] : []));
        if (found.length > 0) {
          tempos = found;
          tempoFound = true;
        }
      }
      for (const item of scan.items) {
        if (item.kind === 'note' && item.duration > 0 && hasDeep(item.child, 'fermata')) {
          held.push({ q0: item.start / div, q1: (item.start + item.duration) / div });
        }
        if (item.kind === 'note' && item.duration > 0 && !item.isGrace && hasDeep(item.child, 'caesura')) {
          pauses.push((item.start + item.duration) / div);
        }
      }
    });
    const segments: Segment[] = [{ q: 0, bpm }];
    for (const t of [...tempos].sort((a, b) => a.q - b.q)) {
      if (t.q <= EPS) segments[0].bpm = t.bpm;
      else segments.push({ q: t.q, bpm: t.bpm });
    }
    const fermatas = new Map<number, Fermata>();
    for (const h of held) {
      const extra = baseAt(segments, h.q1) - baseAt(segments, h.q0);
      const key = Math.round(h.q1 * 1e6);
      if (extra > (fermatas.get(key)?.extra ?? 0)) fermatas.set(key, { pos: h.q1, extra });
    }
    const gaps = new Map<number, Fermata>();
    for (const pos of pauses) {
      const extra = (CAESURA_BEATS * 60) / bpmAt(segments, pos);
      const key = Math.round(pos * 1e6);
      if (extra > (gaps.get(key)?.extra ?? 0)) gaps.set(key, { pos, extra });
    }
    const m: MeasureTime = {
      start: clock,
      startBeat: beatClock,
      length,
      segments,
      fermatas: [...fermatas.values()],
      gaps: [...gaps.values()],
    };
    times.push(m);
    beatClock += length;
    clock = timeAt(m, length);
    bpm = segments[segments.length - 1].bpm;
  }

  // Lượt 2: nốt của từng part trên đồng hồ chung
  const result: PlayNote[] = [];
  parts.forEach((measures, p) => {
    const building: Building[] = [];
    const events: Event[] = [];
    const pending = new Map<string, Building>();
    /** Thao tác nhấn / nhả pedal của part (thời điểm theo đồng hồ chung). */
    const pedals: { time: number; mode: PedalMode }[] = [];
    /** Các dấu luyến đang mở trong part này: nốt nằm trong dấu luyến được ngân liền sang nốt kế. */
    const slurs = new Set<string>();
    let previous = -1;
    order.forEach((measureIndex, k) => {
      const measure = measures[measureIndex];
      if (!measure) return;
      if (measureIndex !== previous + 1) {
        pending.clear(); // nhảy (lặp, D.C....): nốt nối và dấu luyến không đi theo
        slurs.clear();
      }
      previous = measureIndex;
      const mt = times[k];
      const div = divisionsOf(p, measureIndex);
      const at = (q: number, isEnd = false): number => timeAt(mt, q, isEnd);

      let graces: { item: Extract<Item, { kind: 'note' }>; info: NoteInfo; slash: boolean }[][] = [];
      let startQ = 0;
      let endQ = 0;
      for (const item of scanOf(measure).items) {
        if (item.kind === 'level' || item.kind === 'accent' || item.kind === 'wedge') {
          events.push({ time: at(item.at / div), item } as Event);
          continue;
        }
        if (item.kind === 'pedal') {
          pedals.push({ time: at(item.at / div), mode: item.mode });
          continue;
        }
        if (item.kind !== 'note') continue;
        const info = infoOf.get(item.child);
        if (item.isGrace) {
          if (info && !info.isRest && info.midi !== null) {
            if (item.isChord && graces.length > 0) graces[graces.length - 1].push({ item, info, slash: item.slash });
            else graces.push([{ item, info, slash: item.slash }]);
          }
          continue;
        }
        if (!item.isChord) {
          startQ = item.start / div;
          endQ = (item.start + item.duration) / div;
          if (graces.length > 0 && info && !info.isRest && info.midi !== null && endQ > startQ) {
            // Nốt hoa mỹ lấy thời gian từ nốt chính: có gạch 1/8 phách, không gạch chia đều nửa nốt chính
            const duration = endQ - startQ;
            const plain = graces.filter((g) => !g[0].slash).length;
            let lengths = graces.map((g) => (g[0].slash ? GRACE_QUARTERS : duration / 2 / plain));
            const total = lengths.reduce((a, b) => a + b, 0);
            if (total > duration / 2) lengths = lengths.map((l) => (l * duration) / 2 / total);
            let offset = startQ;
            graces.forEach((group, gi) => {
              for (const g of group) {
                building.push({
                  id: g.info.id,
                  start: at(offset),
                  end: at(offset + lengths[gi], true),
                  measure: measureIndex,
                  order: k,
                  staff: g.info.staff,
                  beat: mt.startBeat + offset,
                  beatEnd: mt.startBeat + offset + lengths[gi],
                  midi: soundOf(g.info) as number,
                  factor: 1,
                  accent: false,
                  voice: g.info.voice,
                  trim: 0,
                  ornament: null,
                  neighbors: null,
                  arpeggio: null,
                  chordKey: '',
                  glissStart: [],
                  glissStop: [],
                  glissTarget: null,
                });
              }
              offset += lengths[gi];
            });
            startQ = offset;
          }
          graces = [];
        }
        if (!info || info.isRest || info.midi === null || item.duration <= 0) continue;
        const marks = slurMarks(item.child);
        marks.starts.forEach((k) => slurs.add(`${info.staff}|${k}`));
        marks.stops.forEach((k) => slurs.delete(`${info.staff}|${k}`));
        const legato = slurs.size > 0; // nốt cuối của dấu luyến đã đóng nên ngắt bình thường
        const key = `${info.staff}|${info.voice}|${info.midi}`;
        const held = hasTie(item.child, 'stop') ? pending.get(key) : undefined;
        if (held) {
          held.end = at(endQ, true);
          held.beatEnd = mt.startBeat + endQ;
          if (hasDeep(item.child, 'breath-mark')) held.trim = -1;
          if (!hasTie(item.child, 'start')) pending.delete(key);
          continue;
        }
        const ornament = ornamentOf(item.child);
        const note: Building = {
          id: info.id,
          start: at(startQ),
          end: at(endQ, true),
          measure: measureIndex,
          order: k,
          staff: info.staff,
          beat: mt.startBeat + startQ,
          beatEnd: mt.startBeat + endQ,
          midi: soundOf(info) as number,
          factor: legato && articulationFactor(item.child) === LEGATO_FACTOR ? 1 : articulationFactor(item.child),
          accent: hasDeep(item.child, 'accent') || hasDeep(item.child, 'strong-accent'),
          voice: info.voice,
          // -1: có dấu lấy hơi, độ cắt tính khi đã biết độ dài cuối cùng của nốt (nốt nối có thể dài thêm)
          trim: hasDeep(item.child, 'breath-mark') ? -1 : 0,
          ornament,
          neighbors: ornament ? neighborsOf(info, doc.keyAtPart(p, measureIndex)) : null,
          arpeggio: arpeggioOf(item.child),
          chordKey: `${k}|${info.staff}|${info.voice}|${startQ.toFixed(6)}`,
          glissStart: lineKeys(item.child, info.staff, 'start'),
          glissStop: lineKeys(item.child, info.staff, 'stop'),
          glissTarget: null,
        };
        building.push(note);
        if (hasTie(item.child, 'start')) pending.set(key, note);
      }
    });
    const gains = assignGains(building, events);
    spreadArpeggios(building);
    linkGlissandi(building);
    const sustain = pedalSustain(pedals);
    const onsets = onsetsByPitch(building);
    for (const note of building) {
      const span = note.end - note.start;
      // Độ dài nốt nhả phím: theo dấu thể hiện, bớt một đoạn nếu có dấu lấy hơi
      let held = span * note.factor;
      if (note.trim !== 0) {
        const cut = Math.min(BREATH_MAX_S, Math.max(BREATH_MIN_S, span * BREATH_FRACTION));
        held = Math.max(span * 0.4 * note.factor, held - cut);
      }
      // Pedal đang nhấn lúc nhả phím thì nốt ngân tới khi nhả pedal (không quá PEDAL_MAX_S và không chồng nốt cùng cao độ)
      let ringing = held;
      const release = sustain(note.start + held);
      if (release !== null) {
        const nextSame = onsets.next(note);
        const limit = Math.min(PEDAL_MAX_S, release - note.start, nextSame === null ? Infinity : nextSame - note.start);
        ringing = Math.max(held, limit);
      }
      const gain = gains.get(note) ?? DEFAULT_GAIN;
      const plain: PlayNote = {
        id: note.id,
        part: p,
        time: note.start,
        duration: held,
        midi: note.midi,
        gain,
        measure: note.measure,
        order: note.order,
        staff: note.staff,
        beat: note.beat,
        beatEnd: note.beatEnd,
      };
      const ringsLonger = ringing > held + EPS;
      const base: PlayNote = ringsLonger ? { ...plain, ring: ringing } : plain;
      const steps = note.ornament
        ? expandOrnament(note.ornament, note.midi, note.neighbors, span)
        : note.glissTarget !== null
          ? expandGliss(note.midi, note.glissTarget, span)
          : [];
      if (steps.length === 0) {
        result.push(base);
        continue;
      }
      // Nốt gốc im (chỉ để tô nốt và chấm điểm); các nốt láy phát tiếng, nốt cuối ngân hết độ dài của nốt gốc
      result.push({ ...base, silent: true });
      steps.forEach((step, i) => {
        const last = i === steps.length - 1;
        const duration = last ? Math.max(step.length * LEGATO_FACTOR, held - step.offset) : step.length * LEGATO_FACTOR;
        result.push({
          ...plain,
          time: note.start + step.offset,
          duration,
          midi: step.midi,
          ornament: true,
          ...(last && ringsLonger ? { ring: ringing - step.offset } : {}),
        });
      });
    }
  });
  result.sort((a, b) => a.time - b.time || a.midi - b.midi);

  // Lượt 3: nốt đệm của ký hiệu hợp âm, lấy từ part đầu tiên có hợp âm (tránh đánh đôi khi nhiều part cùng ghi hợp âm)
  const chords: PlayNote[] = [];
  const chordPart = parts.findIndex((measures) =>
    measures.some((m) => scanOf(m).items.some((i) => i.kind === 'harmony')),
  );
  if (chordPart >= 0) {
    const chordMeasures = parts[chordPart];
    const harmoniesOf = (m: Element) =>
      scanOf(m)
        .items.flatMap((i) => (i.kind === 'harmony' ? [i] : []))
        .sort((a, b) => a.at - b.at);
    // Hợp âm đang có hiệu lực ở đầu từng ô theo thứ tự TRONG BẢN NHẠC (không theo lượt phát) nên lặp lại / nhảy vẫn đúng
    const carry: (ChordNotes | null)[] = [];
    let current: ChordNotes | null = null;
    chordMeasures.forEach((m, index) => {
      carry[index] = current;
      for (const h of harmoniesOf(m)) current = chordNotes(h.child);
    });
    order.forEach((measureIndex, k) => {
      const measure = chordMeasures[measureIndex];
      if (!measure) return;
      const mt = times[k];
      const div = divisionsOf(chordPart, measureIndex);
      const harmonies = harmoniesOf(measure);
      const points: { q: number; notes: ChordNotes | null; carried?: boolean }[] = [];
      if (harmonies.length === 0 || harmonies[0].at / div > EPS) {
        points.push({ q: 0, notes: carry[measureIndex], carried: true });
      }
      for (const h of harmonies) points.push({ q: h.at / div, notes: chordNotes(h.child) });
      points.forEach((point, i) => {
        const q1 = i + 1 < points.length ? points[i + 1].q : mt.length;
        if (!point.notes || q1 - point.q <= EPS) return;
        const start = timeAt(mt, point.q);
        const end = timeAt(mt, q1);
        const duration = (end - start) * CHORD_HOLD;
        const make = (midi: number, gain: number): PlayNote => ({
          id: `chord-${k}-${i}-${midi}`,
          part: chordPart,
          time: start,
          duration,
          midi,
          gain,
          measure: measureIndex,
          order: k,
          staff: 0,
          beat: mt.startBeat + point.q,
          beatEnd: mt.startBeat + q1,
          ...(point.carried ? { carried: true } : {}),
        });
        chords.push(make(point.notes.bass, CHORD_BASS_GAIN));
        for (const tone of point.notes.tones) chords.push(make(tone, CHORD_GAIN));
      });
    });
    chords.sort((a, b) => a.time - b.time || a.midi - b.midi);
  }

  const measures: PlayMeasure[] = times.map((m, k) => ({
    index: order[k],
    order: k,
    start: m.start,
    end: timeAt(m, m.length),
    startBeat: m.startBeat,
    lengthBeats: m.length,
  }));
  return { notes: result, chords, measures, total: clock };
}

/**
 * Các nhóm nốt (cùng thời điểm) của một tập nốt, theo thứ tự thời gian, để phát xem trước cả vùng chọn.
 * Dấu lặng và nốt không có cao độ bị bỏ qua.
 */
export function selectionGroups(doc: ScoreDocument, ids: Iterable<string>): number[][] {
  const infos = [...ids]
    .map((id) => doc.getInfo(id))
    .filter((n): n is NoteInfo => n !== undefined && !n.isRest && n.midi !== null);
  infos.sort((a, b) => a.measureIndex - b.measureIndex || a.onsetKey - b.onsetKey || (a.midi ?? 0) - (b.midi ?? 0));
  const groups: number[][] = [];
  let lastKey = '';
  for (const info of infos) {
    const key = `${info.partIndex}|${info.measureIndex}|${info.onsetKey}`;
    if (key !== lastKey) groups.push([]);
    groups[groups.length - 1].push(soundOf(info) as number);
    lastKey = key;
  }
  return groups;
}
