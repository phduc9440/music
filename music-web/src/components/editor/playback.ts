/**
 * Dựng lịch phát từ MusicXML để nghe thử bản nhạc (nút Phát) và để xem trước vùng chọn. Chỉ tính thời gian, cao độ và
 * âm lượng từ DOM, không dùng thư viện âm thanh.
 *
 * Cách tính:
 * - Một đồng hồ CHUNG cho mọi part, dựng theo từng ô nhịp (theo thứ tự phát): mỗi ô có bảng tempo từng đoạn (tempo đổi
 *   giữa ô) và bảng độ trễ fermata. Nốt nào kéo dài qua fermata thì dài ra, mọi part sau fermata đều chờ như nhau.
 * - Âm lượng (gain) theo mức to nhỏ gần nhất trước nốt của part đó, nội suy dọc theo cresc./dim.
 * - Độ dài nốt theo dấu thể hiện (staccato, tenuto...); nốt hoa mỹ lấy thời gian của nốt chính theo sau.
 */
import { playOrder } from './playOrder';
import type { NoteInfo, ScoreDocument } from './ScoreDocument';

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
  /** Các ô nhịp theo thứ tự phát. */
  measures: PlayMeasure[];
  /** Tổng thời lượng (giây). */
  total: number;
}

/** Âm lượng mặc định và vận tốc MIDI tương ứng (mf). */
export const DEFAULT_GAIN = 0.8;
export const DEFAULT_VELOCITY = 83;
/** Nốt ngân bình thường chỉ vang 90% độ dài để hai nốt liền nhau không dính. */
const LEGATO_FACTOR = 0.9;
const ARTICULATION_FACTOR = { staccatissimo: 0.25, staccato: 0.5, tenuto: 1 } as const;
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

/** Đổi vận tốc MIDI sang âm lượng 0–1 (mf = 0,8; tăng giảm dần chứ không tuyến tính hoàn toàn). */
export const velocityGain = (velocity: number): number =>
  Math.min(1, DEFAULT_GAIN * Math.pow(Math.max(velocity, 1) / DEFAULT_VELOCITY, 0.6));

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
  | { kind: 'tempo'; at: number; bpm: number }
  | { kind: 'level'; at: number; velocity: number }
  | { kind: 'accent'; at: number; peak?: number; after?: number }
  | { kind: 'wedge'; at: number; type: 'crescendo' | 'diminuendo' | 'stop'; number: string };

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
    else if (child.tagName === 'direction') {
      readDirection(child, Math.max(0, cursor + childNumber(child, 'offset')), items);
    } else if (child.tagName === 'sound') {
      const tempo = Number(child.getAttribute('tempo'));
      if (tempo > 0) items.push({ kind: 'tempo', at: cursor, bpm: tempo });
      const dynamics = Number(child.getAttribute('dynamics'));
      if (child.hasAttribute('dynamics') && dynamics > 0) items.push({ kind: 'level', at: cursor, velocity: dynamics });
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

/** Thời điểm (giây) của vị trí `q` trong ô: fermata kết thúc tại hoặc trước `q` đã làm mọi thứ sau nó chậm lại. */
const timeAt = (m: MeasureTime, q: number): number => {
  let seconds = m.start + baseAt(m.segments, q);
  for (const f of m.fermatas) if (f.pos <= q + EPS) seconds += f.extra;
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
}

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
  return LEGATO_FACTOR;
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
    const m: MeasureTime = { start: clock, startBeat: beatClock, length, segments, fermatas: [...fermatas.values()] };
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
      const at = (q: number): number => timeAt(mt, q);

      let graces: { item: Extract<Item, { kind: 'note' }>; info: NoteInfo; slash: boolean }[][] = [];
      let startQ = 0;
      let endQ = 0;
      for (const item of scanOf(measure).items) {
        if (item.kind === 'level' || item.kind === 'accent' || item.kind === 'wedge') {
          events.push({ time: at(item.at / div), item } as Event);
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
                  end: at(offset + lengths[gi]),
                  measure: measureIndex,
                  order: k,
                  staff: g.info.staff,
                  beat: mt.startBeat + offset,
                  beatEnd: mt.startBeat + offset + lengths[gi],
                  midi: soundOf(g.info) as number,
                  factor: 1,
                  accent: false,
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
          held.end = at(endQ);
          held.beatEnd = mt.startBeat + endQ;
          if (!hasTie(item.child, 'start')) pending.delete(key);
          continue;
        }
        const note: Building = {
          id: info.id,
          start: at(startQ),
          end: at(endQ),
          measure: measureIndex,
          order: k,
          staff: info.staff,
          beat: mt.startBeat + startQ,
          beatEnd: mt.startBeat + endQ,
          midi: soundOf(info) as number,
          factor: legato && articulationFactor(item.child) === LEGATO_FACTOR ? 1 : articulationFactor(item.child),
          accent: hasDeep(item.child, 'accent') || hasDeep(item.child, 'strong-accent'),
        };
        building.push(note);
        if (hasTie(item.child, 'start')) pending.set(key, note);
      }
    });
    const gains = assignGains(building, events);
    for (const note of building) {
      result.push({
        id: note.id,
        part: p,
        time: note.start,
        duration: (note.end - note.start) * note.factor,
        midi: note.midi,
        gain: gains.get(note) ?? DEFAULT_GAIN,
        measure: note.measure,
        order: note.order,
        staff: note.staff,
        beat: note.beat,
        beatEnd: note.beatEnd,
      });
    }
  });
  result.sort((a, b) => a.time - b.time || a.midi - b.midi);
  const measures: PlayMeasure[] = times.map((m, k) => ({
    index: order[k],
    order: k,
    start: m.start,
    end: timeAt(m, m.length),
    startBeat: m.startBeat,
    lengthBeats: m.length,
  }));
  return { notes: result, measures, total: clock };
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
